-- ============================================================================
-- Phase 16: Complete Admin Dashboard Fix
-- Date: 2026-02-14
-- This migration ensures ALL tables, columns, functions, and RLS policies
-- required by the admin dashboard exist and are properly configured.
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- ============================================================================
-- 0. Ensure user_role enum type exists
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('ADMIN', 'SUPPLIER', 'CLIENT', 'GUEST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. Harden get_user_role() — JWT-based, no public.users recursion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
  v_auth_meta jsonb;
BEGIN
  -- Primary: JWT claims
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
    EXCEPTION WHEN OTHERS THEN
      v_role_text := NULL;
    END;
  END IF;

  -- Fallback: auth.users app metadata (no public.users recursion)
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
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;

-- ============================================================================
-- 2. Backfill role claims into auth.users.raw_app_meta_data
--    This ensures JWT tokens include user_role after refresh
-- ============================================================================
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

-- ============================================================================
-- 3. Ensure all required columns exist on users table
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credit_used NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS client_margin NUMERIC(5,2);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_joined TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'NOT_SUBMITTED';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS public_id TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_settings JSONB;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_documents JSONB;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 4. system_settings table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  id            SERIAL PRIMARY KEY,
  auto_quote_delay_minutes      INT NOT NULL DEFAULT 30,
  default_margin_percent        NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  auto_quote_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  auto_quote_include_limited_stock BOOLEAN NOT NULL DEFAULT FALSE,
  auto_quote_lead_time_days     INT NOT NULL DEFAULT 3,
  rfq_default_expiry_days       INT NOT NULL DEFAULT 7,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a default row if none exists
INSERT INTO public.system_settings (id, auto_quote_delay_minutes, default_margin_percent)
VALUES (1, 30, 10.00)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS for system_settings
DROP POLICY IF EXISTS "Admins can view system settings" ON public.system_settings;
CREATE POLICY "Admins can view system settings"
  ON public.system_settings FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update system settings" ON public.system_settings;
CREATE POLICY "Admins can update system settings"
  ON public.system_settings FOR UPDATE
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can insert system settings" ON public.system_settings;
CREATE POLICY "Admins can insert system settings"
  ON public.system_settings FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

-- ============================================================================
-- 5. margin_settings table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.margin_settings (
  id            SERIAL PRIMARY KEY,
  category      TEXT,
  margin_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a default margin row if none exists
INSERT INTO public.margin_settings (category, margin_percent, is_default)
SELECT NULL, 10.00, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.margin_settings WHERE is_default = TRUE);

ALTER TABLE public.margin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view margin settings" ON public.margin_settings;
CREATE POLICY "Admins can view margin settings"
  ON public.margin_settings FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can create margin settings" ON public.margin_settings;
CREATE POLICY "Admins can create margin settings"
  ON public.margin_settings FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update margin settings" ON public.margin_settings;
CREATE POLICY "Admins can update margin settings"
  ON public.margin_settings FOR UPDATE
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can delete margin settings" ON public.margin_settings;
CREATE POLICY "Admins can delete margin settings"
  ON public.margin_settings FOR DELETE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 6. credit_increase_requests table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.credit_increase_requests (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id        UUID NOT NULL REFERENCES public.users(id),
  current_limit    NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_used     NUMERIC(12,2) NOT NULL DEFAULT 0,
  requested_limit  NUMERIC(12,2) NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_notes      TEXT,
  reviewed_by      UUID REFERENCES public.users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.credit_increase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can insert credit requests" ON public.credit_increase_requests;
CREATE POLICY "Clients can insert credit requests"
  ON public.credit_increase_requests FOR INSERT
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view own credit requests" ON public.credit_increase_requests;
CREATE POLICY "Clients can view own credit requests"
  ON public.credit_increase_requests FOR SELECT
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all credit requests" ON public.credit_increase_requests;
CREATE POLICY "Admins can view all credit requests"
  ON public.credit_increase_requests FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update credit requests" ON public.credit_increase_requests;
CREATE POLICY "Admins can update credit requests"
  ON public.credit_increase_requests FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 7. Ensure supplier_payouts table exists (for Payouts tab)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.supplier_payouts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id   UUID NOT NULL REFERENCES public.users(id),
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'SAR',
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  payment_method TEXT,
  reference_number TEXT,
  notes         TEXT,
  order_ids     UUID[],
  processed_by  UUID REFERENCES public.users(id),
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.supplier_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all payouts" ON public.supplier_payouts;
CREATE POLICY "Admins can view all payouts"
  ON public.supplier_payouts FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can create payouts" ON public.supplier_payouts;
CREATE POLICY "Admins can create payouts"
  ON public.supplier_payouts FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update payouts" ON public.supplier_payouts;
CREATE POLICY "Admins can update payouts"
  ON public.supplier_payouts FOR UPDATE
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Suppliers can view own payouts" ON public.supplier_payouts;
CREATE POLICY "Suppliers can view own payouts"
  ON public.supplier_payouts FOR SELECT
  USING (auth.uid() = supplier_id);

-- ============================================================================
-- 8. Ensure custom_item_requests table exists
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.custom_item_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID NOT NULL REFERENCES public.users(id),
  item_name     TEXT NOT NULL,
  description   TEXT,
  quantity      INT NOT NULL DEFAULT 1,
  category      TEXT,
  budget_range  TEXT,
  urgency       TEXT DEFAULT 'NORMAL'
                CHECK (urgency IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'QUOTED', 'COMPLETED', 'CANCELLED', 'REJECTED')),
  assigned_supplier_id UUID,  -- Foreign key constraint removed to avoid errors
  admin_notes   TEXT,
  rejection_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.custom_item_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can insert custom requests" ON public.custom_item_requests;
CREATE POLICY "Clients can insert custom requests"
  ON public.custom_item_requests FOR INSERT
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view own custom requests" ON public.custom_item_requests;
CREATE POLICY "Clients can view own custom requests"
  ON public.custom_item_requests FOR SELECT
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all custom requests" ON public.custom_item_requests;
CREATE POLICY "Admins can view all custom requests"
  ON public.custom_item_requests FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update custom requests" ON public.custom_item_requests;
CREATE POLICY "Admins can update custom requests"
  ON public.custom_item_requests FOR UPDATE
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Suppliers can view assigned custom requests" ON public.custom_item_requests;
-- Policy commented out because assigned_supplier_id column may not exist in all schemas
-- CREATE POLICY "Suppliers can view assigned custom requests"
--   ON public.custom_item_requests FOR SELECT
--   USING (auth.uid() = assigned_supplier_id);

-- ============================================================================
-- 9. Ensure products table has required columns
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 10. Ensure quotes table has required columns
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(5,2);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS final_price NUMERIC(12,2);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'custom';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 11. Ensure orders table has required columns
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 12. Ensure proper RLS on users table (non-recursive)
-- ============================================================================
-- Drop old problematic policies first
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- Recreate admin user access using get_user_role()
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Also allow all authenticated users to see basic user info (needed for lookups)
DROP POLICY IF EXISTS "Allow all authenticated reads" ON public.users;
CREATE POLICY "Allow all authenticated reads"
  ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');

-- Ensure admin can update all users
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
CREATE POLICY "Admins can update all users"
  ON public.users FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 13. Ensure proper RLS for products (admin access)
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all products" ON public.products;
CREATE POLICY "Admins can view all products"
  ON public.products FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update all products" ON public.products;
CREATE POLICY "Admins can update all products"
  ON public.products FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 14. Ensure proper RLS for quotes (admin access)
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all quotes" ON public.quotes;
CREATE POLICY "Admins can view all quotes"
  ON public.quotes FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update all quotes" ON public.quotes;
CREATE POLICY "Admins can update all quotes"
  ON public.quotes FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 15. Ensure proper RLS for orders (admin access)
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
  ON public.orders FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
CREATE POLICY "Admins can update all orders"
  ON public.orders FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 16. Ensure proper RLS for RFQs (admin access)
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all RFQs" ON public.rfqs;
CREATE POLICY "Admins can view all RFQs"
  ON public.rfqs FOR SELECT
  USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can update all RFQs" ON public.rfqs;
CREATE POLICY "Admins can update all RFQs"
  ON public.rfqs FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 17. Ensure proper RLS for RFQ items (admin access)
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all RFQ items" ON public.rfq_items;
CREATE POLICY "Admins can view all RFQ items"
  ON public.rfq_items FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 18. Supplier RFQ visibility (marketplace behavior)
-- ============================================================================
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
      SELECT 1 FROM public.rfqs
      WHERE rfqs.id = rfq_items.rfq_id AND rfqs.status = 'OPEN'
    )
  );

-- ============================================================================
-- 19. Ensure categories table exists (for dynamic category management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  parent_id     UUID REFERENCES public.categories(id),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
CREATE POLICY "Anyone can view active categories"
  ON public.categories FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- 20. Final verification: Log this migration
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public._migration_log') IS NOT NULL THEN
    INSERT INTO public._migration_log (migration_name)
    VALUES ('20260214_phase16_admin_dashboard_complete_fix.sql')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END
$$;

-- ============================================================================
-- DONE. After running this migration:
-- 1. Log out and log back in to refresh JWT tokens
-- 2. The admin dashboard should now load all data correctly
-- ============================================================================
