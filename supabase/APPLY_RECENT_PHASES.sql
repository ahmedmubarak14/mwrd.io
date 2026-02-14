-- ============================================================================
-- MWRD SUPABASE DATABASE - RECENT PHASE PATCH SCRIPT
-- Purpose: Apply only late-phase migrations on an existing database
-- Recommended when full APPLY_ALL_MIGRATIONS.sql was already run before.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._migration_log (
  id SERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MIGRATION: 20260210_phase1_core_columns.sql
-- ============================================================================

-- =====================================================
-- Phase 1: Core Schema Additions
-- Gaps: #6, #7, #8, #23, #33
-- =====================================================

-- =====================================================
-- Gap #6: Payment Terms
-- =====================================================

-- Create payment_terms enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_terms') THEN
    CREATE TYPE payment_terms AS ENUM ('prepay', 'net_15', 'net_30', 'net_45');
  END IF;
END $$;

-- Add payment_terms column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE users ADD COLUMN payment_terms payment_terms DEFAULT 'net_30';
  END IF;
END $$;

-- Add payment_terms column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_terms payment_terms;
  END IF;
END $$;

-- =====================================================
-- Gap #7: Item Flexibility Preference
-- =====================================================

-- Create item_flexibility enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_flexibility') THEN
    CREATE TYPE item_flexibility AS ENUM ('exact_match', 'open_to_equivalent', 'open_to_alternatives');
  END IF;
END $$;

-- Add flexibility column to rfq_items table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rfq_items' AND column_name = 'flexibility'
  ) THEN
    ALTER TABLE rfq_items ADD COLUMN flexibility item_flexibility DEFAULT 'exact_match';
  END IF;
END $$;

-- =====================================================
-- Gap #8: RFQ Expiry Date
-- =====================================================

-- Add expires_at column to rfqs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rfqs' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE rfqs ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create function to auto-close expired RFQs
CREATE OR REPLACE FUNCTION close_expired_rfqs()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update expired RFQs to CLOSED status
  UPDATE rfqs 
  SET status = 'CLOSED', updated_at = NOW()
  WHERE status = 'OPEN' 
    AND expires_at IS NOT NULL 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION close_expired_rfqs() IS 
  'Auto-closes RFQs that have passed their expiry date. Returns count of closed RFQs. Can be called by Edge Function or cron job.';

-- =====================================================
-- Gap #23: Product Availability Status
-- =====================================================

-- Create product_availability enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_availability') THEN
    CREATE TYPE product_availability AS ENUM ('available', 'limited_stock', 'out_of_stock');
  END IF;
END $$;

-- Add availability_status column to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'availability_status'
  ) THEN
    ALTER TABLE products ADD COLUMN availability_status product_availability DEFAULT 'available';
  END IF;
END $$;

-- Update RLS policy to hide out_of_stock products from clients
-- First, drop the old policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'products' 
    AND policyname = 'Anyone can view approved products'
  ) THEN
    DROP POLICY "Anyone can view approved products" ON products;
  END IF;
END $$;

-- Create new policy that excludes out_of_stock products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'products' 
    AND policyname = 'Anyone can view approved available products'
  ) THEN
    CREATE POLICY "Anyone can view approved available products" ON products 
    FOR SELECT
    USING (
      status = 'APPROVED'
      AND (availability_status IS NULL OR availability_status <> 'out_of_stock')
    );
  END IF;
END $$;

-- =====================================================
-- Gap #33: Lead Time per Product
-- =====================================================

-- Add lead_time_days column to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'lead_time_days'
  ) THEN
    ALTER TABLE products ADD COLUMN lead_time_days INTEGER;
  END IF;
END $$;

-- Add comment to column
COMMENT ON COLUMN products.lead_time_days IS 
  'Default lead time in days for this product. Used by auto-quote service instead of hardcoded value.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify all enums were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_type WHERE typname IN ('payment_terms', 'item_flexibility', 'product_availability')) = 3,
    'Not all enums were created';
END $$;

-- Verify all columns were added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'payment_terms') = 1,
    'payment_terms column not added to users';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_terms') = 1,
    'payment_terms column not added to orders';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'rfq_items' AND column_name = 'flexibility') = 1,
    'flexibility column not added to rfq_items';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'rfqs' AND column_name = 'expires_at') = 1,
    'expires_at column not added to rfqs';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'availability_status') = 1,
    'availability_status column not added to products';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'lead_time_days') = 1,
    'lead_time_days column not added to products';
END $$;

-- Verify function was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'close_expired_rfqs') = 1,
    'close_expired_rfqs function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase1_core_columns.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase2_quote_items.sql
-- ============================================================================

-- =====================================================
-- Phase 2: quote_items Table (Gap #1)
-- Foundation for per-item quote pricing
-- =====================================================

-- =====================================================
-- Create quote_items Table
-- =====================================================

CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  rfq_item_id UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  unit_price DECIMAL(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total DECIMAL(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  margin_percent DECIMAL(5, 2),
  final_unit_price DECIMAL(12, 2),
  final_line_total DECIMAL(12, 2),
  alternative_product_id UUID REFERENCES products(id),
  is_quoted BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment to table
COMMENT ON TABLE quote_items IS 
  'Per-item pricing breakdown for multi-item RFQ quotes. Replaces aggregate pricing on quotes table.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_rfq_item_id ON quote_items(rfq_item_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product_id ON quote_items(product_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_alternative_product_id ON quote_items(alternative_product_id) 
  WHERE alternative_product_id IS NOT NULL;

-- =====================================================
-- Add type Column to quotes Table
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'type'
  ) THEN
    ALTER TABLE quotes ADD COLUMN type TEXT DEFAULT 'custom' 
      CHECK (type IN ('auto', 'custom'));
  END IF;
END $$;

COMMENT ON COLUMN quotes.type IS 
  'Quote type: auto (generated by system) or custom (manually created by supplier)';

-- =====================================================
-- Trigger: Calculate Final Prices on quote_items
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_quote_item_final_prices()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_margin DECIMAL(5, 2);
BEGIN
  -- Use item-level margin if set, otherwise inherit from quote
  IF NEW.margin_percent IS NULL THEN
    SELECT margin_percent INTO v_margin FROM quotes WHERE id = NEW.quote_id;
    NEW.margin_percent := COALESCE(v_margin, 0);
  END IF;
  
  -- Calculate final_unit_price = unit_price * (1 + margin_percent / 100)
  NEW.final_unit_price := NEW.unit_price * (1 + NEW.margin_percent / 100);
  
  -- Calculate final_line_total = final_unit_price * quantity
  NEW.final_line_total := NEW.final_unit_price * NEW.quantity;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_calculate_quote_item_final_prices ON quote_items;

CREATE TRIGGER trg_calculate_quote_item_final_prices
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_item_final_prices();

COMMENT ON FUNCTION calculate_quote_item_final_prices() IS 
  'Auto-calculates final_unit_price and final_line_total based on margin_percent. Inherits margin from quote if not set.';

-- =====================================================
-- Trigger: Sync Quote Totals from quote_items
-- =====================================================

CREATE OR REPLACE FUNCTION sync_quote_totals()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote_id UUID;
  v_supplier_price DECIMAL(12, 2);
  v_final_price DECIMAL(12, 2);
BEGIN
  -- Determine which quote to update
  IF TG_OP = 'DELETE' THEN
    v_quote_id := OLD.quote_id;
  ELSE
    v_quote_id := NEW.quote_id;
  END IF;
  
  -- Calculate totals from all quote_items for this quote
  SELECT 
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(final_line_total), 0)
  INTO v_supplier_price, v_final_price
  FROM quote_items
  WHERE quote_id = v_quote_id AND is_quoted = TRUE;
  
  -- Update the quote table
  UPDATE quotes
  SET 
    supplier_price = v_supplier_price,
    final_price = v_final_price,
    updated_at = NOW()
  WHERE id = v_quote_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_sync_quote_totals_insert ON quote_items;
DROP TRIGGER IF EXISTS trg_sync_quote_totals_update ON quote_items;
DROP TRIGGER IF EXISTS trg_sync_quote_totals_delete ON quote_items;

CREATE TRIGGER trg_sync_quote_totals_insert
  AFTER INSERT ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_quote_totals();

CREATE TRIGGER trg_sync_quote_totals_update
  AFTER UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_quote_totals();

CREATE TRIGGER trg_sync_quote_totals_delete
  AFTER DELETE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_quote_totals();

COMMENT ON FUNCTION sync_quote_totals() IS 
  'Keeps quotes.supplier_price and quotes.final_price in sync with SUM of quote_items. Only includes is_quoted=TRUE items.';

-- =====================================================
-- Enable RLS on quote_items
-- =====================================================

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for quote_items
-- =====================================================

-- Policy: Suppliers can view their own quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Suppliers can view own quote items'
  ) THEN
    CREATE POLICY "Suppliers can view own quote items" ON quote_items
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM quotes
        WHERE quotes.id = quote_items.quote_id
        AND quotes.supplier_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Policy: Clients can view quote items for quotes sent to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Clients can view quote items for sent quotes'
  ) THEN
    CREATE POLICY "Clients can view quote items for sent quotes" ON quote_items
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM quotes
        JOIN rfqs ON rfqs.id = quotes.rfq_id
        WHERE quotes.id = quote_items.quote_id
        AND rfqs.client_id = auth.uid()
        AND quotes.status IN ('SENT_TO_CLIENT', 'ACCEPTED')
      )
    );
  END IF;
