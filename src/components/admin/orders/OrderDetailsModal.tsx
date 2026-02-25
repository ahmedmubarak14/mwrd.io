import React from 'react';
import { useTranslation } from 'react-i18next';
import { Order, PaymentAuditLog, Product, Quote, RFQ, User } from '../../../types/types';

type NormalizedOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

interface OrderDetailsModalProps {
  order: Order | null;
  users: User[];
  products: Product[];
  quotes: Quote[];
  rfqs: RFQ[];
  paymentAuditLogs: PaymentAuditLog[];
  isLoadingOrderAuditLogs: boolean;
  enableExternalPaymentLinks: boolean;
  paymentAuditActionLabel: (action: string) => string;
  onClose: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  order,
  users,
  products,
  quotes,
  rfqs,
  paymentAuditLogs,
  isLoadingOrderAuditLogs,
  enableExternalPaymentLinks,
  paymentAuditActionLabel,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!order) {
    return null;
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const quote = order.quoteId ? quotes.find((entry) => entry.id === order.quoteId) : undefined;
  const rfq = quote?.rfqId ? rfqs.find((entry) => entry.id === quote.rfqId) : undefined;
  const client = users.find((entry) => entry.id === order.clientId);
  const supplier = users.find((entry) => entry.id === order.supplierId);

  const normalizeNumber = (value: unknown): number | null => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const normalizeOrderItems = (): NormalizedOrderItem[] => {
    const rawOrderItems = Array.isArray(order.items) ? (order.items as any[]) : [];
    if (rawOrderItems.length > 0) {
      return rawOrderItems.map((item, index) => {
        const productId = String(item.productId || item.product_id || `item-${index}`);
        const quantity = Math.max(0, Number(item.quantity || 0));
        const lineTotal = normalizeNumber(item.lineTotal ?? item.line_total ?? item.finalLineTotal ?? item.final_line_total);
        const unitPrice = normalizeNumber(item.unitPrice ?? item.unit_price ?? item.finalUnitPrice ?? item.final_unit_price);
        const resolvedUnitPrice = unitPrice ?? (lineTotal !== null && quantity > 0 ? lineTotal / quantity : null);
        const resolvedLineTotal = lineTotal ?? (resolvedUnitPrice !== null ? resolvedUnitPrice * quantity : null);

        return {
          productId,
          name: String(item.name || item.productName || item.product_name || productsById.get(productId)?.name || productId),
          quantity,
          unitPrice: resolvedUnitPrice,
          lineTotal: resolvedLineTotal,
        };
      });
    }

    if (Array.isArray(quote?.quoteItems) && quote.quoteItems.length > 0) {
      return quote.quoteItems.map((item) => ({
        productId: item.productId,
        name: item.productName || productsById.get(item.productId)?.name || item.productId,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        lineTotal: Number(item.lineTotal || 0),
      }));
    }

    const rfqItems = Array.isArray(rfq?.items) ? rfq.items : [];
    const totalQuantity = rfqItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const estimatedUnitPrice = totalQuantity > 0 ? Number(order.amount || 0) / totalQuantity : 0;
    return rfqItems.map((item) => ({
      productId: item.productId,
      name: productsById.get(item.productId)?.name || item.productId,
      quantity: Number(item.quantity || 0),
      unitPrice: estimatedUnitPrice || null,
      lineTotal: estimatedUnitPrice ? estimatedUnitPrice * Number(item.quantity || 0) : null,
    }));
  };

  const orderItems = normalizeOrderItems();
  const itemsSubtotal = orderItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  const fallbackSubtotal = Number(order.amount || 0);
  const effectiveSubtotal = itemsSubtotal > 0 ? itemsSubtotal : fallbackSubtotal;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.orders.viewDetails')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
          <p><span className="font-semibold">{t('admin.orders.orderId')}:</span> {order.id}</p>
          <p><span className="font-semibold">{t('admin.orders.date')}:</span> {new Date(order.date).toLocaleString()}</p>
          <p><span className="font-semibold">{t('admin.orders.amount')}:</span> {t('common.currency')} {order.amount.toLocaleString()}</p>
          <p><span className="font-semibold">{t('admin.orders.status')}:</span> {order.status}</p>
          <p><span className="font-semibold">{t('admin.orders.client') || 'Client'}:</span> {client?.companyName || client?.name || order.clientId}</p>
          <p><span className="font-semibold">{t('admin.orders.supplier') || 'Supplier'}:</span> {supplier?.companyName || supplier?.name || order.supplierId}</p>
          {order.paymentReference && (
            <p><span className="font-semibold">{t('admin.orders.paymentReference')}:</span> {order.paymentReference}</p>
          )}
          {order.paymentSubmittedAt && (
            <p><span className="font-semibold">{t('admin.orders.paymentSubmittedAt')}:</span> {new Date(order.paymentSubmittedAt).toLocaleString()}</p>
          )}
          {order.system_po_number && (
            <p><span className="font-semibold">{t('admin.orders.po')}:</span> {order.system_po_number}</p>
          )}
          {enableExternalPaymentLinks && order.paymentLinkUrl && (
            <a
              href={order.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              {t('admin.orders.openPaymentLink')}
            </a>
          )}

          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="font-semibold mb-2">{t('admin.orders.items') || 'Order Items'}</p>
            {orderItems.length === 0 ? (
              <p className="text-xs text-gray-500">{t('admin.orders.noItems') || 'No order item details available'}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('admin.orders.item') || 'Item'}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('admin.orders.quantity') || 'Qty'}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('admin.orders.unitPrice') || 'Unit Price'}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('admin.orders.lineTotal') || 'Line Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item, index) => (
                      <tr key={`${item.productId}-${index}`} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-800">{item.name}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{item.quantity.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {item.unitPrice !== null ? `${t('common.currency')} ${item.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 font-medium">
                          {item.lineTotal !== null ? `${t('common.currency')} ${item.lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-3 py-2 font-semibold text-gray-900" colSpan={3}>
                        {t('admin.orders.subtotal') || 'Subtotal'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                        {t('common.currency')} {effectiveSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="font-semibold mb-2">{t('admin.orders.auditHistory')}</p>
            {isLoadingOrderAuditLogs ? (
              <p className="text-xs text-gray-500">{t('common.loading')}</p>
            ) : paymentAuditLogs.length === 0 ? (
              <p className="text-xs text-gray-500">{t('admin.orders.noAuditHistory')}</p>
            ) : (
              <div className="space-y-2">
                {paymentAuditLogs.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-800">
                      {paymentAuditActionLabel(entry.action)}
                    </p>
                    <p className="text-xs text-gray-600">
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.actorRole ? ` • ${entry.actorRole}` : ''}
                    </p>
                    {(entry.fromStatus || entry.toStatus) && (
                      <p className="text-xs text-gray-600">
                        {entry.fromStatus || '—'} → {entry.toStatus || '—'}
                      </p>
                    )}
                    {entry.paymentReference && (
                      <p className="text-xs text-gray-700">
                        {t('admin.orders.paymentReference')}: {entry.paymentReference}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-gray-700">{entry.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
