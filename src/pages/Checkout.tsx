import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useToast } from '../hooks/useToast';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { appConfig } from '../config/appConfig';
import type { PaymentSummary } from '../types/payment';
import type { BankDetails } from '../types/types';
import bankTransferService from '../services/bankTransferService';
import { logger } from '../utils/logger';
import { calculatePricingBreakdown } from '../utils/pricing';

interface CheckoutProps {
  orderId: string;
  clientId: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const createFallbackBankDetails = (t: TFunction): BankDetails => ({
  id: 'fallback',
  bankName: t('checkout.notConfigured'),
  accountName: t('checkout.notConfigured'),
  accountNumber: t('checkout.notConfigured'),
  iban: undefined,
  swiftCode: undefined,
  currency: 'SAR',
  notes: t('checkout.bankDetailsNotConfiguredNote'),
  isActive: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const Checkout: React.FC<CheckoutProps> = ({
  orderId,
  clientId,
  amount,
  onSuccess,
  onCancel,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'bank_transfer' | 'external_link'>('bank_transfer');
  const [transferReference, setTransferReference] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);
  const vatRatePercent = appConfig.pricing.vatRatePercent;
  const pricing = calculatePricingBreakdown(amount, vatRatePercent, 0);

  const paymentSummary: PaymentSummary = {
    subtotal: pricing.subtotal,
    tax: pricing.vatAmount,
    discount: pricing.discountAmount,
    total: pricing.total,
    currency: 'SAR',
  };

  // Generate a unique reference for this order
  const orderReference = `MWRD-${orderId.slice(0, 8).toUpperCase()}`;

  useEffect(() => {
    let isMounted = true;

    const loadPaymentSetup = async () => {
      setIsLoadingSetup(true);
      try {
        const [activeBankDetails, order] = await Promise.all([
          bankTransferService.getActiveBankDetails(),
          bankTransferService.getOrderById(orderId),
        ]);

        if (!isMounted) {
          return;
        }

        setBankDetails(activeBankDetails);
        setPaymentLinkUrl(order?.paymentLinkUrl ?? null);
      } catch (error) {
        logger.error('Error loading checkout payment setup:', error);
        if (isMounted) {
          toast.error(t('checkout.paymentSetupError'));
        }
      } finally {
        if (isMounted) {
          setIsLoadingSetup(false);
        }
      }
    };

    void loadPaymentSetup();

    return () => {
      isMounted = false;
    };
  }, [orderId, t, toast]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('checkout.copiedToClipboard', { label }));
    } catch (error) {
      logger.error('Clipboard write failed:', error);
      toast.error(t('common.copyFailed'));
    }
  };

  const handleBankTransferSubmit = async () => {
    if (!bankDetails) {
      toast.error(t('checkout.bankDetailsMissing'));
      return;
    }

    if (!transferReference.trim()) {
      toast.error(t('checkout.enterTransferReference'));
      return;
    }

    setIsProcessing(true);

    try {
      await bankTransferService.addPaymentReference(
        orderId,
        transferReference.trim(),
        `Submitted from checkout by client ${clientId}`
      );
      toast.success(t('checkout.transferSubmitted'));
      onSuccess();
    } catch (error) {
      logger.error('Error submitting bank transfer:', error);
      toast.error(t('checkout.transferSubmitFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExternalPaymentLink = () => {
    if (!paymentLinkUrl) {
      toast.info(t('checkout.paymentLinkUnavailable'));
      return;
    }

    window.open(paymentLinkUrl, '_blank', 'noopener,noreferrer');
  };

  const effectiveBankDetails = bankDetails || createFallbackBankDetails(t);
  const canSubmitBankTransfer = Boolean(bankDetails) && transferConfirmed && Boolean(transferReference.trim());

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 md:py-12 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-[#0A2540] text-white px-4 sm:px-6 md:px-8 py-4 sm:py-6">
            <h1 className="text-xl sm:text-2xl font-bold">{t('checkout.title')}</h1>
            <p className="text-gray-300 mt-1 text-sm sm:text-base">
              {t('checkout.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 p-4 sm:p-6 md:p-8">
            {/* Payment Method Selection */}
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">
                {t('checkout.paymentMethod')}
              </h2>

              {/* Payment Method Tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('bank_transfer')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${selectedMethod === 'bank_transfer'
                      ? 'border-[#0A2540] bg-[#0A2540]/5 text-[#0A2540]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                >
                  <span className="material-symbols-outlined block text-2xl mb-1">account_balance</span>
                  <span className="text-sm font-medium">{t('checkout.bankTransfer')}</span>
                </button>

                {appConfig.payment.enableExternalPaymentLinks && (
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('external_link')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${selectedMethod === 'external_link'
                        ? 'border-[#0A2540] bg-[#0A2540]/5 text-[#0A2540]'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                  >
                    <span className="material-symbols-outlined block text-2xl mb-1">link</span>
                    <span className="text-sm font-medium">{t('checkout.paymentLink')}</span>
                  </button>
                )}
              </div>

              {/* Bank Transfer Details */}
              {selectedMethod === 'bank_transfer' && (
                <div className="space-y-4">
                  {isLoadingSetup && (
                    <div className="flex items-center justify-center py-4">
                      <LoadingSpinner size="sm" />
                    </div>
                  )}

                  {!isLoadingSetup && !bankDetails && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
                      {t('checkout.bankDetailsMissing')}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined">info</span>
                      {t('checkout.bankTransferInstructions')}
                    </h3>
                    <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                      <li>{t('checkout.instruction1')}</li>
                      <li>{t('checkout.instruction2')}</li>
                      <li>{t('checkout.instruction3')}</li>
                      <li>{t('checkout.instruction4')}</li>
                    </ol>
                  </div>

                  {/* Bank Details */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-gray-900">{t('checkout.bankAccountDetails')}</h4>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('checkout.bankNameLabel')}</span>
                        <span className="font-medium">{effectiveBankDetails.bankName}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('checkout.accountNameLabel')}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{effectiveBankDetails.accountName}</span>
                          <button
                            onClick={() => void copyToClipboard(effectiveBankDetails.accountName, t('checkout.accountNameLabel'))}
                            disabled={!bankDetails}
                            className="text-[#0A2540] hover:text-[#0A2540]/70"
                          >
                            <span className="material-symbols-outlined text-lg">content_copy</span>
                          </button>
                        </div>
                      </div>

                      {effectiveBankDetails.iban && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{t('checkout.ibanLabel')}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono text-sm">{effectiveBankDetails.iban}</span>
                            <button
                              onClick={() => void copyToClipboard(effectiveBankDetails.iban!, t('checkout.ibanLabel'))}
                              disabled={!bankDetails}
                              className="text-[#0A2540] hover:text-[#0A2540]/70"
                            >
                              <span className="material-symbols-outlined text-lg">content_copy</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {effectiveBankDetails.swiftCode && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{t('checkout.swiftCodeLabel')}</span>
                          <span className="font-medium">{effectiveBankDetails.swiftCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Reference */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm text-yellow-800">{t('checkout.orderReferenceLabel')}</span>
                        <p className="font-bold text-yellow-900 text-lg">{orderReference}</p>
                      </div>
                      <button
                        onClick={() => void copyToClipboard(orderReference, t('checkout.orderReferenceLabel'))}
                        className="p-2 text-yellow-700 hover:bg-yellow-100 rounded-lg"
                      >
                        <span className="material-symbols-outlined">content_copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Transfer Reference Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('checkout.yourTransferReference')}
                    </label>
                    <input
                      type="text"
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                      placeholder={t('checkout.transferReferencePlaceholder')}
                      disabled={!bankDetails}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('checkout.transferReferenceHelp')}
                    </p>
                  </div>

                  {/* Confirmation Checkbox */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="transferConfirmed"
                      checked={transferConfirmed}
                      onChange={(e) => setTransferConfirmed(e.target.checked)}
                      disabled={!bankDetails}
                      className="w-4 h-4 mt-1 text-[#0A2540] border-gray-300 rounded focus:ring-[#0A2540]"
                    />
                    <label htmlFor="transferConfirmed" className="text-sm text-gray-700">
                      {t('checkout.confirmTransferLabel', { amount: paymentSummary.total.toFixed(2), currency: paymentSummary.currency })}
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 mt-6">
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={isProcessing}
                      className="flex-1 px-4 sm:px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[48px]"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleBankTransferSubmit}
                      disabled={isProcessing || !canSubmitBankTransfer}
                      className="flex-1 px-4 sm:px-6 py-3 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                    >
                      {isProcessing ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>{t('common.submitting')}</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">check_circle</span>
                          <span>{t('checkout.confirmPaymentBtn')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* External Payment Link */}
              {selectedMethod === 'external_link' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-400 mb-3">link</span>
                    <h3 className="font-semibold text-gray-900 mb-2">{t('checkout.externalPaymentLink')}</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {t('checkout.externalPaymentDesc')}
                    </p>
                    <button
                      onClick={handleExternalPaymentLink}
                      disabled={!paymentLinkUrl}
                      className="px-6 py-3 bg-[#0A2540] text-white rounded-lg hover:bg-[#0A2540]/90 transition-colors inline-flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                      {t('checkout.openPaymentLink')}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}

              {/* Security Notice */}
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-600 text-xl">verified_user</span>
                  <div>
                    <p className="text-sm font-medium text-green-900">{t('checkout.securePaymentTitle')}</p>
                    <p className="text-xs text-green-700 mt-1">
                      {t('checkout.securePaymentDesc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">
                {t('checkout.orderSummary')}
              </h2>

              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <div className="flex justify-between text-gray-700">
                  <span>{t('checkout.subtotal')}</span>
                  <span>{paymentSummary.subtotal.toFixed(2)} {paymentSummary.currency}</span>
                </div>

                <div className="flex justify-between text-gray-700">
                  <span>{`${t('checkout.vat')} (${vatRatePercent}%)`}</span>
                  <span>{paymentSummary.tax.toFixed(2)} {paymentSummary.currency}</span>
                </div>

                {paymentSummary.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t('checkout.discount')}</span>
                    <span>-{paymentSummary.discount.toFixed(2)} {paymentSummary.currency}</span>
                  </div>
                )}

                <div className="border-t border-gray-300 pt-4">
                  <div className="flex justify-between text-lg font-bold text-gray-900">
                    <span>{t('common.total')}</span>
                    <span>{paymentSummary.total.toFixed(2)} {paymentSummary.currency}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  {t('checkout.acceptedMethods')}
                </p>
                <div className="flex gap-3">
                  <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">account_balance</span>
                    {t('checkout.bankTransfer')}
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900">{t('checkout.needHelp')}</p>
                <p className="text-xs text-blue-700 mt-1">
                  {t('checkout.supportContact')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>{t('checkout.poweredBy')}</p>
        </div>
      </div>
    </div>
  );
};
