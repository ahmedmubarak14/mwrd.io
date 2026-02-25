-- ============================================================================
-- Phase 25: RLS-safe document access RPC for admin/client/supplier
-- Date: 2026-02-25
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_order_documents_for_user(
  p_order_id UUID
)
RETURNS SETOF public.order_documents
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_role public.user_role;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE id = v_caller;

  IF v_role = 'ADMIN' THEN
    RETURN QUERY
      SELECT *
      FROM public.order_documents
      WHERE order_id = p_order_id
      ORDER BY created_at DESC;
    RETURN;
  END IF;

  IF v_role = 'CLIENT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = p_order_id
      AND o.client_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
      SELECT *
      FROM public.order_documents
      WHERE order_id = p_order_id
      ORDER BY created_at DESC;
    RETURN;
  END IF;

  IF v_role = 'SUPPLIER' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = p_order_id
      AND o.supplier_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
      SELECT *
      FROM public.order_documents
      WHERE order_id = p_order_id
      ORDER BY created_at DESC;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Forbidden';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_order_documents_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_documents_for_user(UUID) TO service_role;
