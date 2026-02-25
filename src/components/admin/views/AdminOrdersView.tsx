import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../hooks/useToast';
import { appConfig } from '../../../config/appConfig';
import { OrdersTable } from '../orders/OrdersTable';
import { PaymentLinkModal } from '../orders/PaymentLinkModal';
import { PaymentReviewModal } from '../orders/PaymentReviewModal';
import { OrderDetailsModal } from '../orders/OrderDetailsModal';
import { filterStatusOptions, statusSelectOptions, useOrderManagement } from '../orders/useOrderManagement';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

interface AdminOrdersViewProps {
  exportToCSV: (data: any[], filename: string) => void;
}

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({ exportToCSV }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { orders, updateOrder, currentUser, loadOrders, users, products, quotes, rfqs } = useStore();
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  const {
    filterStatus,
    setFilterStatus,
    filteredOrders,
    paymentLinkOrder,
    paymentLinkUrl,
    setPaymentLinkUrl,
    isSavingPaymentLink,
    selectedOrderForDetails,
    paymentReviewOrder,
    paymentReferenceInput,
    setPaymentReferenceInput,
    paymentReviewNotes,
    setPaymentReviewNotes,
    isConfirmingPayment,
    isRejectingPayment,
    selectedOrderAuditLogs,
    isLoadingOrderAuditLogs,
    statusLabel,
    paymentAuditActionLabel,
    openPaymentReviewModal,
    closePaymentReviewModal,
    openOrderDetails,
    closeOrderDetails,
    handleStatusChange,
    handleConfirmBankTransferPayment,
    handleRejectBankTransferPayment,
    canConfirmPayment,
    canRejectPayment,
    openPaymentLinkModal,
    closePaymentLinkModal,
    handleSavePaymentLink,
    copyPaymentLink,
  } = useOrderManagement({
    orders,
    currentUser,
    updateOrder,
    loadOrders,
    t,
    toast,
  });

  useEffect(() => {
    try {
      const savedOrderId = localStorage.getItem('mwrd-admin-orders-focus');
      if (savedOrderId) {
        setFocusedOrderId(savedOrderId);
        localStorage.removeItem('mwrd-admin-orders-focus');
      }
    } catch {
      // no-op
    }
  }, []);

  const displayedOrders = useMemo(() => {
    if (!focusedOrderId) return filteredOrders;
    const focused = filteredOrders.filter((order) => order.id === focusedOrderId);
    return focused.length > 0 ? focused : filteredOrders;
  }, [filteredOrders, focusedOrderId]);

  const handleExportOrders = () => {
    const rows = filteredOrders.map((order) => ({
      id: order.id,
      date: order.date,
      amount: order.amount,
      status: order.status,
      supplier_id: order.supplierId,
      client_id: order.clientId,
    }));
    exportToCSV(rows, 'admin_orders');
    toast.success(t('admin.orders.exported'));
  };

  return (
    <div data-testid="admin-orders-view">
      <PortalPageShell className="animate-in fade-in duration-300">
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.orders')}
          subtitle={t('admin.orders.subtitle')}
        />

        {focusedOrderId && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-orange-800">
              {t('admin.orders.focusedOrderBanner', { orderId: focusedOrderId })}
            </p>
            <button
              onClick={() => setFocusedOrderId(null)}
              className="text-sm font-semibold text-orange-700 hover:underline"
            >
              {t('common.clear') || 'Clear'}
            </button>
          </div>
        )}

        <OrdersTable
          filterStatus={filterStatus}
          filteredOrders={displayedOrders}
          filterStatusOptions={filterStatusOptions}
          statusSelectOptions={statusSelectOptions}
          statusLabel={statusLabel}
          onFilterStatusChange={setFilterStatus}
          onExport={handleExportOrders}
          onStatusChange={handleStatusChange}
          onOpenPaymentReview={openPaymentReviewModal}
          onCopyPaymentLink={copyPaymentLink}
          onOpenPaymentLink={openPaymentLinkModal}
          onOpenOrderDetails={openOrderDetails}
          enableExternalPaymentLinks={appConfig.payment.enableExternalPaymentLinks}
        />

        {appConfig.payment.enableExternalPaymentLinks && (
          <PaymentLinkModal
            order={paymentLinkOrder}
            paymentLinkUrl={paymentLinkUrl}
            isSaving={isSavingPaymentLink}
            onPaymentLinkUrlChange={setPaymentLinkUrl}
            onCancel={closePaymentLinkModal}
            onSave={handleSavePaymentLink}
          />
        )}

        <PaymentReviewModal
          order={paymentReviewOrder}
          paymentReferenceInput={paymentReferenceInput}
          paymentReviewNotes={paymentReviewNotes}
          isConfirmingPayment={isConfirmingPayment}
          isRejectingPayment={isRejectingPayment}
          canConfirmPayment={canConfirmPayment}
          canRejectPayment={canRejectPayment}
          statusLabel={statusLabel}
          onPaymentReferenceInputChange={setPaymentReferenceInput}
          onPaymentReviewNotesChange={setPaymentReviewNotes}
          onClose={closePaymentReviewModal}
          onReject={handleRejectBankTransferPayment}
          onConfirm={handleConfirmBankTransferPayment}
        />

        <OrderDetailsModal
          order={selectedOrderForDetails}
          users={users}
          products={products}
          quotes={quotes}
          rfqs={rfqs}
          paymentAuditLogs={selectedOrderAuditLogs}
          isLoadingOrderAuditLogs={isLoadingOrderAuditLogs}
          enableExternalPaymentLinks={appConfig.payment.enableExternalPaymentLinks}
          paymentAuditActionLabel={paymentAuditActionLabel}
          onClose={closeOrderDetails}
        />
      </PortalPageShell>
    </div>
  );
};
