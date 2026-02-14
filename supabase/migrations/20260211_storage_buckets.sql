-- =====================================================
-- Storage Buckets for Image Uploads
-- =====================================================
-- NOTE: Storage bucket creation via SQL is supported in
-- Supabase but may need to be run manually if not using
-- the Supabase CLI migration runner.

-- Create product-images bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create profile-pictures bucket (private, signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-pictures',
    'profile-pictures',
    false,
    2097152, -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create master-product-images bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'master-product-images',
    'master-product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create custom-request-files bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'custom-request-files',
    'custom-request-files',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create public-assets bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-assets',
    'public-assets',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage Policies for product-images
-- =====================================================

-- Everyone can view product images (public bucket)
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
CREATE POLICY "Product images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images');

-- Authenticated users can upload product images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload product images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'product-images'
        AND auth.role() = 'authenticated'
    );

-- Users can update their own uploads
DROP POLICY IF EXISTS "Users can update their own product images" ON storage.objects;
CREATE POLICY "Users can update their own product images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'product-images'
        AND auth.role() = 'authenticated'
    );

-- Admins can delete any product images
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
CREATE POLICY "Admins can delete product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'product-images'
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'ADMIN'
        )
    );

-- Suppliers can delete their own uploads
DROP POLICY IF EXISTS "Suppliers can delete own product images" ON storage.objects;
CREATE POLICY "Suppliers can delete own product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'product-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- =====================================================
-- Storage Policies for profile-pictures
-- =====================================================

-- Authenticated users can view profile pictures
DROP POLICY IF EXISTS "Authenticated users can view profile pictures" ON storage.objects;
CREATE POLICY "Authenticated users can view profile pictures"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can upload their own profile pictures
DROP POLICY IF EXISTS "Users can upload own profile pictures" ON storage.objects;
CREATE POLICY "Users can upload own profile pictures"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can update their own profile pictures
DROP POLICY IF EXISTS "Users can update own profile pictures" ON storage.objects;
CREATE POLICY "Users can update own profile pictures"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can delete their own profile pictures
DROP POLICY IF EXISTS "Users can delete own profile pictures" ON storage.objects;
CREATE POLICY "Users can delete own profile pictures"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for master-product-images
-- =====================================================

DROP POLICY IF EXISTS "Master product images are publicly accessible" ON storage.objects;
CREATE POLICY "Master product images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'master-product-images');

DROP POLICY IF EXISTS "Authenticated users can upload master product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload master product images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update master product images" ON storage.objects;
CREATE POLICY "Authenticated users can update master product images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete master product images" ON storage.objects;
CREATE POLICY "Authenticated users can delete master product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for custom-request-files
-- =====================================================

DROP POLICY IF EXISTS "Custom request files are publicly accessible" ON storage.objects;
CREATE POLICY "Custom request files are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'custom-request-files');

DROP POLICY IF EXISTS "Authenticated users can upload custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can upload custom request files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can update custom request files"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can delete custom request files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for public-assets
-- =====================================================

DROP POLICY IF EXISTS "Public assets are publicly accessible" ON storage.objects;
CREATE POLICY "Public assets are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'public-assets');

DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload public assets"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update public assets" ON storage.objects;
CREATE POLICY "Authenticated users can update public assets"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete public assets" ON storage.objects;
CREATE POLICY "Authenticated users can delete public assets"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

INSERT INTO public._migration_log (migration_name)
SELECT '20260211_storage_buckets.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;
