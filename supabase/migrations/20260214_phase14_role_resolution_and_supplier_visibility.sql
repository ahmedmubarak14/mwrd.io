-- ============================================================================
-- Phase 14: Role Resolution + Supplier RFQ Visibility
-- Date: 2026-02-14
-- Goals:
--   1) Remove get_user_role() recursion risk by avoiding public.users lookups.
--   2) Keep auth role claims aligned with public.users.role.
--   3) Ensure suppliers can see and quote active RFQs end-to-end.
-- ============================================================================

-- 1) Harden role resolution helper.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
  v_auth_meta jsonb;
BEGIN
  -- Primary source: JWT claims.
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
      RETURN v_role_text::public.user_role;
    EXCEPTION
      WHEN OTHERS THEN
        v_role_text := NULL;
    END;
  END IF;

  -- Secondary source: auth.users app metadata (safe fallback, no public.users recursion).
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT raw_app_meta_data
  INTO v_auth_meta
  FROM auth.users
  WHERE id = auth.uid();

  v_role_text := NULLIF(trim(COALESCE(v_auth_meta ->> 'user_role', '')), '');
  IF v_role_text IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v_role_text::public.user_role;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_user_role() IS
  'Returns current role from JWT claims, with auth.users app metadata fallback (no public.users recursion).';

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;

-- 2) Backfill role claim metadata to reduce stale/empty JWT claim impact.
DO $$
BEGIN
  UPDATE auth.users AS au
  SET
    raw_app_meta_data = COALESCE(au.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('user_role', u.role::text),
    updated_at = NOW()
  FROM public.users AS u
  WHERE u.id = au.id
    AND COALESCE(au.raw_app_meta_data ->> 'user_role', '') IS DISTINCT FROM u.role::text;
END
$$;

-- 3) Supplier RFQ visibility and quote-creation compatibility.
-- Keep existing policies in place; add permissive policies for open RFQ marketplace behavior.
DROP POLICY IF EXISTS "Suppliers can view open RFQs" ON public.rfqs;
CREATE POLICY "Suppliers can view open RFQs"
  ON public.rfqs FOR SELECT
  USING (
    get_user_role() = 'SUPPLIER'
    AND status = 'OPEN'
  );

DROP POLICY IF EXISTS "Suppliers can view open RFQ items" ON public.rfq_items;
CREATE POLICY "Suppliers can view open RFQ items"
  ON public.rfq_items FOR SELECT
  USING (
    get_user_role() = 'SUPPLIER'
    AND EXISTS (
      SELECT 1
      FROM public.rfqs
      WHERE rfqs.id = rfq_items.rfq_id
        AND rfqs.status = 'OPEN'
    )
  );

DROP POLICY IF EXISTS "Suppliers can create quotes for open RFQs" ON public.quotes;
CREATE POLICY "Suppliers can create quotes for open RFQs"
  ON public.quotes FOR INSERT
  WITH CHECK (
    auth.uid() = supplier_id
    AND get_user_role() = 'SUPPLIER'
    AND EXISTS (
      SELECT 1
      FROM public.rfqs
      WHERE rfqs.id = quotes.rfq_id
        AND rfqs.status = 'OPEN'
    )
  );

-- Record migration if log table exists.
INSERT INTO public._migration_log (migration_name)
SELECT '20260214_phase14_role_resolution_and_supplier_visibility.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;