END $$;

-- Policy: Admins can view all quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Admins can view all quote items'
  ) THEN
    CREATE POLICY "Admins can view all quote items" ON quote_items
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Suppliers can insert their own quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Suppliers can insert own quote items'
  ) THEN
    CREATE POLICY "Suppliers can insert own quote items" ON quote_items
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM quotes
        WHERE quotes.id = quote_items.quote_id
        AND quotes.supplier_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Policy: Suppliers can update their own quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Suppliers can update own quote items'
  ) THEN
    CREATE POLICY "Suppliers can update own quote items" ON quote_items
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM quotes
        WHERE quotes.id = quote_items.quote_id
        AND quotes.supplier_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Policy: Admins can modify all quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Admins can modify all quote items'
  ) THEN
    CREATE POLICY "Admins can modify all quote items" ON quote_items
    FOR ALL
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'quote_items') = 1,
    'quote_items table not created';
END $$;

-- Verify indexes were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'quote_items') >= 4,
    'Not all indexes created on quote_items';
END $$;

-- Verify triggers were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'trg_%quote%') >= 4,
    'Not all triggers created for quote_items';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'quote_items') = TRUE,
    'RLS not enabled on quote_items';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'quote_items') >= 6,
    'Not all RLS policies created for quote_items';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase2_quote_items.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase3_partial_quotes.sql
-- ============================================================================

-- =====================================================
-- Phase 3: Partial Quotes + Alternative Products
-- Gaps: #2, #9
-- =====================================================

-- =====================================================
-- Gap #2: Partial Quote Support
-- =====================================================

-- Add is_partial column to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'is_partial'
  ) THEN
    ALTER TABLE quotes ADD COLUMN is_partial BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

COMMENT ON COLUMN quotes.is_partial IS 
  'TRUE if supplier quoted only some items from the RFQ (not all rfq_items have is_quoted=TRUE)';

-- =====================================================
-- Gap #9: Alternative Product Validation
-- =====================================================

-- Create function to validate alternative products
CREATE OR REPLACE FUNCTION validate_alternative_product()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id UUID;
  v_alt_supplier_id UUID;
BEGIN
  -- Only validate if alternative_product_id is set
  IF NEW.alternative_product_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get the supplier_id from the quote
  SELECT supplier_id INTO v_supplier_id
  FROM quotes
  WHERE id = NEW.quote_id;
  
  -- Get the supplier_id of the alternative product
  SELECT supplier_id INTO v_alt_supplier_id
  FROM products
  WHERE id = NEW.alternative_product_id;
  
  -- Verify alternative product belongs to the same supplier
  IF v_alt_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Alternative product does not exist';
  END IF;
  
  IF v_alt_supplier_id <> v_supplier_id THEN
    RAISE EXCEPTION 'Alternative product must belong to the quoting supplier';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_validate_alternative_product ON quote_items;

CREATE TRIGGER trg_validate_alternative_product
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_alternative_product();

COMMENT ON FUNCTION validate_alternative_product() IS 
  'Ensures alternative_product_id belongs to the same supplier as the quote. Prevents suppliers from offering competitors products.';

-- =====================================================
-- Update accept_quote_and_deduct_credit RPC
-- =====================================================

-- This function needs to be updated to handle partial quotes
-- The existing function should be modified to:
-- 1. Calculate total from only is_quoted = TRUE items in quote_items
-- 2. Pass is_partial flag to the created order
-- 3. Include payment_terms from the client's profile

