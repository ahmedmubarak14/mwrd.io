import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../../ui/StatusBadge';
import { Modal } from '../../ui/Modal';
import { logger } from '../../../utils/logger';
import { SupplierPayout, UserRole } from '../../../types/types';
import { useStore } from '../../../store/useStore';
import { payoutService } from '../../../services/payoutService';
import { useToast } from '../../../hooks/useToast';
import { api } from '../../../services/api';
import {
  PortalMetricCard,
  PortalPageHeader,
  PortalPageShell,
  PortalSection,
} from '../../ui/PortalDashboardShell';

type PayoutStatusFilter = 'ALL' | 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

const statusToBadge = (status: string): string => {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'PROCESSING':
      return 'processing';
    case 'PAID':
      return 'approved';
    case 'FAILED':
      return 'rejected';
    default:
      return 'pending';
  }
};

export const AdminPayoutsView: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const users = useStore((state) => state.users);
  const orders = useStore((state) => state.orders);
  const loadUsers = useStore((state) => state.loadUsers);
  const loadOrders = useStore((state) => state.loadOrders);

  const supplierUsers = useMemo(
    () => users.filter((u) => u.role === 'SUPPLIER'),
    [users]
  );

  const [payouts, setPayouts] = useState<SupplierPayout[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fallbackSuppliersLoaded, setFallbackSuppliersLoaded] = useState(false);
  const [fallbackOrders, setFallbackOrders] = useState<typeof orders>([]);
  const [statusFilter, setStatusFilter] = useState<PayoutStatusFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  // Record payout form state
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formOrderId, setFormOrderId] = useState('');

  const orderPool = useMemo(() => (orders.length > 0 ? orders : fallbackOrders), [orders, fallbackOrders]);
  const supplierOrders = useMemo(
    () => orderPool.filter((o) => formSupplierId ? o.supplierId === formSupplierId : true),
    [orderPool, formSupplierId]
  );
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState('SAR');
  const [formPaymentMethod, setFormPaymentMethod] = useState('Bank Transfer');
  const [formReferenceNumber, setFormReferenceNumber] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadPayouts = async () => {
      setIsLoading(true);
      try {
        await Promise.allSettled([loadUsers(), loadOrders()]);
        const rows = await payoutService.getSupplierPayouts();
        if (!isMounted) return;
        setPayouts(rows);
      } catch (error) {
        logger.error('Failed to load payout data', error);
        if (isMounted) {
          toast.error(t('admin.payouts.loadError', 'Failed to load payouts'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadPayouts();
    return () => {
      isMounted = false;
    };
  }, [loadOrders, loadUsers]);

  useEffect(() => {
    if (supplierUsers.length > 0 || fallbackSuppliersLoaded) return;

    const loadSupplierFallback = async () => {
      try {
        const supplierRows = await api.getUsersByRole(UserRole.SUPPLIER);
        if (supplierRows.length > 0) {
          // Hydrate store if direct load failed due stale state.
          useStore.setState((state) => ({
            users: [
              ...state.users.filter((user) => user.role !== 'SUPPLIER'),
              ...supplierRows,
            ],
          }));
        }
      } catch (error) {
        logger.error('Failed to load suppliers for payout form', error);
      } finally {
        setFallbackSuppliersLoaded(true);
      }
    };

    void loadSupplierFallback();
  }, [fallbackSuppliersLoaded, supplierUsers.length]);

  useEffect(() => {
    if (orders.length > 0) {
      setFallbackOrders([]);
      return;
    }

    let isActive = true;
    const loadFallbackOrders = async () => {
      try {
        const rows = await api.getOrders({}, { page: 1, pageSize: 500 });
        if (!isActive) return;
        setFallbackOrders(rows);
      } catch (error) {
        logger.error('Failed to load fallback orders for payouts view', error);
      }
    };

    void loadFallbackOrders();
    return () => {
      isActive = false;
    };
  }, [orders]);

  const getSupplierName = (supplierId: string): string => {
    const supplier = users.find((u) => u.id === supplierId);
    return supplier?.companyName || supplier?.name || supplierId;
  };

  const filteredPayouts = useMemo(() => {
    let result = payouts;

    if (statusFilter !== 'ALL') {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.id.toLowerCase().includes(term) ||
          p.orderId.toLowerCase().includes(term) ||
          getSupplierName(p.supplierId).toLowerCase().includes(term) ||
          (p.referenceNumber && p.referenceNumber.toLowerCase().includes(term))
      );
    }

    return result;
  }, [payouts, statusFilter, searchTerm, users]);

  const statusTabs: { key: PayoutStatusFilter; label: string }[] = [
    { key: 'ALL', label: t('common.all', 'All') },
    { key: 'PENDING', label: t('admin.payouts.statusPending', 'Pending') },
    { key: 'PROCESSING', label: t('admin.payouts.statusProcessing', 'Processing') },
    { key: 'PAID', label: t('admin.payouts.statusPaid', 'Paid') },
    { key: 'FAILED', label: t('admin.payouts.statusFailed', 'Failed') },
  ];

  const handleMarkAsProcessing = async (payoutId: string) => {
    logger.info('Mark payout as processing - will call admin_update_payout_status RPC', { payoutId });
    const success = await payoutService.updatePayoutStatus(payoutId, 'PROCESSING');
    if (!success) {
      toast.error(t('common.error', 'Something went wrong'));
      return;
    }
    setPayouts((prev) => prev.map((p) => (p.id === payoutId ? { ...p, status: 'PROCESSING' as const } : p)));
    toast.success(t('admin.payouts.markProcessing', 'Mark Processing'));
  };

  const handleMarkAsPaid = async (payoutId: string) => {
    logger.info('Mark payout as paid - will call admin_update_payout_status RPC', { payoutId });
    const success = await payoutService.updatePayoutStatus(payoutId, 'PAID');
    if (!success) {
      toast.error(t('common.error', 'Something went wrong'));
      return;
    }
    setPayouts((prev) =>
      prev.map((p) =>
        p.id === payoutId
          ? { ...p, status: 'PAID' as const, paidAt: new Date().toISOString() }
          : p
      )
    );
    toast.success(t('admin.payouts.markPaid', 'Mark Paid'));
  };

  const handleRecordPayout = async () => {
    if (!formSupplierId.trim() || !formOrderId.trim() || !formAmount.trim()) {
      return;
    }

    const newPayout: SupplierPayout = {
      id: `PAY-${Date.now()}`,
      supplierId: formSupplierId.trim(),
      orderId: formOrderId.trim(),
      amount: parseFloat(formAmount),
      currency: formCurrency,
      status: 'PENDING',
      paymentMethod: formPaymentMethod,
      referenceNumber: formReferenceNumber.trim() || undefined,
      notes: formNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    logger.info('Record new payout - will call admin_record_supplier_payout RPC', { newPayout });
    const created = await payoutService.recordSupplierPayout({
      supplierId: newPayout.supplierId,
      orderId: newPayout.orderId,
      amount: newPayout.amount,
      paymentMethod: newPayout.paymentMethod,
      referenceNumber: newPayout.referenceNumber,
      notes: newPayout.notes,
      currency: newPayout.currency,
    });

    if (!created) {
      toast.error(t('common.error', 'Something went wrong'));
      return;
    }

    setPayouts((prev) => [created, ...prev]);
    toast.success(t('admin.payouts.recordPayout', 'Record Payout'));
    resetForm();
    setIsRecordModalOpen(false);
  };

  const resetForm = () => {
    setFormSupplierId('');
    setFormOrderId('');
    setFormAmount('');
    setFormCurrency('SAR');
    setFormPaymentMethod('Bank Transfer');
    setFormReferenceNumber('');
    setFormNotes('');
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-SA', {
      style: 'currency',
      currency: currency || 'SAR',
    }).format(amount);
  };

  const summaryStats = useMemo(() => {
    const pending = payouts.filter((p) => p.status === 'PENDING');
    const processing = payouts.filter((p) => p.status === 'PROCESSING');
    const paid = payouts.filter((p) => p.status === 'PAID');
    const failed = payouts.filter((p) => p.status === 'FAILED');

    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, p) => sum + p.amount, 0),
      processingCount: processing.length,
      processingAmount: processing.reduce((sum, p) => sum + p.amount, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, p) => sum + p.amount, 0),
      failedCount: failed.length,
    };
  }, [payouts]);

  return (
    <div data-testid="admin-payouts-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal', 'Admin Portal')}
          title={t('admin.payouts.title', 'Supplier Payout Queue')}
          subtitle={t('admin.payouts.subtitle', 'Manage and track supplier payments')}
          actions={(
            <button
              onClick={() => setIsRecordModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              {t('admin.payouts.recordPayout', 'Record Payout')}
            </button>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PortalMetricCard
            tone="warning"
            icon="schedule"
            label={t('admin.payouts.pendingPayouts', 'Pending')}
            value={summaryStats.pendingCount}
            hint={formatCurrency(summaryStats.pendingAmount, 'SAR')}
          />
          <PortalMetricCard
            tone="info"
            icon="sync"
            label={t('admin.payouts.processingPayouts', 'Processing')}
            value={summaryStats.processingCount}
            hint={formatCurrency(summaryStats.processingAmount, 'SAR')}
          />
          <PortalMetricCard
            tone="success"
            icon="check_circle"
            label={t('admin.payouts.paidPayouts', 'Paid')}
            value={summaryStats.paidCount}
            hint={formatCurrency(summaryStats.paidAmount, 'SAR')}
          />
          <PortalMetricCard
            tone="neutral"
            icon="error"
            label={t('admin.payouts.failedPayouts', 'Failed')}
            value={summaryStats.failedCount}
          />
        </div>

        <PortalSection bodyClassName="space-y-4">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder={t('admin.payouts.searchPlaceholder', 'Search by payout ID, order, or supplier...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${statusFilter === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('admin.payouts.columnSupplier', 'Supplier')}
                    </th>
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('admin.payouts.columnOrder', 'Order')}
                    </th>
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('admin.payouts.columnAmount', 'Amount')}
                    </th>
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('common.status', 'Status')}
                    </th>
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('admin.payouts.columnPaymentMethod', 'Payment Method')}
                    </th>
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('common.date', 'Date')}
                    </th>
                    <th className="text-left rtl:text-right px-4 py-3 font-medium text-slate-500">
                      {t('common.actions', 'Actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                        {t('common.loading', 'Loading...')}
                      </td>
                    </tr>
                  ) : filteredPayouts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <span className="material-symbols-outlined text-4xl text-slate-300">
                            payments
                          </span>
                          <p className="text-sm text-slate-500">
                            {t('admin.payouts.noPayouts', 'No payouts found')}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredPayouts.map((payout) => (
                      <tr
                        key={payout.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-900">
                              {getSupplierName(payout.supplierId)}
                            </p>
                            <p className="text-xs text-slate-400">{payout.id}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{payout.orderId}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatCurrency(payout.amount, payout.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={statusToBadge(payout.status)} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {payout.paymentMethod || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(payout.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {payout.status === 'PENDING' && (
                              <button
                                onClick={() => handleMarkAsProcessing(payout.id)}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                {t('admin.payouts.markProcessing', 'Mark Processing')}
                              </button>
                            )}
                            {(payout.status === 'PENDING' || payout.status === 'PROCESSING') && (
                              <button
                                onClick={() => handleMarkAsPaid(payout.id)}
                                className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                              >
                                {t('admin.payouts.markPaid', 'Mark Paid')}
                              </button>
                            )}
                            {payout.status === 'PAID' && (
                              <span className="text-xs text-slate-400">
                                {t('admin.payouts.paidOn', 'Paid on')} {formatDate(payout.paidAt)}
                              </span>
                            )}
                            {payout.status === 'FAILED' && payout.notes && (
                              <span className="text-xs text-red-500" title={payout.notes}>
                                {payout.notes}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </PortalSection>

        {/* Record Payout Modal */}
        <Modal
          isOpen={isRecordModalOpen}
          onClose={() => {
            setIsRecordModalOpen(false);
            resetForm();
          }}
          title={t('admin.payouts.recordPayoutTitle', 'Record Supplier Payout')}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.payouts.supplier', 'Supplier')} *
              </label>
              <select
                value={formSupplierId}
                onChange={(e) => setFormSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">{t('admin.payouts.selectSupplier', 'Select a supplier...')}</option>
                {supplierUsers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.companyName || supplier.name} ({supplier.publicId || supplier.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.payouts.orderId', 'Order ID')} *
              </label>
              <select
                value={formOrderId}
                onChange={(e) => setFormOrderId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">{t('admin.payouts.selectOrder', 'Select an order...')}</option>
                {supplierOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.id.slice(0, 8).toUpperCase()} — {t('common.currency')} {order.amount?.toLocaleString() || '0'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('common.amount', 'Amount')} *
                </label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('admin.payouts.currency', 'Currency')}
                </label>
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="SAR">SAR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.payouts.paymentMethod', 'Payment Method')}
              </label>
              <select
                value={formPaymentMethod}
                onChange={(e) => setFormPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Bank Transfer">{t('admin.payouts.bankTransfer', 'Bank Transfer')}</option>
                <option value="Wire Transfer">{t('admin.payouts.wireTransfer', 'Wire Transfer')}</option>
                <option value="Check">{t('admin.payouts.check', 'Check')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('admin.payouts.referenceNumber', 'Reference Number')}
              </label>
              <input
                type="text"
                value={formReferenceNumber}
                onChange={(e) => setFormReferenceNumber(e.target.value)}
                placeholder={t('admin.payouts.referenceNumberPlaceholder', 'Optional transaction reference')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('common.notes', 'Notes')}
              </label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={t('admin.payouts.notesPlaceholder', 'Optional notes about this payout...')}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setIsRecordModalOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleRecordPayout}
                disabled={!formSupplierId.trim() || !formOrderId.trim() || !formAmount.trim()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('admin.payouts.recordPayout', 'Record Payout')}
              </button>
            </div>
          </div>
        </Modal>
      </PortalPageShell>
    </div>
  );
};
