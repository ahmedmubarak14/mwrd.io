-- ============================================================================
-- Phase 21: Fix RLS WITH CHECK clause for client order updates
-- Date: 2026-02-21
-- Previous attempt used PENDING_ADMIN_CONFIRMATION which is NOT in the
-- order_status enum. The actual enum values for client-accessible statuses are:
--   PENDING_PAYMENT  (initial state after quote acceptance)
--   PENDING_PO       (after PO submission / admin confirmation step)
--   AWAITING_CONFIRMATION (after payment reference submission)
-- ============================================================================

DROP POLICY IF EXISTS "Clients can update own PO fields" ON public.orders;

CREATE POLICY "Clients can update own PO fields"
  ON public.orders
  FOR UPDATE
  USING (auth.uid() = client_id)
  WITH CHECK (
    auth.uid() = client_id
    -- Clients may only set these statuses (PO submission and payment submission flows)
    -- Admin-owned statuses (CONFIRMED, IN_TRANSIT, DELIVERED, etc.) remain protected.
    AND status::text IN (
      'PENDING_PAYMENT',
      'PENDING_PO',
      'AWAITING_CONFIRMATION'
    )
  );

INSERT INTO public._migration_log (migration_name)
VALUES ('20260221_phase21_fix_client_order_rls.sql')
ON CONFLICT (migration_name) DO NOTHING;