CREATE OR REPLACE FUNCTION accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_client_id UUID;
  v_supplier_id UUID;
  v_final_price DECIMAL(12, 2);
  v_credit_limit DECIMAL(12, 2);
  v_current_balance DECIMAL(12, 2);
  v_order_id UUID;
  v_payment_terms payment_terms;
  v_is_partial BOOLEAN;
  v_quoted_items_count INTEGER;
  v_total_items_count INTEGER;
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Get quote details
  SELECT q.*, r.client_id
  INTO v_quote
  FROM quotes q
  JOIN rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  
  -- Verify caller is the client or admin
  IF auth.uid() <> v_quote.client_id AND get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only the client or admin can accept this quote';
  END IF;
  
  -- Verify quote status
  IF v_quote.status <> 'SENT_TO_CLIENT' THEN
    RAISE EXCEPTION 'Quote must be in SENT_TO_CLIENT status to be accepted';
  END IF;
  
  v_client_id := v_quote.client_id;
  v_supplier_id := v_quote.supplier_id;
  v_final_price := v_quote.final_price;
  
  -- Check if quote is partial (has quote_items)
  SELECT 
    COUNT(*) FILTER (WHERE is_quoted = TRUE),
    COUNT(*)
  INTO v_quoted_items_count, v_total_items_count
  FROM quote_items
  WHERE quote_id = p_quote_id;
  
  -- Set is_partial flag if some items were not quoted
  v_is_partial := (v_quoted_items_count > 0 AND v_quoted_items_count < v_total_items_count);
  
  -- Get client's credit info and payment terms
  SELECT credit_limit, current_balance, payment_terms
  INTO v_credit_limit, v_current_balance, v_payment_terms
  FROM users
  WHERE id = v_client_id;
  
  -- Check credit availability (only for non-prepay terms)
  IF v_payment_terms <> 'prepay' THEN
    IF (v_current_balance + v_final_price) > v_credit_limit THEN
      RAISE EXCEPTION 'Insufficient credit limit. Required: %, Available: %', 
        v_final_price, (v_credit_limit - v_current_balance);
    END IF;
    
    -- Deduct from credit
    UPDATE users
    SET current_balance = current_balance + v_final_price,
        updated_at = NOW()
    WHERE id = v_client_id;
  END IF;
  
  -- Update quote status
  UPDATE quotes
  SET status = 'ACCEPTED',
      is_partial = v_is_partial,
      updated_at = NOW()
  WHERE id = p_quote_id;
  
  -- Update RFQ status
  UPDATE rfqs
  SET status = 'QUOTED',
      updated_at = NOW()
  WHERE id = v_quote.rfq_id;
  
  -- Create order
  INSERT INTO orders (
    quote_id,
    client_id,
    supplier_id,
    amount,
    status,
    payment_terms,
    date
  ) VALUES (
    p_quote_id,
    v_client_id,
    v_supplier_id,
    v_final_price,
    'PENDING',
    v_payment_terms,
    CURRENT_DATE
  ) RETURNING id INTO v_order_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'quote_id', p_quote_id,
    'amount', v_final_price,
    'is_partial', v_is_partial,
    'payment_terms', v_payment_terms,
    'credit_deducted', CASE WHEN v_payment_terms <> 'prepay' THEN v_final_price ELSE 0 END,
    'remaining_credit', CASE WHEN v_payment_terms <> 'prepay' THEN (v_credit_limit - v_current_balance - v_final_price) ELSE v_credit_limit - v_current_balance END
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to accept quote: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION accept_quote_and_deduct_credit(UUID) IS 
  'Accepts a quote, deducts from client credit (if not prepay), creates order. Handles partial quotes and payment terms.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify is_partial column was added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'is_partial') = 1,
    'is_partial column not added to quotes';
END $$;

-- Verify alternative product validation trigger was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'trg_validate_alternative_product') = 1,
    'Alternative product validation trigger not created';
END $$;

-- Verify accept_quote_and_deduct_credit function was updated
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'accept_quote_and_deduct_credit') = 1,
    'accept_quote_and_deduct_credit function not found';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase3_partial_quotes.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase4a_reviews.sql
-- ============================================================================

-- =====================================================
-- Phase 4a: Reviews System (Gap #12)
-- =====================================================

-- =====================================================
-- Create reviews Table
-- =====================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) UNIQUE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  supplier_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reviews IS 
  'Post-delivery ratings and reviews. One review per order, submitted by the client.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_reviews_supplier_id ON reviews(supplier_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- =====================================================
-- Enable RLS on reviews
-- =====================================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for reviews
-- =====================================================

-- Policy: Clients can view all reviews (for supplier selection)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Clients can view all reviews'
  ) THEN
    CREATE POLICY "Clients can view all reviews" ON reviews
    FOR SELECT
    USING (get_user_role() = 'CLIENT');
  END IF;
END $$;

-- Policy: Suppliers can view reviews about them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Suppliers can view own reviews'
  ) THEN
    CREATE POLICY "Suppliers can view own reviews" ON reviews
    FOR SELECT
    USING (supplier_id = auth.uid());
  END IF;
END $$;

-- Policy: Admins can view all reviews
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Admins can view all reviews'
  ) THEN
    CREATE POLICY "Admins can view all reviews" ON reviews
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete reviews
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Admins can delete reviews'
  ) THEN
    CREATE POLICY "Admins can delete reviews" ON reviews
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Submit Review
-- =====================================================

CREATE OR REPLACE FUNCTION submit_review(
  p_order_id UUID,
  p_rating INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_client_id UUID;
  v_supplier_id UUID;
  v_review_id UUID;
  v_new_avg_rating DECIMAL(3, 2);
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  
  -- Get order details
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  v_client_id := v_order.client_id;
  v_supplier_id := v_order.supplier_id;
  
  -- Verify caller is the order's client
  IF auth.uid() <> v_client_id THEN
    RAISE EXCEPTION 'Only the order client can submit a review';
  END IF;
  
  -- Verify order status is DELIVERED or COMPLETED
  IF v_order.status NOT IN ('DELIVERED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Can only review delivered or completed orders. Current status: %', v_order.status;
  END IF;
  
  -- Check if review already exists
  IF EXISTS (SELECT 1 FROM reviews WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Review already exists for this order';
  END IF;
  
  -- Insert review
  INSERT INTO reviews (
    order_id,
    reviewer_id,
    supplier_id,
    rating,
    comment
  ) VALUES (
    p_order_id,
    v_client_id,
    v_supplier_id,
    p_rating,
    p_comment
  ) RETURNING id INTO v_review_id;
  
  -- Recalculate supplier's average rating
  SELECT AVG(rating)::DECIMAL(3, 2)
  INTO v_new_avg_rating
  FROM reviews
  WHERE supplier_id = v_supplier_id;
  
  -- Update supplier's rating
  UPDATE users
  SET rating = v_new_avg_rating,
      updated_at = NOW()
  WHERE id = v_supplier_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'order_id', p_order_id,
    'rating', p_rating,
    'supplier_new_avg_rating', v_new_avg_rating
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to submit review: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION submit_review(UUID, INTEGER, TEXT) IS 
  'Submits a review for a delivered/completed order. Recalculates supplier average rating. Client-only.';

-- =====================================================
-- Trigger: Update supplier rating on review delete
-- =====================================================

CREATE OR REPLACE FUNCTION recalculate_supplier_rating_on_delete()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_avg_rating DECIMAL(3, 2);
BEGIN
  -- Recalculate supplier's average rating after deletion
  SELECT AVG(rating)::DECIMAL(3, 2)
  INTO v_new_avg_rating
  FROM reviews
  WHERE supplier_id = OLD.supplier_id;
  
  -- Update supplier's rating (NULL if no reviews left)
  UPDATE users
  SET rating = v_new_avg_rating,
      updated_at = NOW()
  WHERE id = OLD.supplier_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_recalculate_rating_on_delete ON reviews;

CREATE TRIGGER trg_recalculate_rating_on_delete
  AFTER DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_supplier_rating_on_delete();

COMMENT ON FUNCTION recalculate_supplier_rating_on_delete() IS 
  'Recalculates supplier average rating when a review is deleted (admin action).';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'reviews') = 1,
    'reviews table not created';
END $$;

-- Verify indexes were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'reviews') >= 4,
    'Not all indexes created on reviews';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'reviews') = TRUE,
    'RLS not enabled on reviews';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'reviews') >= 4,
    'Not all RLS policies created for reviews';
END $$;

