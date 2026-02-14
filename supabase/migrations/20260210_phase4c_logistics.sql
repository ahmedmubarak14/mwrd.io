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
