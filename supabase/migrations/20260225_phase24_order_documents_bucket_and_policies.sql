-- ============================================================================
-- Phase 24: Ensure order-documents storage bucket exists with required policies
-- Date: 2026-02-25
-- ============================================================================

-- Create bucket if missing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-documents',
  'order-documents',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can view order documents (actual row-level access is governed by app flows + signed URLs)
DROP POLICY IF EXISTS "Authenticated users can view order documents" ON storage.objects;
CREATE POLICY "Authenticated users can view order documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'order-documents'
    AND auth.role() = 'authenticated'
  );

-- Authenticated users can upload order documents
DROP POLICY IF EXISTS "Authenticated users can upload order documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload order documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'order-documents'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to update documents they uploaded
DROP POLICY IF EXISTS "Authenticated users can update own order documents" ON storage.objects;
CREATE POLICY "Authenticated users can update own order documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'order-documents'
    AND auth.role() = 'authenticated'
    AND owner = auth.uid()
  );

-- Allow admins to delete order documents
DROP POLICY IF EXISTS "Admins can delete order documents" ON storage.objects;
CREATE POLICY "Admins can delete order documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'order-documents'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'ADMIN'
    )
  );