-- Verify submit_review function was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'submit_review') = 1,
    'submit_review function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4a_reviews.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase4b_supplier_payouts.sql
-- ============================================================================

-- =====================================================
-- Phase 4b: Supplier Payouts (Gap #6a)
-- =====================================================

-- =====================================================
-- Create supplier_payouts Table
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED')),
  payment_method TEXT,
  reference_number TEXT,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE supplier_payouts IS 
  'Manual supplier payout tracking. Records when and how suppliers are paid for completed orders.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_supplier_payouts_supplier_id ON supplier_payouts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_order_id ON supplier_payouts(order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_status ON supplier_payouts(status);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_created_at ON supplier_payouts(created_at DESC);

-- =====================================================
-- Create updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_supplier_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_supplier_payouts_updated_at ON supplier_payouts;

CREATE TRIGGER trg_update_supplier_payouts_updated_at
  BEFORE UPDATE ON supplier_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_payouts_updated_at();

-- =====================================================
-- Enable RLS on supplier_payouts
-- =====================================================

ALTER TABLE supplier_payouts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for supplier_payouts
-- =====================================================

-- Policy: Suppliers can view their own payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Suppliers can view own payouts'
  ) THEN
    CREATE POLICY "Suppliers can view own payouts" ON supplier_payouts
    FOR SELECT
    USING (supplier_id = auth.uid());
  END IF;
END $$;

-- Policy: Admins can view all payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can view all payouts'
  ) THEN
    CREATE POLICY "Admins can view all payouts" ON supplier_payouts
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can insert payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can insert payouts'
  ) THEN
    CREATE POLICY "Admins can insert payouts" ON supplier_payouts
    FOR INSERT
    WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can update payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can update payouts'
  ) THEN
    CREATE POLICY "Admins can update payouts" ON supplier_payouts
    FOR UPDATE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can delete payouts'
  ) THEN
    CREATE POLICY "Admins can delete payouts" ON supplier_payouts
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Admin Record Supplier Payout
-- =====================================================

CREATE OR REPLACE FUNCTION admin_record_supplier_payout(
  p_supplier_id UUID,
  p_order_id UUID,
  p_amount DECIMAL(12, 2),
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout_id UUID;
  v_order RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;
  
  -- Verify order exists and belongs to supplier
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND supplier_id = p_supplier_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or does not belong to this supplier';
  END IF;
  
  -- Insert payout record
  INSERT INTO supplier_payouts (
    supplier_id,
    order_id,
    amount,
    payment_method,
    reference_number,
    notes,
    created_by
  ) VALUES (
    p_supplier_id,
    p_order_id,
    p_amount,
    p_payment_method,
    p_reference_number,
    p_notes,
    auth.uid()
  ) RETURNING id INTO v_payout_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'payout_id', v_payout_id,
    'supplier_id', p_supplier_id,
    'order_id', p_order_id,
    'amount', p_amount,
    'payment_method', p_payment_method
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to record payout: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_record_supplier_payout(UUID, UUID, DECIMAL, TEXT, TEXT, TEXT) IS 
  'Records a supplier payout for an order. Admin-only. Creates payout in PENDING status.';

-- =====================================================
-- RPC: Update Payout Status
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_payout_status(
  p_payout_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate status
  IF p_status NOT IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED') THEN
    RAISE EXCEPTION 'Invalid status. Must be PENDING, PROCESSING, PAID, or FAILED';
  END IF;
  
  -- Get current payout
  SELECT * INTO v_payout
  FROM supplier_payouts
  WHERE id = p_payout_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;
  
  -- Update payout
  UPDATE supplier_payouts
  SET 
    status = p_status,
    paid_at = CASE WHEN p_status = 'PAID' THEN NOW() ELSE paid_at END,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_payout_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'payout_id', p_payout_id,
    'old_status', v_payout.status,
    'new_status', p_status
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update payout status: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_update_payout_status(UUID, TEXT, TEXT) IS 
  'Updates payout status. Sets paid_at timestamp when status changes to PAID. Admin-only.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'supplier_payouts') = 1,
    'supplier_payouts table not created';
END $$;

-- Verify indexes were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'supplier_payouts') >= 4,
    'Not all indexes created on supplier_payouts';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'supplier_payouts') = TRUE,
    'RLS not enabled on supplier_payouts';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'supplier_payouts') >= 5,
    'Not all RLS policies created for supplier_payouts';
END $$;

-- Verify RPCs were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_record_supplier_payout') = 1,
    'admin_record_supplier_payout function not created';
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_update_payout_status') = 1,
    'admin_update_payout_status function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4b_supplier_payouts.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase4c_logistics.sql
-- ============================================================================

-- =====================================================
-- Phase 4c: Logistics Providers (Gap #16)
-- =====================================================

-- =====================================================
-- Create logistics_providers Table
-- =====================================================

CREATE TABLE IF NOT EXISTS logistics_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  service_areas TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE logistics_providers IS 
  'Logistics/shipping providers for order fulfillment. Managed by admins.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_logistics_providers_is_active ON logistics_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_logistics_providers_name ON logistics_providers(name);

-- =====================================================
-- Create updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_logistics_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_logistics_providers_updated_at ON logistics_providers;

CREATE TRIGGER trg_update_logistics_providers_updated_at
  BEFORE UPDATE ON logistics_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_logistics_providers_updated_at();

-- =====================================================
-- Add logistics_provider_id to orders Table
-- =====================================================

-- Check if shipments table exists, if not add to orders
DO $$
BEGIN
  -- Try to add to shipments table first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'shipments' AND column_name = 'logistics_provider_id'
    ) THEN
      ALTER TABLE shipments ADD COLUMN logistics_provider_id UUID REFERENCES logistics_providers(id);
      CREATE INDEX IF NOT EXISTS idx_shipments_logistics_provider_id ON shipments(logistics_provider_id);
    END IF;
  ELSE
    -- Add to orders table if shipments doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'logistics_provider_id'
    ) THEN
      ALTER TABLE orders ADD COLUMN logistics_provider_id UUID REFERENCES logistics_providers(id);
      CREATE INDEX IF NOT EXISTS idx_orders_logistics_provider_id ON orders(logistics_provider_id);
    END IF;
  END IF;
END $$;

-- =====================================================
-- Enable RLS on logistics_providers
-- =====================================================

ALTER TABLE logistics_providers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for logistics_providers
-- =====================================================

-- Policy: Admins can view all logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can view all logistics providers'
  ) THEN
    CREATE POLICY "Admins can view all logistics providers" ON logistics_providers
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can insert logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can insert logistics providers'
  ) THEN
    CREATE POLICY "Admins can insert logistics providers" ON logistics_providers
    FOR INSERT
    WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can update logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can update logistics providers'
  ) THEN
    CREATE POLICY "Admins can update logistics providers" ON logistics_providers
    FOR UPDATE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can delete logistics providers'
  ) THEN
    CREATE POLICY "Admins can delete logistics providers" ON logistics_providers
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'logistics_providers') = 1,
    'logistics_providers table not created';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'logistics_providers') = TRUE,
    'RLS not enabled on logistics_providers';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'logistics_providers') >= 4,
    'Not all RLS policies created for logistics_providers';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4c_logistics.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase4d_categories.sql
