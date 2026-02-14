-- Phase 15: Create missing tables for full dashboard integration
-- Tables: system_settings, credit_increase_requests
-- Uses get_user_role() from JWT token to avoid RLS recursion on users table.

-- ============================================================
-- 1. system_settings — stores global platform configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
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
INSERT INTO system_settings (id, auto_quote_delay_minutes, default_margin_percent)
VALUES (1, 30, 10.00)
ON CONFLICT (id) DO NOTHING;

-- RLS: Only admins can read/write system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Admins can view system settings'
  ) THEN
    CREATE POLICY "Admins can view system settings"
      ON system_settings FOR SELECT
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Admins can update system settings'
  ) THEN
    CREATE POLICY "Admins can update system settings"
      ON system_settings FOR UPDATE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Admins can insert system settings'
  ) THEN
    CREATE POLICY "Admins can insert system settings"
      ON system_settings FOR INSERT
      WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- ============================================================
-- 2. credit_increase_requests — client-submitted credit requests
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_increase_requests (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id        UUID NOT NULL REFERENCES users(id),
  current_limit    NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_used     NUMERIC(12,2) NOT NULL DEFAULT 0,
  requested_limit  NUMERIC(12,2) NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_notes      TEXT,
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Clients can insert + view own, Admins can view/update all
ALTER TABLE credit_increase_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credit_increase_requests' AND policyname = 'Clients can insert credit requests'
  ) THEN
    CREATE POLICY "Clients can insert credit requests"
      ON credit_increase_requests FOR INSERT
      WITH CHECK (client_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credit_increase_requests' AND policyname = 'Clients can view own credit requests'
  ) THEN
    CREATE POLICY "Clients can view own credit requests"
      ON credit_increase_requests FOR SELECT
      USING (client_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credit_increase_requests' AND policyname = 'Admins can view all credit requests'
  ) THEN
    CREATE POLICY "Admins can view all credit requests"
      ON credit_increase_requests FOR SELECT
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credit_increase_requests' AND policyname = 'Admins can update credit requests'
  ) THEN
    CREATE POLICY "Admins can update credit requests"
      ON credit_increase_requests FOR UPDATE
      USING (get_user_role() = 'ADMIN');
  END IF;
END $$;
