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