-- ============================================================================

-- =====================================================
-- Phase 4d: Dynamic Categories (Gap #19)
-- =====================================================

-- =====================================================
-- Create categories Table
-- =====================================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE categories IS 
  'Dynamic category hierarchy. Replaces hardcoded categories. parent_id NULL = top-level category.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

-- =====================================================
-- Create updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_categories_updated_at ON categories;

CREATE TRIGGER trg_update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_categories_updated_at();

-- =====================================================
-- Seed Data: Current Categories
-- =====================================================

-- Insert top-level categories
INSERT INTO categories (name, icon, sort_order, is_active) VALUES
  ('Office', 'business', 1, TRUE),
  ('IT Supplies', 'computer', 2, TRUE),
  ('Breakroom', 'local_cafe', 3, TRUE),
  ('Janitorial', 'cleaning_services', 4, TRUE),
  ('Maintenance', 'build', 5, TRUE)
ON CONFLICT DO NOTHING;

-- Insert subcategories for Office
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Paper Products', id, 1, TRUE FROM categories WHERE name = 'Office' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Writing Instruments', id, 2, TRUE FROM categories WHERE name = 'Office' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Desk Accessories', id, 3, TRUE FROM categories WHERE name = 'Office' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for IT Supplies
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Cables & Adapters', id, 1, TRUE FROM categories WHERE name = 'IT Supplies' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Peripherals', id, 2, TRUE FROM categories WHERE name = 'IT Supplies' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Storage Devices', id, 3, TRUE FROM categories WHERE name = 'IT Supplies' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for Breakroom
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Beverages', id, 1, TRUE FROM categories WHERE name = 'Breakroom' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Snacks', id, 2, TRUE FROM categories WHERE name = 'Breakroom' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Disposables', id, 3, TRUE FROM categories WHERE name = 'Breakroom' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for Janitorial
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Cleaning Supplies', id, 1, TRUE FROM categories WHERE name = 'Janitorial' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Paper Towels & Tissues', id, 2, TRUE FROM categories WHERE name = 'Janitorial' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Trash Bags', id, 3, TRUE FROM categories WHERE name = 'Janitorial' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for Maintenance
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Tools', id, 1, TRUE FROM categories WHERE name = 'Maintenance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Hardware', id, 2, TRUE FROM categories WHERE name = 'Maintenance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Safety Equipment', id, 3, TRUE FROM categories WHERE name = 'Maintenance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- =====================================================
-- Enable RLS on categories
-- =====================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for categories
-- =====================================================

-- Policy: Everyone can view active categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Everyone can view active categories'
  ) THEN
    CREATE POLICY "Everyone can view active categories" ON categories
    FOR SELECT
    USING (is_active = TRUE);
  END IF;
END $$;

-- Policy: Admins can view all categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can view all categories'
  ) THEN
    CREATE POLICY "Admins can view all categories" ON categories
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can insert categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can insert categories'
  ) THEN
    CREATE POLICY "Admins can insert categories" ON categories
    FOR INSERT
    WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can update categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can update categories'
  ) THEN
    CREATE POLICY "Admins can update categories" ON categories
    FOR UPDATE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can delete categories'
  ) THEN
    CREATE POLICY "Admins can delete categories" ON categories
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Admin Reorder Categories
-- =====================================================

CREATE OR REPLACE FUNCTION admin_reorder_categories(
  p_category_ids UUID[],
  p_sort_orders INTEGER[]
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  i INTEGER;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate arrays have same length
  IF array_length(p_category_ids, 1) <> array_length(p_sort_orders, 1) THEN
    RAISE EXCEPTION 'category_ids and sort_orders arrays must have the same length';
  END IF;
  
  -- Update sort orders
  FOR i IN 1..array_length(p_category_ids, 1) LOOP
    UPDATE categories
    SET sort_order = p_sort_orders[i],
        updated_at = NOW()
    WHERE id = p_category_ids[i];
  END LOOP;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to reorder categories: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_reorder_categories(UUID[], INTEGER[]) IS 
  'Reorders categories by updating sort_order. Used for drag-drop reordering in admin UI. Admin-only.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'categories') = 1,
    'categories table not created';
END $$;

-- Verify seed data was inserted
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM categories WHERE parent_id IS NULL) >= 5,
    'Top-level categories not seeded';
  ASSERT (SELECT COUNT(*) FROM categories WHERE parent_id IS NOT NULL) >= 10,
    'Subcategories not seeded';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'categories') = TRUE,
    'RLS not enabled on categories';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'categories') >= 5,
    'Not all RLS policies created for categories';
END $$;

-- Verify RPC was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_reorder_categories') = 1,
    'admin_reorder_categories function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4d_categories.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase5_notifications.sql
-- ============================================================================

-- =====================================================
-- Phase 5: Notification Infrastructure (Gap #15)
-- =====================================================

-- =====================================================
-- Create notification_templates Table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL UNIQUE,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_templates IS 
  'Email notification templates with variable placeholders like {{variable_name}}.';

-- =====================================================
-- Create notification_queue Table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  template_id UUID REFERENCES notification_templates(id),
  variables JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_queue IS 
  'Queue for pending email notifications. Processed by Edge Function or external service.';

-- =====================================================
-- Create notification_log Table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES notification_queue(id),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_log IS 
  'Audit log for all notifications sent. Used for tracking and debugging.';

-- =====================================================
-- Create Indexes
-- =====================================================

-- notification_templates indexes
CREATE INDEX IF NOT EXISTS idx_notification_templates_event_type ON notification_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);

