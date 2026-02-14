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
