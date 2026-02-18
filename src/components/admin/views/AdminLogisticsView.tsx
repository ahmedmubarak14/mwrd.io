import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../hooks/useToast';
import { logisticsService } from '../../../services/logisticsService';
import { logisticsProviderService } from '../../../services/logisticsProviderService';
import { LogisticsProvider, Order, OrderStatus, ShipmentDetails, User, UserRole } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

interface AdminLogisticsViewProps {
  orders: Order[];
  users: User[];
  orderStatusBadgeClasses: Record<string, string>;
  onRefreshOrders: () => Promise<void> | void;
}

type LogisticsTab = 'shipments' | 'providers';
type ProviderFilter = 'all' | 'active' | 'inactive';

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/* ---------- empty form helper ---------- */
const emptyProviderForm = (): Omit<LogisticsProvider, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  serviceAreas: [],
  isActive: true,
  notes: '',
});

export const AdminLogisticsView: React.FC<AdminLogisticsViewProps> = ({
  orders,
  users,
  orderStatusBadgeClasses,
  onRefreshOrders,
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  /* ---- top-level tab ---- */
  const [activeTab, setActiveTab] = useState<LogisticsTab>('shipments');

  /* ===================== SHIPMENTS STATE ===================== */
  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);
  const [dispatchCarrier, setDispatchCarrier] = useState('');
  const [dispatchTrackingNumber, setDispatchTrackingNumber] = useState('');
  const [dispatchTrackingUrl, setDispatchTrackingUrl] = useState('');
  const [dispatchEstimatedDeliveryDate, setDispatchEstimatedDeliveryDate] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isDispatchSubmitting, setIsDispatchSubmitting] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingNumberInput, setTrackingNumberInput] = useState('');
  const [trackingUrlInput, setTrackingUrlInput] = useState('');
  const [isTrackingSubmitting, setIsTrackingSubmitting] = useState(false);
  const [markDeliveredOrderId, setMarkDeliveredOrderId] = useState<string | null>(null);
  const [logisticsSearchTerm, setLogisticsSearchTerm] = useState('');

  /* ===================== PROVIDERS STATE ===================== */
  const [providers, setProviders] = useState<LogisticsProvider[]>([]);
  const [isProvidersLoading, setIsProvidersLoading] = useState(false);
  const [providerActionId, setProviderActionId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState(emptyProviderForm());
  const [serviceAreaInput, setServiceAreaInput] = useState('');

  const loadProviders = useCallback(async () => {
    setIsProvidersLoading(true);
    try {
      const rows = await logisticsProviderService.listProviders();
      setProviders(rows);
    } catch (error) {
      logger.error('Failed to load logistics providers:', error);
      toast.error(t('admin.logistics.providers.loadError'));
    } finally {
      setIsProvidersLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  /* ===================== SHIPMENTS LOGIC ===================== */
  const resetDispatchForm = () => {
    setDispatchOrderId(null);
    setDispatchCarrier('');
    setDispatchTrackingNumber('');
    setDispatchTrackingUrl('');
    setDispatchEstimatedDeliveryDate('');
    setDispatchNotes('');
    setIsDispatchSubmitting(false);
  };

  const openDispatchForm = (order: Order) => {
    setDispatchOrderId(order.id);
    setDispatchCarrier(order.shipment?.carrier || '');
    setDispatchTrackingNumber(order.shipment?.trackingNumber || '');
    setDispatchTrackingUrl(order.shipment?.trackingUrl || '');
    setDispatchEstimatedDeliveryDate(
      order.shipment?.estimatedDeliveryDate
        ? String(order.shipment.estimatedDeliveryDate).split('T')[0]
        : ''
    );
    setDispatchNotes(order.shipment?.notes || '');
  };

  const handleCreateShipment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dispatchOrderId) return;

    const carrier = dispatchCarrier.trim();
    const trackingNumber = dispatchTrackingNumber.trim();

    if (!carrier || !trackingNumber) {
      toast.error(t('admin.logistics.dispatchMissingFields'));
      return;
    }

    const shipment: ShipmentDetails = {
      carrier,
      trackingNumber,
      trackingUrl: dispatchTrackingUrl.trim() || undefined,
      estimatedDeliveryDate: dispatchEstimatedDeliveryDate || undefined,
      notes: dispatchNotes.trim() || undefined,
      shippedDate: new Date().toISOString(),
    };

    setIsDispatchSubmitting(true);
    try {
      await logisticsService.createShipment(dispatchOrderId, shipment);
      toast.success(t('admin.logistics.dispatchSuccess'));
      await Promise.resolve(onRefreshOrders());
      resetDispatchForm();
    } catch (error) {
      logger.error('Failed to create shipment:', error);
      toast.error(t('admin.logistics.dispatchError'));
    } finally {
      setIsDispatchSubmitting(false);
    }
  };

  const resetTrackingForm = () => {
    setTrackingOrderId(null);
    setTrackingNumberInput('');
    setTrackingUrlInput('');
    setIsTrackingSubmitting(false);
  };

  const openTrackingForm = (order: Order) => {
    setTrackingOrderId(order.id);
    setTrackingNumberInput(order.shipment?.trackingNumber || '');
    setTrackingUrlInput(order.shipment?.trackingUrl || '');
  };

  const handleUpdateTracking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trackingOrderId) return;

    const trackingNumber = trackingNumberInput.trim();
    if (!trackingNumber) {
      toast.error(t('admin.logistics.trackingRequired'));
      return;
    }

    setIsTrackingSubmitting(true);
    try {
      await logisticsService.updateTracking(
        trackingOrderId,
        trackingNumber,
        trackingUrlInput.trim() || undefined
      );
      toast.success(t('admin.logistics.trackingSuccess'));
      await Promise.resolve(onRefreshOrders());
      resetTrackingForm();
    } catch (error) {
      logger.error('Failed to update tracking:', error);
      toast.error(t('admin.logistics.trackingError'));
    } finally {
      setIsTrackingSubmitting(false);
    }
  };

  const handleMarkAsDelivered = async (orderId: string) => {
    setMarkDeliveredOrderId(orderId);
    try {
      await logisticsService.markAsDelivered(orderId);
      toast.success(t('admin.logistics.markDeliveredSuccess'));
      await Promise.resolve(onRefreshOrders());
      if (trackingOrderId === orderId) {
        resetTrackingForm();
      }
    } catch (error) {
      logger.error('Failed to mark order as delivered:', error);
      toast.error(t('admin.logistics.markDeliveredError'));
    } finally {
      setMarkDeliveredOrderId(null);
    }
  };

  const logisticsQuery = logisticsSearchTerm.trim().toLowerCase();

  const clientsById = useMemo(
    () =>
      new Map(
        users
          .filter((user) => user.role === UserRole.CLIENT)
          .map((user) => [user.id, user.companyName || user.name || t('admin.logistics.unknownDestination')])
      ),
    [t, users]
  );

  const suppliersById = useMemo(
    () =>
      new Map(
        users
          .filter((user) => user.role === UserRole.SUPPLIER)
          .map((user) => [user.id, user.companyName || user.name || t('admin.logistics.unknownSupplier')])
      ),
    [t, users]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!logisticsQuery) return true;
        const supplierName = suppliersById.get(order.supplierId) || '';
        const destinationName = clientsById.get(order.clientId) || '';
        const trackingNumber = order.shipment?.trackingNumber || '';
        const haystack = `${order.id} ${supplierName} ${destinationName} ${trackingNumber}`.toLowerCase();
        return haystack.includes(logisticsQuery);
      }),
    [clientsById, logisticsQuery, orders, suppliersById]
  );

  const dispatchQueueOrders = filteredOrders.filter((order) => {
    const hasShipment = Boolean(order.shipment?.trackingNumber || order.shipment?.carrier);
    if (hasShipment) return false;
    return [
      OrderStatus.PAYMENT_CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.PICKUP_SCHEDULED,
    ].includes(order.status as OrderStatus);
  });

  const shipmentOrders = filteredOrders
    .filter((order) => {
      const hasShipment = Boolean(order.shipment?.trackingNumber || order.shipment?.carrier);
      return hasShipment || [
        OrderStatus.SHIPPED,
        OrderStatus.IN_TRANSIT,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
      ].includes(order.status as OrderStatus);
    })
    .sort((a, b) => {
      const aDate = parseDate(a.updatedAt || a.createdAt || a.date);
      const bDate = parseDate(b.updatedAt || b.createdAt || b.date);
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
    });

  const activeShipmentCount = shipmentOrders.filter((order) => order.status !== OrderStatus.DELIVERED).length;
  const deliveredTodayCount = shipmentOrders.filter((order) => {
    if (order.status !== OrderStatus.DELIVERED) return false;
    const deliveredAt = parseDate(order.updatedAt || order.date);
    if (!deliveredAt) return false;
    const now = new Date();
    return deliveredAt.toDateString() === now.toDateString();
  }).length;

  const selectedDispatchOrder = dispatchOrderId ? orders.find((order) => order.id === dispatchOrderId) || null : null;
  const selectedTrackingOrder = trackingOrderId ? orders.find((order) => order.id === trackingOrderId) || null : null;

  /* ===================== PROVIDERS LOGIC ===================== */
  const filteredProviders = useMemo(() => {
    let list = providers;
    if (providerFilter === 'active') list = list.filter((p) => p.isActive);
    if (providerFilter === 'inactive') list = list.filter((p) => !p.isActive);

    const query = providerSearchTerm.trim().toLowerCase();
    if (query) {
      list = list.filter((p) => {
        const haystack = `${p.name} ${p.contactName} ${p.contactEmail} ${p.serviceAreas.join(' ')}`.toLowerCase();
        return haystack.includes(query);
      });
    }
    return list;
  }, [providerFilter, providerSearchTerm, providers]);

  const openAddProviderModal = useCallback(() => {
    setEditingProviderId(null);
    setProviderForm(emptyProviderForm());
    setServiceAreaInput('');
    setShowProviderModal(true);
  }, []);

  const openEditProviderModal = useCallback((provider: LogisticsProvider) => {
    setEditingProviderId(provider.id);
    setProviderForm({
      name: provider.name,
      contactName: provider.contactName,
      contactPhone: provider.contactPhone,
      contactEmail: provider.contactEmail,
      serviceAreas: [...provider.serviceAreas],
      isActive: provider.isActive,
      notes: provider.notes || '',
    });
    setServiceAreaInput('');
    setShowProviderModal(true);
  }, []);

  const closeProviderModal = useCallback(() => {
    setShowProviderModal(false);
    setEditingProviderId(null);
    setProviderForm(emptyProviderForm());
    setServiceAreaInput('');
  }, []);

  const addServiceArea = useCallback(() => {
    const area = serviceAreaInput.trim();
    if (area && !providerForm.serviceAreas.includes(area)) {
      setProviderForm((prev) => ({ ...prev, serviceAreas: [...prev.serviceAreas, area] }));
    }
    setServiceAreaInput('');
  }, [providerForm.serviceAreas, serviceAreaInput]);

  const removeServiceArea = useCallback((area: string) => {
    setProviderForm((prev) => ({
      ...prev,
      serviceAreas: prev.serviceAreas.filter((a) => a !== area),
    }));
  }, []);

  const handleServiceAreaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addServiceArea();
      }
    },
    [addServiceArea]
  );

  const handleSaveProvider = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!providerForm.name.trim()) {
        toast.error(t('admin.logistics.providers.nameRequired'));
        return;
      }
      if (!providerForm.contactName.trim()) {
        toast.error(t('admin.logistics.providers.contactNameRequired'));
        return;
      }
      if (!providerForm.contactPhone.trim()) {
        toast.error(t('admin.logistics.providers.contactPhoneRequired'));
        return;
      }
      if (!providerForm.contactEmail.trim()) {
        toast.error(t('admin.logistics.providers.contactEmailRequired'));
        return;
      }

      setProviderActionId(editingProviderId || 'create');
      try {
        if (editingProviderId) {
          await logisticsProviderService.updateProvider(editingProviderId, providerForm);
          toast.success(t('admin.logistics.providers.providerUpdated'));
        } else {
          await logisticsProviderService.createProvider(providerForm);
          toast.success(t('admin.logistics.providers.providerCreated'));
        }
        await loadProviders();
        closeProviderModal();
      } catch (error) {
        logger.error('Failed to save logistics provider', error);
        toast.error(t('admin.logistics.providers.providerSaveError'));
      } finally {
        setProviderActionId(null);
      }
    },
    [closeProviderModal, editingProviderId, loadProviders, providerForm, t, toast]
  );

  const handleToggleProviderActive = useCallback(
    async (provider: LogisticsProvider) => {
      setProviderActionId(provider.id);
      try {
        await logisticsProviderService.updateProvider(provider.id, {
          isActive: !provider.isActive,
        });
        setProviders((prev) =>
          prev.map((p) => (
            p.id === provider.id
              ? { ...p, isActive: !provider.isActive }
              : p
          ))
        );
        toast.success(t('admin.logistics.providers.providerStatusUpdated'));
      } catch (error) {
        logger.error('Failed to update logistics provider status', error);
        toast.error(t('admin.logistics.providers.providerStatusUpdateError'));
      } finally {
        setProviderActionId(null);
      }
    },
    [t, toast]
  );

  /* ===================== RENDER ===================== */
  return (
    <div data-testid="admin-logistics-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.logistics')}
          subtitle={t('admin.logistics.subtitle')}
        />

        <div className="space-y-8">
      {/* ---- Tab Toggle ---- */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('shipments')}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'shipments'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="material-symbols-outlined text-base">local_shipping</span>
          {t('admin.logistics.tabShipments')}
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'providers'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="material-symbols-outlined text-base">business</span>
          {t('admin.logistics.tabProviders')}
        </button>
      </div>

      {/* ================================================================= */}
      {/*                         SHIPMENTS TAB                             */}
      {/* ================================================================= */}
      {activeTab === 'shipments' && (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">{t('admin.logistics.activeShipments')}</h3>
              <p className="text-4xl font-bold text-slate-900">{activeShipmentCount}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">{t('admin.logistics.deliveredToday')}</h3>
              <p className="text-4xl font-bold text-slate-900">{deliveredTodayCount}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">{t('admin.logistics.pendingDispatch')}</h3>
              <p className="text-4xl font-bold text-slate-900">{dispatchQueueOrders.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                  value={logisticsSearchTerm}
                  onChange={(event) => setLogisticsSearchTerm(event.target.value)}
                  placeholder={t('admin.logistics.searchPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
              </div>
              <button
                onClick={() => Promise.resolve(onRefreshOrders())}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
                {t('common.refresh')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600">inventory_2</span>
                {t('admin.logistics.dispatchQueue')}
              </h3>
              <p className="text-sm text-slate-500 mt-1">{t('admin.logistics.dispatchQueueHint')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.orderId')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.supplier')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.destination')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.status')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.orders.amount')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">{t('admin.logistics.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dispatchQueueOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">{t('admin.logistics.noDispatchQueue')}</td>
                    </tr>
                  ) : (
                    dispatchQueueOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-900">{order.id}</td>
                        <td className="p-4 text-sm text-slate-700">{suppliersById.get(order.supplierId) || t('admin.logistics.unknownSupplier')}</td>
                        <td className="p-4 text-sm text-slate-700">{clientsById.get(order.clientId) || t('admin.logistics.unknownDestination')}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClasses[order.status] || 'bg-slate-100 text-slate-700'}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-4 text-sm font-semibold text-slate-800">{t('common.currency')} {order.amount.toLocaleString()}</td>
                        <td className="p-4">
                          <div className="flex justify-end">
                            <button
                              onClick={() => openDispatchForm(order)}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">local_shipping</span>
                              {t('admin.logistics.dispatchOrder')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedDispatchOrder && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {t('admin.logistics.dispatchFormTitle')} #{selectedDispatchOrder.id}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {t('admin.logistics.dispatchFormHint')}
                  </p>
                </div>
                <button
                  onClick={resetDispatchForm}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                  aria-label={t('common.close')}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleCreateShipment} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.carrier')}</span>
                  <input
                    value={dispatchCarrier}
                    onChange={(event) => setDispatchCarrier(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.carrierPlaceholder')}
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingNumber')}</span>
                  <input
                    value={dispatchTrackingNumber}
                    onChange={(event) => setDispatchTrackingNumber(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.trackingNumberPlaceholder')}
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingUrl')}</span>
                  <input
                    value={dispatchTrackingUrl}
                    onChange={(event) => setDispatchTrackingUrl(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.trackingUrlPlaceholder')}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.eta')}</span>
                  <input
                    type="date"
                    value={dispatchEstimatedDeliveryDate}
                    onChange={(event) => setDispatchEstimatedDeliveryDate(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.notes')}</span>
                  <textarea
                    value={dispatchNotes}
                    onChange={(event) => setDispatchNotes(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 min-h-[96px]"
                    placeholder={t('admin.logistics.notesPlaceholder')}
                  />
                </label>
                <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetDispatchForm}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isDispatchSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isDispatchSubmitting && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                    {t('admin.logistics.createShipment')}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">local_shipping</span>
                {t('admin.logistics.liveTracking')}
              </h3>
              <button
                onClick={() => window.open('https://www.google.com/maps/search/logistics+tracking', '_blank', 'noopener,noreferrer')}
                className="text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {t('admin.logistics.viewMap')}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.shipmentId')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.orderId')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.supplier')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.destination')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.status')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.eta')}</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">{t('admin.logistics.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shipmentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">{t('admin.logistics.noShipments')}</td>
                    </tr>
                  ) : (
                    shipmentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-900">
                          {order.shipment?.trackingNumber || `TRK-${order.id.slice(-8).toUpperCase()}`}
                        </td>
                        <td className="p-4 text-sm font-medium text-slate-700">{order.id}</td>
                        <td className="p-4 text-sm font-bold text-slate-700">{suppliersById.get(order.supplierId) || t('admin.logistics.unknownSupplier')}</td>
                        <td className="p-4 text-sm text-slate-500">{clientsById.get(order.clientId) || t('admin.logistics.unknownDestination')}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClasses[order.status] || 'bg-slate-100 text-slate-700'}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-4 text-sm font-bold text-slate-700">
                          {order.shipment?.estimatedDeliveryDate
                            ? new Date(order.shipment.estimatedDeliveryDate).toLocaleDateString()
                            : t('common.toBeDetermined')}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => openTrackingForm(order)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                              {t('admin.logistics.updateTracking')}
                            </button>
                            {order.status !== OrderStatus.DELIVERED && (
                              <button
                                onClick={() => handleMarkAsDelivered(order.id)}
                                disabled={markDeliveredOrderId === order.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {markDeliveredOrderId === order.id && (
                                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                )}
                                {t('admin.logistics.markDelivered')}
                              </button>
                            )}
                            {order.shipment?.trackingUrl && (
                              <a
                                href={order.shipment.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                              >
                                <span className="material-symbols-outlined text-sm">open_in_new</span>
                                {t('admin.logistics.track')}
                              </a>
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

          {selectedTrackingOrder && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {t('admin.logistics.editTrackingTitle')} #{selectedTrackingOrder.id}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {t('admin.logistics.editTrackingHint')}
                  </p>
                </div>
                <button
                  onClick={resetTrackingForm}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                  aria-label={t('common.close')}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleUpdateTracking} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingNumber')}</span>
                  <input
                    value={trackingNumberInput}
                    onChange={(event) => setTrackingNumberInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.trackingNumberPlaceholder')}
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.trackingUrl')}</span>
                  <input
                    value={trackingUrlInput}
                    onChange={(event) => setTrackingUrlInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.trackingUrlPlaceholder')}
                  />
                </label>
                <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetTrackingForm}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isTrackingSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isTrackingSubmitting && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                    {t('admin.logistics.saveTracking')}
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/*                         PROVIDERS TAB                             */}
      {/* ================================================================= */}
      {activeTab === 'providers' && (
        <>
          {/* Header + Add button */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{t('admin.logistics.providers.title')}</h2>
              <p className="text-sm text-slate-500 mt-1">{t('admin.logistics.providers.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadProviders()}
                disabled={isProvidersLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-base ${isProvidersLoading ? 'animate-spin' : ''}`}>refresh</span>
                {t('common.refresh')}
              </button>
              <button
                onClick={openAddProviderModal}
                disabled={isProvidersLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="material-symbols-outlined text-base">add</span>
                {t('admin.logistics.providers.addProvider')}
              </button>
            </div>
          </div>

          {/* Search & Filter bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                  value={providerSearchTerm}
                  onChange={(event) => setProviderSearchTerm(event.target.value)}
                  placeholder={t('admin.logistics.providers.searchPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(
                  [
                    ['all', t('admin.logistics.providers.filterAll')],
                    ['active', t('admin.logistics.providers.filterActive')],
                    ['inactive', t('admin.logistics.providers.filterInactive')],
                  ] as [ProviderFilter, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setProviderFilter(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      providerFilter === key
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Provider list */}
          {isProvidersLoading ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-400 mb-2 block animate-spin">progress_activity</span>
              <p className="text-sm text-slate-500">{t('admin.logistics.providers.loading')}</p>
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">business</span>
              <h3 className="text-lg font-bold text-slate-700 mb-1">{t('admin.logistics.providers.noProviders')}</h3>
              <p className="text-sm text-slate-500">{t('admin.logistics.providers.noProvidersHint')}</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    {/* Left: provider info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-bold text-slate-900 truncate">{provider.name}</h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            provider.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {provider.isActive
                            ? t('admin.logistics.providers.active')
                            : t('admin.logistics.providers.inactive')}
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-3 text-sm mb-3">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="material-symbols-outlined text-base text-slate-400">person</span>
                          <span className="truncate">{provider.contactName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="material-symbols-outlined text-base text-slate-400">phone</span>
                          <span className="truncate">{provider.contactPhone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="material-symbols-outlined text-base text-slate-400">mail</span>
                          <span className="truncate">{provider.contactEmail}</span>
                        </div>
                      </div>

                      {/* Service areas */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="material-symbols-outlined text-base text-slate-400">location_on</span>
                        {provider.serviceAreas.length > 0 ? (
                          provider.serviceAreas.map((area) => (
                            <span
                              key={area}
                              className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                            >
                              {area}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">{t('admin.logistics.providers.noAreas')}</span>
                        )}
                      </div>

                      {provider.notes && (
                        <p className="text-xs text-slate-500 mt-2 italic">{provider.notes}</p>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEditProviderModal(provider)}
                        disabled={providerActionId === provider.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleToggleProviderActive(provider)}
                        disabled={providerActionId === provider.id}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          provider.isActive
                            ? 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className={`material-symbols-outlined text-sm ${providerActionId === provider.id ? 'animate-spin' : ''}`}>
                          {providerActionId === provider.id
                            ? 'progress_activity'
                            : (provider.isActive ? 'toggle_off' : 'toggle_on')}
                        </span>
                        {provider.isActive
                          ? t('admin.logistics.providers.inactive')
                          : t('admin.logistics.providers.active')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/*                    PROVIDER FORM MODAL                            */}
      {/* ================================================================= */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeProviderModal}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-900">
                {editingProviderId
                  ? t('admin.logistics.providers.editProvider')
                  : t('admin.logistics.providers.addProvider')}
              </h3>
              <button
                onClick={closeProviderModal}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                aria-label={t('common.close')}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="p-6 space-y-5">
              {/* Name */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">
                  {t('admin.logistics.providers.providerName')} *
                </span>
                <input
                  value={providerForm.name}
                  onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  placeholder={t('admin.logistics.providers.providerNamePlaceholder')}
                  required
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contact Name */}
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">
                    {t('admin.logistics.providers.contactName')} *
                  </span>
                  <input
                    value={providerForm.contactName}
                    onChange={(e) => setProviderForm((f) => ({ ...f, contactName: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.providers.contactNamePlaceholder')}
                    required
                  />
                </label>

                {/* Contact Phone */}
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">
                    {t('admin.logistics.providers.contactPhone')} *
                  </span>
                  <input
                    value={providerForm.contactPhone}
                    onChange={(e) => setProviderForm((f) => ({ ...f, contactPhone: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.providers.contactPhonePlaceholder')}
                    required
                  />
                </label>
              </div>

              {/* Contact Email */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">
                  {t('admin.logistics.providers.contactEmail')} *
                </span>
                <input
                  type="email"
                  value={providerForm.contactEmail}
                  onChange={(e) => setProviderForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  placeholder={t('admin.logistics.providers.contactEmailPlaceholder')}
                  required
                />
              </label>

              {/* Service Areas */}
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-700 block">
                  {t('admin.logistics.providers.serviceAreas')}
                </span>
                <div className="flex flex-wrap gap-2 mb-2">
                  {providerForm.serviceAreas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-medium"
                    >
                      {area}
                      <button
                        type="button"
                        onClick={() => removeServiceArea(area)}
                        className="ml-0.5 text-blue-400 hover:text-blue-600"
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={serviceAreaInput}
                    onChange={(e) => setServiceAreaInput(e.target.value)}
                    onKeyDown={handleServiceAreaKeyDown}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    placeholder={t('admin.logistics.providers.serviceAreasPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={addServiceArea}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                  </button>
                </div>
                <p className="text-xs text-slate-400">{t('admin.logistics.providers.serviceAreasHint')}</p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={providerForm.isActive}
                  onClick={() => setProviderForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    providerForm.isActive ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      providerForm.isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  {providerForm.isActive
                    ? t('admin.logistics.providers.active')
                    : t('admin.logistics.providers.inactive')}
                </span>
              </div>

              {/* Notes */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">{t('admin.logistics.providers.notes')}</span>
                <textarea
                  value={providerForm.notes}
                  onChange={(e) => setProviderForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 min-h-[80px]"
                  placeholder={t('admin.logistics.providers.notesPlaceholder')}
                />
              </label>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeProviderModal}
                  disabled={Boolean(providerActionId)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={Boolean(providerActionId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {providerActionId && (
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                  )}
                  {t('admin.logistics.providers.saveProvider')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      </PortalPageShell>
    </div>
  );
};