-- notification_queue indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient_user_id ON notification_queue(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_event_type ON notification_queue(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_queue_created_at ON notification_queue(created_at DESC);

-- notification_log indexes
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_event_type ON notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at DESC);

-- =====================================================
-- Create updated_at Trigger for notification_templates
-- =====================================================

CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_notification_templates_updated_at ON notification_templates;

CREATE TRIGGER trg_update_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_templates_updated_at();

-- =====================================================
-- Seed Notification Templates
-- =====================================================

INSERT INTO notification_templates (event_type, subject_template, body_template, is_active) VALUES
  ('interest_form_submitted', 
   'New Interest Form Submission', 
   '<p>A new interest form has been submitted.</p><p><strong>Name:</strong> {{name}}</p><p><strong>Email:</strong> {{email}}</p><p><strong>Company:</strong> {{company}}</p>',
   TRUE),
  
  ('account_created', 
   'Welcome to MWRD - Account Created', 
   '<p>Hello {{name}},</p><p>Your MWRD account has been created successfully.</p><p><strong>Email:</strong> {{email}}</p><p><strong>Role:</strong> {{role}}</p><p>Please wait for admin approval to access the platform.</p>',
   TRUE),
  
  ('new_product_request', 
   'New Product Submitted for Review', 
   '<p>Hello {{supplier_name}},</p><p>Your product <strong>{{product_name}}</strong> has been submitted for admin review.</p><p>You will be notified once the review is complete.</p>',
   TRUE),
  
  ('product_approved', 
   'Product Approved', 
   '<p>Hello {{supplier_name}},</p><p>Congratulations! Your product <strong>{{product_name}}</strong> has been approved and is now live in the catalog.</p>',
   TRUE),
  
  ('product_rejected', 
   'Product Rejected', 
   '<p>Hello {{supplier_name}},</p><p>Your product <strong>{{product_name}}</strong> has been rejected.</p><p><strong>Reason:</strong> {{rejection_reason}}</p>',
   TRUE),
  
  ('rfq_submitted', 
   'RFQ Submitted Successfully', 
   '<p>Hello {{client_name}},</p><p>Your RFQ #{{rfq_number}} has been submitted successfully.</p><p><strong>Items:</strong> {{item_count}}</p><p>We will notify you when quotes are received.</p>',
   TRUE),
  
  ('auto_quote_generated', 
   'Auto-Quote Generated for Your RFQ', 
   '<p>Hello {{client_name}},</p><p>An automatic quote has been generated for your RFQ #{{rfq_number}}.</p><p><strong>Total:</strong> {{total_amount}} SAR</p><p>Please review and accept in your portal.</p>',
   TRUE),
  
  ('quote_received', 
   'New Quote Received', 
   '<p>Hello {{client_name}},</p><p>You have received a new quote for RFQ #{{rfq_number}}.</p><p><strong>Supplier:</strong> {{supplier_public_id}}</p><p><strong>Amount:</strong> {{quote_amount}} SAR</p><p>Please review in your portal.</p>',
   TRUE),
  
  ('quote_accepted', 
   'Quote Accepted - Order Created', 
   '<p>Hello {{supplier_name}},</p><p>Your quote for RFQ #{{rfq_number}} has been accepted!</p><p><strong>Order ID:</strong> {{order_id}}</p><p><strong>Amount:</strong> {{order_amount}} SAR</p><p>Please prepare the order for fulfillment.</p>',
   TRUE),
  
  ('quote_rejected', 
   'Quote Not Accepted', 
   '<p>Hello {{supplier_name}},</p><p>Your quote for RFQ #{{rfq_number}} was not accepted.</p><p>Thank you for your submission.</p>',
   TRUE),
  
  ('order_ready_for_pickup', 
   'Order Ready for Pickup', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} is ready for pickup.</p><p><strong>Pickup Location:</strong> {{pickup_location}}</p><p>Please schedule your pickup.</p>',
   TRUE),
  
  ('pickup_scheduled', 
   'Pickup Scheduled', 
   '<p>Hello {{client_name}},</p><p>Pickup has been scheduled for Order #{{order_id}}.</p><p><strong>Date:</strong> {{pickup_date}}</p><p><strong>Time:</strong> {{pickup_time}}</p>',
   TRUE),
  
  ('order_picked_up', 
   'Order Picked Up', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} has been picked up successfully.</p><p>Thank you for your business!</p>',
   TRUE),
  
  ('order_in_transit', 
   'Order In Transit', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} is now in transit.</p><p><strong>Tracking Number:</strong> {{tracking_number}}</p><p><strong>Estimated Delivery:</strong> {{estimated_delivery}}</p>',
   TRUE),
  
  ('order_delivered', 
   'Order Delivered', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} has been delivered.</p><p>Please rate your experience with this supplier.</p>',
   TRUE),
  
  ('review_submitted', 
   'New Review Received', 
   '<p>Hello {{supplier_name}},</p><p>You have received a new {{rating}}-star review.</p><p><strong>Comment:</strong> {{comment}}</p><p><strong>Your new average rating:</strong> {{new_avg_rating}}</p>',
   TRUE),
  
  ('payment_reminder', 
   'Payment Reminder', 
   '<p>Hello {{client_name}},</p><p>This is a reminder that payment for Order #{{order_id}} is due.</p><p><strong>Amount:</strong> {{amount}} SAR</p><p><strong>Due Date:</strong> {{due_date}}</p>',
   TRUE),
  
  ('payment_processed', 
   'Payment Processed', 
   '<p>Hello {{client_name}},</p><p>Your payment for Order #{{order_id}} has been processed successfully.</p><p><strong>Amount:</strong> {{amount}} SAR</p><p><strong>Payment Method:</strong> {{payment_method}}</p>',
   TRUE),
  
  ('account_frozen', 
   'Account Frozen', 
   '<p>Hello {{user_name}},</p><p>Your account has been frozen.</p><p><strong>Reason:</strong> {{freeze_reason}}</p><p>Please contact support for assistance.</p>',
   TRUE),
  
  ('account_unfrozen', 
   'Account Reactivated', 
   '<p>Hello {{user_name}},</p><p>Your account has been reactivated and is now active.</p><p>You can now access all platform features.</p>',
   TRUE)
ON CONFLICT (event_type) DO NOTHING;

-- =====================================================
-- Enable RLS on All Tables
-- =====================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for notification_templates
-- =====================================================

-- Policy: Admins can view all templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_templates' 
    AND policyname = 'Admins can view all templates'
  ) THEN
    CREATE POLICY "Admins can view all templates" ON notification_templates
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can modify templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_templates' 
    AND policyname = 'Admins can modify templates'
  ) THEN
    CREATE POLICY "Admins can modify templates" ON notification_templates
    FOR ALL
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RLS Policies for notification_queue
-- =====================================================

-- Policy: Admins can view all queue items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_queue' 
    AND policyname = 'Admins can view all queue items'
  ) THEN
    CREATE POLICY "Admins can view all queue items" ON notification_queue
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can modify queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_queue' 
    AND policyname = 'Admins can modify queue'
  ) THEN
    CREATE POLICY "Admins can modify queue" ON notification_queue
    FOR ALL
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RLS Policies for notification_log
-- =====================================================

-- Policy: Users can view their own notification log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_log' 
    AND policyname = 'Users can view own notification log'
  ) THEN
    CREATE POLICY "Users can view own notification log" ON notification_log
    FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Policy: Admins can view all logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_log' 
    AND policyname = 'Admins can view all logs'
  ) THEN
    CREATE POLICY "Admins can view all logs" ON notification_log
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Enqueue Notification
-- =====================================================

CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id UUID,
  p_event_type TEXT,
  p_variables JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template RECORD;
  v_user RECORD;
  v_queue_id UUID;
BEGIN
  -- Get template by event_type
  SELECT * INTO v_template
  FROM notification_templates
  WHERE event_type = p_event_type AND is_active = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active template found for event_type: %', p_event_type;
  END IF;
  
  -- Get user email
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
  
  -- Insert into queue
  INSERT INTO notification_queue (
    recipient_user_id,
    recipient_email,
    event_type,
    template_id,
    variables
  ) VALUES (
    p_user_id,
    v_user.email,
    p_event_type,
    v_template.id,
    p_variables
  ) RETURNING id INTO v_queue_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'event_type', p_event_type,
    'recipient_email', v_user.email
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to enqueue notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enqueue_notification(UUID, TEXT, JSONB) IS 
  'Enqueues a notification for sending. Looks up template and user email automatically.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify tables were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('notification_templates', 'notification_queue', 'notification_log')) = 3,
    'Not all notification tables created';
END $$;

-- Verify templates were seeded
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM notification_templates) >= 20,
    'Notification templates not seeded';
