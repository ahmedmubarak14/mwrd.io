import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

interface SubmitReviewResponse {
  success?: boolean;
  review_id?: string;
  rating?: number;
  supplier_new_avg_rating?: number;
  message?: string;
}

export interface SubmittedReview {
  reviewId: string;
  rating: number;
  supplierNewAvgRating?: number;
}

export const reviewService = {
  async getReviewedOrderIds(orderIds: string[]): Promise<string[]> {
    const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
    if (uniqueOrderIds.length === 0) {
      return [];
    }

    try {
      const { data, error } = await (supabase as any)
        .from('reviews')
        .select('order_id')
        .in('order_id', uniqueOrderIds);

      if (error) {
        logger.error('Failed to load reviewed order ids:', error);
        return [];
      }

      return Array.from(
        new Set(
          (data || [])
            .map((row: any) => row.order_id || '')
            .filter(Boolean)
        )
      );
    } catch (error) {
      logger.error('Failed to load reviewed order ids:', error);
      return [];
    }
  },

  async submitReview(orderId: string, rating: number, comment?: string): Promise<SubmittedReview> {
    const normalizedRating = Math.max(1, Math.min(5, Math.round(rating)));
    const normalizedComment = (comment || '').trim();

    const { data, error } = await (supabase as any).rpc('submit_review', {
      p_order_id: orderId,
      p_rating: normalizedRating,
      p_comment: normalizedComment.length > 0 ? normalizedComment : null,
    });

    if (error) {
      logger.error('Failed to submit review:', error);
      throw new Error(error.message || 'Failed to submit review');
    }

    const payload = (Array.isArray(data) ? data[0] : data) as SubmitReviewResponse | null;
    if (!payload?.success) {
      throw new Error(payload?.message || 'Failed to submit review');
    }

    try {
      const { data: orderRow } = await (supabase as any)
        .from('orders')
        .select('supplier_id')
        .eq('id', orderId)
        .maybeSingle();

      const supplierId = orderRow?.supplier_id as string | undefined;
      if (supplierId) {
        const { data: supplierRow } = await (supabase as any)
          .from('users')
          .select('company_name, name')
          .eq('id', supplierId)
          .maybeSingle();

        await (supabase as any).rpc('enqueue_notification', {
          p_user_id: supplierId,
          p_event_type: 'review_submitted',
          p_variables: {
            supplier_name: supplierRow?.company_name || supplierRow?.name || 'Supplier',
            rating: normalizedRating,
            comment: normalizedComment || '-',
            new_avg_rating: payload.supplier_new_avg_rating ?? '',
          },
        });
      }
    } catch (error) {
      logger.warn('Review submitted, but failed to enqueue supplier notification', error);
    }

    return {
      reviewId: String(payload.review_id || ''),
      rating: Number(payload.rating ?? normalizedRating),
      supplierNewAvgRating:
        payload.supplier_new_avg_rating === undefined
          ? undefined
          : Number(payload.supplier_new_avg_rating),
    };
  },
};
