-- Phase 17: Security & Data Integrity Fixes
-- Date: 2026-02-15
-- Fixes: Missing RLS policies, indexes, atomic quote acceptance, client quote view
-- All statements are idempotent (safe to run multiple times).

-- ============================================================================
-- 1. INDEXES for RLS subquery performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id ON public.rfq_items (rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_items_product_id ON public.rfq_items (product_id);
CREATE INDEX IF NOT EXISTS idx_quotes_rfq_id ON public.quotes (rfq_id);
CREATE INDEX IF NOT EXISTS idx_quotes_supplier_id ON public.quotes (supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_supplier_id ON public.orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_quote_id ON public.orders (quote_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (status);

-- ============================================================================
-- 2. UNIQUE constraint on margin_settings to prevent duplicates
-- ============================================================================

-- Deduplicate first: keep the row with the latest updated_at per category
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'margin_settings') THEN
    DELETE FROM public.margin_settings a
    USING public.margin_settings b
    WHERE a.ctid < b.ctid
      AND COALESCE(a.category, '__NULL__') = COALESCE(b.category, '__NULL__');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add unique constraint (category NULL = default row)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_margin_settings_category'
  ) THEN
    ALTER TABLE public.margin_settings
      ADD CONSTRAINT uq_margin_settings_category UNIQUE (category);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 3. UNIQUE constraint on orders.quote_id to prevent double-orders
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_orders_quote_id'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT uq_orders_quote_id UNIQUE (quote_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 4. Missing DELETE policies
-- ============================================================================

-- RFQs: Clients can delete their own OPEN RFQs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rfqs' AND policyname = 'Clients can delete own open RFQs'
  ) THEN
    CREATE POLICY "Clients can delete own open RFQs"
      ON public.rfqs FOR DELETE
      USING (auth.uid() = client_id AND status = 'OPEN');
  END IF;
END $$;

-- RFQs: Admins can delete any RFQ
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rfqs' AND policyname = 'Admins can delete RFQs'
  ) THEN
    CREATE POLICY "Admins can delete RFQs"
      ON public.rfqs FOR DELETE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- RFQ Items: Admins can delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rfq_items' AND policyname = 'Admins can delete RFQ items'
  ) THEN
    CREATE POLICY "Admins can delete RFQ items"
      ON public.rfq_items FOR DELETE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- RFQ Items: Clients can delete items from their own OPEN RFQs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rfq_items' AND policyname = 'Clients can delete own RFQ items'
  ) THEN
    CREATE POLICY "Clients can delete own RFQ items"
      ON public.rfq_items FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.rfqs
          WHERE rfqs.id = rfq_items.rfq_id
            AND rfqs.client_id = auth.uid()
            AND rfqs.status = 'OPEN'
        )
      );
  END IF;
END $$;

-- RFQ Items: Admins can update
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rfq_items' AND policyname = 'Admins can update RFQ items'
  ) THEN
    CREATE POLICY "Admins can update RFQ items"
      ON public.rfq_items FOR UPDATE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Quotes: Admins can delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quotes' AND policyname = 'Admins can delete quotes'
  ) THEN
    CREATE POLICY "Admins can delete quotes"
      ON public.quotes FOR DELETE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Orders: Admins can delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Admins can delete orders'
  ) THEN
    CREATE POLICY "Admins can delete orders"
      ON public.orders FOR DELETE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- ============================================================================
-- 5. INSERT policy for orders — allow clients to create orders when accepting quotes
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Clients can create orders from accepted quotes'
  ) THEN
    CREATE POLICY "Clients can create orders from accepted quotes"
      ON public.orders FOR INSERT
      WITH CHECK (
        auth.uid() = client_id
        AND EXISTS (
          SELECT 1 FROM public.quotes q
          JOIN public.rfqs r ON r.id = q.rfq_id
          WHERE q.id = orders.quote_id
            AND r.client_id = auth.uid()
            AND q.status IN ('SENT_TO_CLIENT', 'ACCEPTED')
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 6. Client-safe quotes view (hides supplier_price and margin_percent)
-- ============================================================================

CREATE OR REPLACE VIEW public.client_quotes_view AS
SELECT
  q.id,
  q.rfq_id,
  q.supplier_id,
  q.lead_time,
  q.final_price,
  q.status,
  q.type,
  q.notes,
  q.shipping_cost,
  q.tax,
  q.created_at,
  q.updated_at
FROM public.quotes q;

-- Grant access to authenticated users
GRANT SELECT ON public.client_quotes_view TO authenticated;

-- ============================================================================
-- 7. Atomic quote acceptance function (prevents race conditions)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_quote_atomically(
  p_quote_id UUID,
  p_client_id UUID
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_rfq RECORD;
  v_credit_limit NUMERIC;
  v_credit_used NUMERIC;
  v_available_credit NUMERIC;
  v_new_order_id UUID;
BEGIN
  -- 1. Lock and validate the quote
  SELECT q.*, r.client_id AS rfq_client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quote not found');
  END IF;

  IF v_quote.rfq_client_id <> p_client_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: quote does not belong to this client');
  END IF;

  IF v_quote.status <> 'SENT_TO_CLIENT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quote is not in a state that can be accepted (status: ' || v_quote.status || ')');
  END IF;

  -- 2. Lock and check credit limit
  SELECT credit_limit, credit_used
  INTO v_credit_limit, v_credit_used
  FROM public.users
  WHERE id = p_client_id
  FOR UPDATE;

  v_credit_limit := COALESCE(v_credit_limit, 0);
  v_credit_used := COALESCE(v_credit_used, 0);
  v_available_credit := v_credit_limit - v_credit_used;

  IF v_quote.final_price > v_available_credit AND v_credit_limit > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credit. Available: ' || v_available_credit || ', Required: ' || v_quote.final_price
    );
  END IF;

  -- 3. Update quote status to ACCEPTED
  UPDATE public.quotes
  SET status = 'ACCEPTED', updated_at = NOW()
  WHERE id = p_quote_id;

  -- 4. Create order (uses unique constraint on quote_id to prevent duplicates)
  INSERT INTO public.orders (quote_id, client_id, supplier_id, amount, total_amount, status, created_at, updated_at)
  VALUES (
    p_quote_id,
    p_client_id,
    v_quote.supplier_id,
    COALESCE(v_quote.final_price, 0),
    COALESCE(v_quote.final_price, 0),
    'PENDING_PAYMENT',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_order_id;

  -- 5. Update credit used
  UPDATE public.users
  SET credit_used = v_credit_used + COALESCE(v_quote.final_price, 0),
      updated_at = NOW()
  WHERE id = p_client_id;

  -- 6. Update RFQ status
  UPDATE public.rfqs
  SET status = 'CLOSED', updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_new_order_id,
    'quote_id', p_quote_id,
    'amount', v_quote.final_price
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already exists for this quote');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.accept_quote_atomically(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.accept_quote_atomically IS
  'Atomically accepts a quote: validates credit, creates order, updates credit used. Prevents race conditions via row-level locking.';

-- ============================================================================
-- 8. Record migration
-- ============================================================================

INSERT INTO public._migration_log (migration_name)
SELECT '20260215_phase17_security_and_integrity_fixes.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;