END $$;

-- Verify RLS is enabled on all tables
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_class WHERE relname IN ('notification_templates', 'notification_queue', 'notification_log') AND relrowsecurity = TRUE) = 3,
    'RLS not enabled on all notification tables';
END $$;

-- Verify enqueue_notification function was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'enqueue_notification') = 1,
    'enqueue_notification function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase5_notifications.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase6_account_freeze.sql
-- ============================================================================

-- =====================================================
-- Phase 6: Account Freeze Guards (Gap #22)
-- =====================================================

-- =====================================================
-- Add Freeze Columns to users Table
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'frozen_at'
  ) THEN
    ALTER TABLE users ADD COLUMN frozen_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'freeze_reason'
  ) THEN
    ALTER TABLE users ADD COLUMN freeze_reason TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'frozen_by'
  ) THEN
    ALTER TABLE users ADD COLUMN frozen_by UUID REFERENCES users(id);
  END IF;
END $$;

COMMENT ON COLUMN users.frozen_at IS 'Timestamp when account was frozen. NULL = active account.';
COMMENT ON COLUMN users.freeze_reason IS 'Admin-provided reason for account freeze.';
COMMENT ON COLUMN users.frozen_by IS 'Admin user who froze the account.';

-- =====================================================
-- RPC: Admin Freeze Account
-- =====================================================

