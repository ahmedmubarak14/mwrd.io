import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuoteItem } from '../types/types';
import { getBestValueQuoteId } from '../utils/quoteValue';

export interface QuoteWithDetails {
  id: string;
  rfq_id: string;
  supplier_id: string;
  price: number;
  finalPrice?: number;
  leadTime?: string;
  warranty?: string;
  notes?: string;
  status: string;
  created_at: string;
  type?: 'auto' | 'custom';
  quote_type?: string;
  quoteItems?: QuoteItem[];
  quote_items?: QuoteItem[];
  supplier?: {
    id: string;
    companyName?: string;
    name?: string;
    publicId?: string;
    rating?: number;
    orderCount?: number;
  };
  product?: {
    id: string;
    name: string;
    brand?: string;
    imageUrl?: string;
  };
}

interface CreditInfo {
  hasLimit: boolean;
  creditLimit: number;
  creditUsed: number;
  available: number;
  utilizationPercent: number;
}

interface QuoteComparisonProps {
  quotes: QuoteWithDetails[];
  onAccept: (quoteId: string) => void;
  onClose: () => void;
  creditInfo?: CreditInfo;
  rfqItems?: ItemTemplate[];
}

type ItemTemplate = {
  productId: string;
  productName: string;
  brand?: string;
};

