-- ============================================================================
-- Fix Supplier Dashboard Issues
-- Date: 2026-02-14
-- Fixes: RFQ visibility, KYC storage, and RLS policies
-- ============================================================================

-- ============================================================================
-- 1. Fix RFQ Visibility - Remove Conflicting Policy
-- ============================================================================

-- Drop the OLD restrictive policy that blocks suppliers from seeing RFQs
DROP POLICY IF EXISTS "Suppliers can view relevant RFQs" ON public.rfqs;

-- The marketplace policy "Suppliers can view open RFQs" already exists
-- from migration 20260214_phase16_admin_dashboard_complete_fix.sql
-- It allows suppliers to see ALL open RFQs, which is the correct behavior

-- Verify the marketplace policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'rfqs' 
    AND policyname = 'Suppliers can view open RFQs'
  ) THEN
    -- Recreate if missing
    CREATE POLICY "Suppliers can view open RFQs"
      ON public.rfqs FOR SELECT
      USING (
        get_user_role() = 'SUPPLIER'
        AND status = 'OPEN'
      );
  END IF;
END $$;

-- ============================================================================
-- 2. Create KYC Documents Storage Bucket
-- ============================================================================

-- Create storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Suppliers can upload their own KYC documents
DROP POLICY IF EXISTS "Suppliers can upload own KYC" ON storage.objects;
CREATE POLICY "Suppliers can upload own KYC"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS policy: Suppliers can view their own KYC documents
DROP POLICY IF EXISTS "Suppliers can view own KYC" ON storage.objects;
CREATE POLICY "Suppliers can view own KYC"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS policy: Admins can view all KYC documents
DROP POLICY IF EXISTS "Admins can view all KYC" ON storage.objects;
CREATE POLICY "Admins can view all KYC"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND get_user_role() = 'ADMIN'
  );

-- ============================================================================
-- 3. Ensure RFQ Items Visibility for Suppliers
-- ============================================================================

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Suppliers can view relevant RFQ items" ON public.rfq_items;

-- The policy "Suppliers can view open RFQ items" already exists
-- Verify it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'rfq_items' 
    AND policyname = 'Suppliers can view open RFQ items'
  ) THEN
    -- Recreate if missing
    CREATE POLICY "Suppliers can view open RFQ items"
      ON public.rfq_items FOR SELECT
      USING (
        get_user_role() = 'SUPPLIER'
        AND EXISTS (
          SELECT 1 FROM public.rfqs
          WHERE rfqs.id = rfq_items.rfq_id AND rfqs.status = 'OPEN'
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 4. Add Index for Better RFQ Query Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rfqs_status_supplier_visibility 
  ON public.rfqs(status) 
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id 
  ON public.rfq_items(rfq_id);

-- ============================================================================
-- DONE
-- ============================================================================