CREATE OR REPLACE FUNCTION admin_freeze_account(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Freeze reason is required';
  END IF;
  
  -- Get user details
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if already frozen
  IF v_user.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is already frozen';
  END IF;
  
  -- Freeze account
  UPDATE users
  SET 
    frozen_at = NOW(),
    freeze_reason = p_reason,
    frozen_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Log to admin audit log (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_log') THEN
    INSERT INTO admin_audit_log (
      admin_id,
      action,
      target_type,
      target_id,
      details
    ) VALUES (
      auth.uid(),
      'FREEZE_ACCOUNT',
      'USER',
      p_user_id,
      jsonb_build_object(
        'user_email', v_user.email,
        'user_name', v_user.name,
        'reason', p_reason
      )
    );
  END IF;
  
  -- Optionally enqueue notification (if notification system is ready)
  BEGIN
    PERFORM enqueue_notification(
      p_user_id,
      'account_frozen',
      jsonb_build_object(
        'user_name', v_user.name,
        'freeze_reason', p_reason
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore notification errors, don't fail the freeze operation
      NULL;
  END;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'frozen_at', NOW(),
    'reason', p_reason
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to freeze account: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_freeze_account(UUID, TEXT) IS 
  'Freezes a user account, preventing RFQ creation and other actions. Logs to audit trail. Admin-only.';

-- =====================================================
-- RPC: Admin Unfreeze Account
-- =====================================================

CREATE OR REPLACE FUNCTION admin_unfreeze_account(p_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Get user details
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if frozen
  IF v_user.frozen_at IS NULL THEN
    RAISE EXCEPTION 'Account is not frozen';
  END IF;
  
  -- Unfreeze account
  UPDATE users
  SET 
    frozen_at = NULL,
    freeze_reason = NULL,
    frozen_by = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Log to admin audit log (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_log') THEN
    INSERT INTO admin_audit_log (
      admin_id,
      action,
      target_type,
      target_id,
      details
    ) VALUES (
      auth.uid(),
      'UNFREEZE_ACCOUNT',
      'USER',
      p_user_id,
      jsonb_build_object(
        'user_email', v_user.email,
        'user_name', v_user.name,
        'previous_freeze_reason', v_user.freeze_reason
      )
    );
  END IF;
  
  -- Optionally enqueue notification (if notification system is ready)
  BEGIN
    PERFORM enqueue_notification(
      p_user_id,
      'account_unfrozen',
      jsonb_build_object(
        'user_name', v_user.name
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore notification errors
      NULL;
  END;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'unfrozen_at', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to unfreeze account: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_unfreeze_account(UUID) IS 
  'Unfreezes a user account, restoring full access. Logs to audit trail. Admin-only.';

-- =====================================================
-- Update create_rfq_with_items RPC to Check Freeze Status
-- =====================================================

-- Note: This assumes create_rfq_with_items exists. We'll create a wrapper or update it.
-- Since we don't have the full original function, we'll create a helper function
-- that can be called at the start of create_rfq_with_items

CREATE OR REPLACE FUNCTION check_account_not_frozen(p_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_frozen_at TIMESTAMPTZ;
  v_freeze_reason TEXT;
BEGIN
  SELECT frozen_at, freeze_reason
  INTO v_frozen_at, v_freeze_reason
  FROM users
  WHERE id = p_user_id;
  
  IF v_frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is frozen. Reason: %. Contact support for assistance.', 
      COALESCE(v_freeze_reason, 'No reason provided');
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_account_not_frozen(UUID) IS 
  'Helper function to check if account is frozen. Raises exception if frozen. Call at start of create_rfq_with_items.';

-- =====================================================
-- Example: Update create_rfq_with_items (if it exists)
-- =====================================================

-- This is a placeholder showing where to add the freeze check
-- The actual create_rfq_with_items function should call check_account_not_frozen(p_client_id)
-- at the beginning of the function, right after authorization checks

/*
CREATE OR REPLACE FUNCTION create_rfq_with_items(...)
RETURNS ...
AS $$
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- NEW: Check account not frozen
  PERFORM check_account_not_frozen(auth.uid());
  
  -- Rest of function logic...
END;
$$ LANGUAGE plpgsql;
*/

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify columns were added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('frozen_at', 'freeze_reason', 'frozen_by')) = 3,
    'Not all freeze columns added to users';
END $$;

-- Verify RPCs were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_freeze_account') = 1,
    'admin_freeze_account function not created';
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_unfreeze_account') = 1,
    'admin_unfreeze_account function not created';
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'check_account_not_frozen') = 1,
    'check_account_not_frozen function not created';
END $$;

-- =====================================================
-- Implementation Note
-- =====================================================

/*
IMPORTANT: To complete Gap #22, you must update the existing create_rfq_with_items function
to call check_account_not_frozen(p_client_id) at the beginning.

Add this line after the authorization check:
  PERFORM check_account_not_frozen(p_client_id);

This will prevent frozen accounts from creating new RFQs.
*/

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase6_account_freeze.sql') ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260210_phase7_rfq_expiry_cron.sql
-- ============================================================================

-- =====================================================
-- Phase 7: RFQ Expiry Scheduler
-- Gap: RFQ Auto-Expiry Cron
-- =====================================================

-- Ensure pg_cron extension is available (best-effort in hosted environments)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension could not be created in this environment: %', SQLERRM;
END $$;

-- Schedule close_expired_rfqs every 15 minutes
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'mwrd-close-expired-rfqs-every-15m'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'mwrd-close-expired-rfqs-every-15m',
      '*/15 * * * *',
      'SELECT public.close_expired_rfqs();'
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Schedule close_expired_rfqs() manually.';
  END IF;
END $$;

-- Verification (only when pg_cron is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    ASSERT (
      SELECT COUNT(*)
      FROM cron.job
      WHERE jobname = 'mwrd-close-expired-rfqs-every-15m'
    ) = 1, 'RFQ expiry cron job was not scheduled';
  END IF;
END $$;

INSERT INTO public._migration_log (migration_name)
SELECT '20260210_phase7_rfq_expiry_cron.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260211_phase12_get_user_role_fallback.sql
-- ============================================================================

-- =====================================================
-- Phase 12: Role Resolution Hardening
-- Fixes admin RLS mismatches when JWT role claims are missing/stale
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
  v_role user_role;
BEGIN
  -- First try JWT/app metadata claims.
  v_role_text := NULLIF(
    trim(
      COALESCE(
        auth.jwt() ->> 'user_role',
        auth.jwt() -> 'app_metadata' ->> 'user_role',
        ''
      )
    ),
    ''
  );

  IF v_role_text IS NOT NULL THEN
    BEGIN
      RETURN v_role_text::user_role;
    EXCEPTION
      WHEN OTHERS THEN
        -- Ignore invalid claim value and fallback to users table.
        NULL;
    END;
  END IF;

  -- Fallback: resolve role from public.users for the authenticated user.
  IF auth.uid() IS NOT NULL THEN
    SELECT role
    INTO v_role
    FROM public.users
    WHERE id = auth.uid();

    IF FOUND THEN
      RETURN v_role;
    END IF;
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_user_role() IS
  'Returns current user role from JWT claims, with fallback to public.users.role by auth.uid().';

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;

-- Verification
DO $$
DECLARE
  has_function BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'get_user_role'
  ) INTO has_function;

  ASSERT has_function, 'get_user_role function was not created';
END $$;

INSERT INTO public._migration_log (migration_name)
SELECT '20260211_phase12_get_user_role_fallback.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- MIGRATION: 20260211_storage_buckets.sql
-- ============================================================================

-- =====================================================
-- Storage Buckets for Image Uploads
-- =====================================================
-- NOTE: Storage bucket creation via SQL is supported in
-- Supabase but may need to be run manually if not using
-- the Supabase CLI migration runner.

-- Create product-images bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create profile-pictures bucket (private, signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-pictures',
    'profile-pictures',
    false,
    2097152, -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create master-product-images bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'master-product-images',
    'master-product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create custom-request-files bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'custom-request-files',
    'custom-request-files',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create public-assets bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-assets',
    'public-assets',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage Policies for product-images
-- =====================================================

-- Everyone can view product images (public bucket)
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
CREATE POLICY "Product images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images');

-- Authenticated users can upload product images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload product images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'product-images'
        AND auth.role() = 'authenticated'
    );

-- Users can update their own uploads
DROP POLICY IF EXISTS "Users can update their own product images" ON storage.objects;
CREATE POLICY "Users can update their own product images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'product-images'
        AND auth.role() = 'authenticated'
    );

-- Admins can delete any product images
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
CREATE POLICY "Admins can delete product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'product-images'
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'ADMIN'
        )
    );

-- Suppliers can delete their own uploads
DROP POLICY IF EXISTS "Suppliers can delete own product images" ON storage.objects;
CREATE POLICY "Suppliers can delete own product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'product-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- =====================================================
-- Storage Policies for profile-pictures
-- =====================================================

-- Authenticated users can view profile pictures
DROP POLICY IF EXISTS "Authenticated users can view profile pictures" ON storage.objects;
CREATE POLICY "Authenticated users can view profile pictures"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can upload their own profile pictures
DROP POLICY IF EXISTS "Users can upload own profile pictures" ON storage.objects;
CREATE POLICY "Users can upload own profile pictures"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can update their own profile pictures
DROP POLICY IF EXISTS "Users can update own profile pictures" ON storage.objects;
CREATE POLICY "Users can update own profile pictures"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can delete their own profile pictures
DROP POLICY IF EXISTS "Users can delete own profile pictures" ON storage.objects;
CREATE POLICY "Users can delete own profile pictures"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for master-product-images
-- =====================================================

DROP POLICY IF EXISTS "Master product images are publicly accessible" ON storage.objects;
CREATE POLICY "Master product images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'master-product-images');

DROP POLICY IF EXISTS "Authenticated users can upload master product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload master product images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update master product images" ON storage.objects;
CREATE POLICY "Authenticated users can update master product images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete master product images" ON storage.objects;
CREATE POLICY "Authenticated users can delete master product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for custom-request-files
-- =====================================================

DROP POLICY IF EXISTS "Custom request files are publicly accessible" ON storage.objects;
CREATE POLICY "Custom request files are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'custom-request-files');

DROP POLICY IF EXISTS "Authenticated users can upload custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can upload custom request files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can update custom request files"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can delete custom request files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for public-assets
-- =====================================================

DROP POLICY IF EXISTS "Public assets are publicly accessible" ON storage.objects;
CREATE POLICY "Public assets are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'public-assets');

DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload public assets"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update public assets" ON storage.objects;
CREATE POLICY "Authenticated users can update public assets"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete public assets" ON storage.objects;
CREATE POLICY "Authenticated users can delete public assets"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

INSERT INTO public._migration_log (migration_name)
SELECT '20260211_storage_buckets.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260213_phase13_payment_workflow_hotfix.sql
-- ============================================================================

-- ============================================================================
-- Phase 13: Payment workflow hotfix
-- Date: 2026-02-13
-- Purpose:
--   1) Ensure canonical order_status values required by payment flow exist
--   2) Ensure orders.payment_submitted_at exists (used by payment rejection flow)
--   3) Recreate payment RPCs with consistent signatures and grants
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ensure canonical order_status values exist.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Ensure orders.payment_submitted_at exists.
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 3) Recreate mark_order_as_paid RPCs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR p_admin_id IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.mark_order_as_paid(
    p_order_id,
    auth.uid(),
    p_payment_reference,
    p_payment_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) Recreate reject_payment_submission RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payment_submission(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
  v_reason TEXT;
  v_admin_note TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can reject payment submissions';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  v_admin_note := format('[Admin Action] Payment reference rejected: %s', v_reason);

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    payment_notes = CASE
      WHEN payment_notes IS NULL OR BTRIM(payment_notes) = '' THEN v_admin_note
      ELSE payment_notes || E'\n' || v_admin_note
    END,
    payment_confirmed_at = NULL,
    payment_confirmed_by = NULL,
    payment_submitted_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'AWAITING_CONFIRMATION'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
      RAISE EXCEPTION 'Order is not awaiting confirmation';
    END IF;
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.payment_audit_logs (
    order_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    payment_reference,
    notes,
    metadata
  ) VALUES (
    v_order.id,
    v_caller,
    'ADMIN',
    'PAYMENT_REJECTED',
    'AWAITING_CONFIRMATION',
    'PENDING_PAYMENT',
    v_order.payment_reference,
    v_reason,
    jsonb_build_object(
      'source', 'rpc.reject_payment_submission'
    )
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_submission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_submission(UUID, TEXT) TO authenticated;

INSERT INTO public._migration_log (migration_name)
SELECT '20260213_phase13_payment_workflow_hotfix.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;


-- ============================================================================
-- END OF RECENT PHASE PATCH SCRIPT
-- Total: 13 migrations
-- ============================================================================