const formatSar = (value: number) => `SAR ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getQuoteItems = (quote: QuoteWithDetails) => quote.quoteItems || quote.quote_items || [];

export const QuoteComparison: React.FC<QuoteComparisonProps> = ({ quotes, onAccept, onClose, creditInfo, rfqItems }) => {
  const { t } = useTranslation();
  const [partialAcceptWarning, setPartialAcceptWarning] = useState<{
    quoteId: string;
    missingItemNames: string[];
  } | null>(null);

  const bestValueQuoteId = useMemo(() => {
    return getBestValueQuoteId(
      quotes.map((quote) => ({
        id: quote.id,
        price: Number(quote.finalPrice || quote.price || 0),
        leadTime: quote.leadTime,
        rating: Number(quote.supplier?.rating || 0),
      }))
    );
  }, [quotes]);

  const allItemTemplates = useMemo(() => {
    if (rfqItems && rfqItems.length > 0) return rfqItems;

    const itemsByProductId = new Map<string, ItemTemplate>();
    quotes.forEach((quote) => {
      getQuoteItems(quote).forEach((item) => {
        if (!itemsByProductId.has(item.productId)) {
          itemsByProductId.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            brand: item.brand,
          });
        }
      });
    });
    return Array.from(itemsByProductId.values());
  }, [quotes, rfqItems]);

  const hasPerItemPricing = allItemTemplates.length > 0 && quotes.some((quote) => getQuoteItems(quote).length > 0);

  const getMissingItems = (quote: QuoteWithDetails) => {
    if (!hasPerItemPricing) return [] as ItemTemplate[];
    const quotedProductIds = new Set(getQuoteItems(quote).map((item) => item.productId));
    return allItemTemplates.filter((item) => !quotedProductIds.has(item.productId));
  };

  const getColumnHighlightClass = (quoteId: string, isTop = false, isBottom = false) => {
    const isBestValue = quoteId === bestValueQuoteId;
    if (!isBestValue || quotes.length < 2) return '';

    const topClass = isTop ? 'border-t-2' : '';
    const bottomClass = isBottom ? 'border-b-2' : '';
    return `border-l-2 border-r-2 border-yellow-400 ${topClass} ${bottomClass} bg-yellow-50/50`;
  };

  const handleAcceptClick = (quote: QuoteWithDetails) => {
    const missingItems = getMissingItems(quote);
    if (missingItems.length > 0) {
      setPartialAcceptWarning({
        quoteId: quote.id,
        missingItemNames: missingItems.map((item) => item.productName),
      });
      return;
    }

    onAccept(quote.id);
  };

  if (quotes.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-bold mb-4">{t('client.quotes.noQuotes')}</h3>
          <p className="text-neutral-500 mb-6">{t('client.quotes.noQuotesDesc')}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto" role="dialog" aria-modal="true">
        <div className="bg-white rounded-xl w-full max-w-7xl max-h-[90vh] overflow-auto">
          <div className="sticky top-0 bg-white border-b border-neutral-200 p-6 flex items-center justify-between z-10">
            <div>
              <h2 className="text-2xl font-bold text-neutral-800">{t('client.quotes.comparison')}</h2>
              <p className="text-neutral-500 text-sm mt-1">{t('client.quotes.comparisonDesc')}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label={t('common.close')}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="p-6 overflow-x-auto">
            <table className="w-full border-collapse min-w-[980px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="p-4 text-left font-semibold text-neutral-700 sticky left-0 bg-neutral-50">{t('client.quotes.criteria')}</th>
                  {quotes.map((quote, idx) => {
                    const quoteType = quote.type === 'auto' || quote.quote_type === 'auto' ? 'auto' : 'custom';
                    const isBestValue = quote.id === bestValueQuoteId && quotes.length > 1;
                    return (
                      <th
                        key={quote.id}
                        className={`p-4 text-left font-semibold text-neutral-700 ${getColumnHighlightClass(quote.id, true, false)}`}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span>{quote.supplier?.publicId || `${t('client.rfq.supplierName')} ${idx + 1}`}</span>
                            {isBestValue && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <span className="material-symbols-outlined text-yellow-500 text-sm">star</span>
                                {t('client.quotes.bestValue')}
                              </span>
                            )}
                          </div>
                          {quote.supplier?.orderCount !== undefined && (
                            <span className="text-xs text-neutral-500">
                              {quote.supplier.orderCount} {t('client.quotes.ordersCompleted')}
                            </span>
                          )}
                          {quote.supplier?.rating !== undefined && (
                            <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px] text-yellow-500">star</span>
                              {t('client.quotes.supplierRating')}: {Number(quote.supplier.rating).toFixed(1)}
                            </span>
                          )}
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit ${quoteType === 'auto' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                            {quoteType === 'auto' ? t('client.quotes.quoteTypeAuto') : t('client.quotes.quoteTypeCustom')}
                          </span>
                          <span className="text-xs font-normal text-neutral-500">
                            {new Date(quote.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-200">
                  <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.product')}</td>
                  {quotes.map((quote) => (
                    <td key={quote.id} className={`p-4 ${getColumnHighlightClass(quote.id)}`}>
                      <div className="flex items-center gap-3">
                        {quote.product?.imageUrl && (
                          <img
                            src={quote.product.imageUrl}
                            alt={quote.product.name}
                            className="w-14 h-14 object-cover rounded-lg"
                          />
                        )}
                        <div>
                          <p className="font-medium text-neutral-800">{quote.product?.name || '-'}</p>
                          <p className="text-sm text-neutral-500">{quote.product?.brand || '-'}</p>
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-neutral-200">
                  <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.price')}</td>
                  {quotes.map((quote) => (
                    <td key={quote.id} className={`p-4 ${getColumnHighlightClass(quote.id)}`}>
                      <span className="text-2xl font-bold text-neutral-800">{formatSar(quote.finalPrice || quote.price || 0)}</span>
                    </td>
                  ))}
                </tr>

                {hasPerItemPricing && (
                  <tr className="border-b border-neutral-200 align-top">
                    <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.itemBreakdown')}</td>
                    {quotes.map((quote) => {
                      const quoteItems = getQuoteItems(quote);
                      const quoteItemsByProductId = new Map(quoteItems.map((item) => [item.productId, item]));
                      const missingItems = getMissingItems(quote);
                      const totalItems = allItemTemplates.length;
                      const quotedItemsCount = totalItems - missingItems.length;
                      const subtotal = quoteItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);

                      return (
                        <td key={quote.id} className={`p-4 ${getColumnHighlightClass(quote.id)}`}>
                          <div className="rounded-lg border border-gray-200 overflow-hidden">
                            <div className="grid grid-cols-5 gap-2 px-3 py-2 text-[11px] uppercase font-semibold bg-gray-50 text-gray-500">
                              <span>{t('client.quotes.itemProduct')}</span>
                              <span>{t('client.quotes.itemBrand')}</span>
                              <span>{t('client.quotes.itemUnitPrice')}</span>
                              <span>{t('client.quotes.itemQuantity')}</span>
                              <span>{t('client.quotes.itemLineTotal')}</span>
                            </div>
                            {allItemTemplates.map((itemTemplate) => {
                              const quoteItem = quoteItemsByProductId.get(itemTemplate.productId);
                              if (!quoteItem) {
                                return (
                                  <div key={itemTemplate.productId} className="grid grid-cols-5 gap-2 px-3 py-2 text-xs border-t border-gray-100">
                                    <span className="font-medium text-gray-800">{itemTemplate.productName}</span>
                                    <span className="text-gray-500">{itemTemplate.brand || '-'}</span>
                                    <span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                                        {t('client.quotes.notQuoted')}
                                      </span>
                                    </span>
                                    <span className="text-gray-500">-</span>
                                    <span className="text-gray-500">-</span>
                                  </div>
                                );
                              }

                              return (
                                <div key={quoteItem.id} className="grid grid-cols-5 gap-2 px-3 py-2 text-xs border-t border-gray-100">
                                  <span className="font-medium text-gray-800">
                                    {quoteItem.alternativeProductName || quoteItem.productName}
                                    {quoteItem.isAlternative && (
                                      <span className="ms-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                        {t('client.quotes.alternative')}
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-gray-500">{quoteItem.brand || '-'}</span>
                                  <span className="text-gray-700">{formatSar(quoteItem.unitPrice)}</span>
                                  <span className="text-gray-700">{quoteItem.quantity}</span>
                                  <span className="font-semibold text-gray-800">{formatSar(quoteItem.lineTotal)}</span>
                                </div>
                              );
                            })}
                            <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs border-t border-gray-200 bg-gray-50 font-semibold">
                              <span className="col-span-4 text-gray-700 text-right">{t('client.quotes.subtotal')}</span>
                              <span className="text-gray-900">{formatSar(subtotal)}</span>
                            </div>
                          </div>
                          <p className={`mt-2 text-xs font-medium ${missingItems.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {t('client.quotes.itemsQuotedSummary', { quoted: quotedItemsCount, total: totalItems })}
                          </p>
                        </td>
                      );
                    })}
                  </tr>
                )}

                <tr className="border-b border-neutral-200">
                  <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.leadTime')}</td>
                  {quotes.map((quote) => (
                    <td key={quote.id} className={`p-4 text-neutral-700 ${getColumnHighlightClass(quote.id)}`}>
                      {quote.leadTime || '-'}
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-neutral-200">
                  <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.warranty')}</td>
                  {quotes.map((quote) => (
                    <td key={quote.id} className={`p-4 text-neutral-700 ${getColumnHighlightClass(quote.id)}`}>
                      {quote.warranty || '-'}
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-neutral-200">
                  <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.notes')}</td>
                  {quotes.map((quote) => (
                    <td key={quote.id} className={`p-4 text-sm text-neutral-600 ${getColumnHighlightClass(quote.id)}`}>
                      {quote.notes || '-'}
                    </td>
                  ))}
                </tr>

                {/* Credit info row */}
                {creditInfo?.hasLimit && (
                  <tr className="border-b border-neutral-200">
                    <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.credit.availableCreditForQuote')}</td>
                    {quotes.map((quote) => {
                      const quotePrice = quote.finalPrice || quote.price || 0;
                      const wouldExceed = quotePrice > creditInfo.available;
                      const remainingAfter = creditInfo.available - quotePrice;
                      return (
                        <td key={quote.id} className={`p-4 ${getColumnHighlightClass(quote.id)}`}>
                          <div className={`text-xs rounded-lg p-2.5 ${wouldExceed ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                            <p className={`font-semibold ${wouldExceed ? 'text-red-700' : 'text-emerald-700'}`}>
                              {t('client.credit.creditAvailable')}: {formatSar(creditInfo.available)}
                            </p>
                            <p className={`mt-1 ${wouldExceed ? 'text-red-600' : 'text-emerald-600'}`}>
                              {t('client.credit.quoteWillUse')}: {formatSar(quotePrice)}
                            </p>
                            {!wouldExceed && (
                              <p className="text-emerald-600 mt-0.5">{t('client.credit.remainingAfter')}: {formatSar(remainingAfter)}</p>
                            )}
                            {wouldExceed && (
                              <p className="text-red-600 font-bold mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">warning</span>
                                {t('client.credit.overLimitTitle')}
                              </p>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )}

                <tr>
                  <td className="p-4 font-medium bg-neutral-50/50 sticky left-0">{t('client.quotes.action')}</td>
                  {quotes.map((quote) => {
                    const quotePrice = quote.finalPrice || quote.price || 0;
                    const isOverLimit = creditInfo?.hasLimit && quotePrice > creditInfo.available;
                    return (
                      <td key={quote.id} className={`p-4 ${getColumnHighlightClass(quote.id, false, true)}`}>
                        <button
                          onClick={() => handleAcceptClick(quote)}
                          disabled={quote.status === 'ACCEPTED' || isOverLimit}
                          className="w-full px-4 py-3 bg-[#137fec] text-white rounded-lg hover:bg-[#137fec]/90 disabled:bg-neutral-300 disabled:cursor-not-allowed font-semibold transition-colors"
                        >
                          {quote.status === 'ACCEPTED' ? t('client.quotes.accepted') : isOverLimit ? t('client.credit.creditExhausted') : t('client.quotes.acceptQuote')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t border-neutral-200 p-6 bg-neutral-50">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600">info</span>
              <div className="flex-1">
                <p className="text-sm text-neutral-700 font-medium">{t('client.quotes.comparisonNote')}</p>
                <p className="text-xs text-neutral-500 mt-1">{t('client.quotes.comparisonNoteDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {partialAcceptWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{t('client.quotes.partialWarningTitle')}</h3>
              <button
                onClick={() => setPartialAcceptWarning(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                aria-label={t('common.close')}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-gray-700">
              {t('client.quotes.partialWarningBody', {
                items: partialAcceptWarning.missingItemNames.join(', '),
              })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setPartialAcceptWarning(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  onAccept(partialAcceptWarning.quoteId);
                  setPartialAcceptWarning(null);
                }}
                className="px-4 py-2 rounded-lg bg-[#137fec] text-white hover:bg-[#137fec]/90"
              >
                {t('client.quotes.continueAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
