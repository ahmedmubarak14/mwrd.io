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

INSERT INTO public._migration_log (migration_name) VALUES ('20260213_phase13_payment_workflow_hotfix.sql')
ON CONFLICT (migration_name) DO NOTHING;
