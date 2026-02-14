import { logger } from '@/src/utils/logger';
import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'product-images';
const FALLBACK_BUCKETS = ['master-product-images', 'public-assets', 'custom-request-files'];

export interface UploadResult {
    success: boolean;
    url?: string;
    error?: string;
}

/**
 * Upload an image file to Supabase Storage
 * @param file The file to upload
 * @param folder Optional folder path (e.g., 'products', 'gallery')
 * @returns The public URL of the uploaded image
 */
export async function uploadImage(file: File, folder: string = 'products'): Promise<UploadResult> {
    try {
        // Generate a unique filename
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const bucketsToTry = Array.from(new Set([BUCKET_NAME, ...FALLBACK_BUCKETS]));

        for (const bucket of bucketsToTry) {
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                logger.warn('Image upload attempt failed, trying next bucket if available', {
                    bucket,
                    message: error.message,
                });
                continue;
            }

            const { data: urlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(data.path);

            return {
                success: true,
                url: urlData.publicUrl
            };
        }

        return {
            success: false,
            error: 'No writable storage bucket is configured for image uploads.'
        };
    } catch (err) {
        logger.error('Unexpected error uploading image:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error occurred'
        };
    }
}

/**
 * Delete an image from Supabase Storage
 * @param url The public URL of the image to delete
 */
export async function deleteImage(url: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Extract the path from the URL
        const urlParts = url.split(`${BUCKET_NAME}/`);
        if (urlParts.length < 2) {
            return { success: false, error: 'Invalid image URL' };
        }

        const filePath = urlParts[1];

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([filePath]);

        if (error) {
            logger.error('Image delete failed:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err) {
        logger.error('Unexpected error deleting image:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error occurred'
        };
    }
}

/**
 * Validate image file before upload
 * @param file The file to validate
 * @returns Validation result
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (!ALLOWED_TYPES.includes(file.type)) {
        return { valid: false, error: 'Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.' };
    }

    if (file.size > MAX_SIZE) {
        return { valid: false, error: 'File too large. Maximum size is 5MB.' };
    }

    return { valid: true };
}

/**
 * List images in a specific folder
 * @param folder The folder to list images from
 */
export async function listImages(folder: string = 'gallery'): Promise<{ images: string[]; error?: string }> {
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(folder, {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) {
            logger.error('Failed to list images:', error);
            return { images: [], error: error.message };
        }

        // Get public URLs for all images
        const images = (data || [])
            .filter(file => !file.id.startsWith('.')) // Skip hidden files
            .map(file => {
                const { data: urlData } = supabase.storage
                    .from(BUCKET_NAME)
                    .getPublicUrl(`${folder}/${file.name}`);
                return urlData.publicUrl;
            });

        return { images };
    } catch (err) {
        logger.error('Unexpected error listing images:', err);
        return { images: [], error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

export const imageUploadService = {
    uploadImage,
    deleteImage,
    validateImageFile,
    listImages,
    BUCKET_NAME
};
