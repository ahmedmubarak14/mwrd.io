import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../hooks/useToast';
import { reviewService, SubmittedReview } from '../../services/reviewService';
import { getUserFacingError } from '../../utils/errorMessages';

interface ReviewModalProps {
  orderId: string;
  supplierLabel?: string;
  onClose: () => void;
  onSubmitted: (review: SubmittedReview) => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5];

export const ReviewModal: React.FC<ReviewModalProps> = ({
  orderId,
  supplierLabel,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeRating = useMemo(() => hoverRating || rating, [hoverRating, rating]);

  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error(t('client.reviews.ratingRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const review = await reviewService.submitReview(orderId, rating, comment);
      onSubmitted(review);
      toast.success(t('client.reviews.submitted'));
    } catch (error: any) {
      toast.error(getUserFacingError(error, t('client.reviews.submitError')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">{t('client.reviews.title')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label={t('common.close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          {t('client.reviews.subtitle', { supplier: supplierLabel || t('client.rfq.supplierName') })}
        </p>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {t('client.reviews.ratingLabel')}
          </label>
          <div className="flex items-center gap-1">
            {STAR_VALUES.map((value) => {
              const filled = activeRating >= value;
              return (
                <button
                  key={value}
                  type="button"
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(value)}
                  className="p-1 rounded hover:bg-yellow-50 transition-colors"
                  aria-label={t('client.reviews.starAriaLabel', { count: value })}
                >
                  <span
                    className={`material-symbols-outlined text-3xl ${
                      filled ? 'text-yellow-500' : 'text-gray-300'
                    }`}
                    style={{ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="review-comment" className="block text-sm font-semibold text-gray-700 mb-2">
            {t('client.reviews.commentLabel')}
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
            placeholder={t('client.reviews.commentPlaceholder')}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-[#137fec] text-white hover:bg-[#137fec]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('common.processing', 'Processing...') : t('client.reviews.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
