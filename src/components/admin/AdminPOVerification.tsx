import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orderDocumentService, OrderDocument, logPOAudit } from '../../services/orderDocumentService';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { StatusBadge } from '../ui/StatusBadge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { logger } from '../../utils/logger';
import { UserRole } from '../../types/types';

interface PendingPO {
  document?: OrderDocument;
  order: {
    id: string;
    clientId: string;
    amount: number;
    date: string;
    status: string;
  };
  clientName: string;
  documentLoading?: boolean;
  documentLoadError?: string;
}

type PendingOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

const DOCUMENT_FETCH_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

export const AdminPOVerification: React.FC = () => {
  const { t } = useTranslation();
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  const currentUser = useStore((state) => state.currentUser);
  const orders = useStore((state) => state.orders);
  const users = useStore((state) => state.users) || [];
  const products = useStore((state) => state.products) || [];
  const quotes = useStore((state) => state.quotes) || [];
  const rfqs = useStore((state) => state.rfqs) || [];
  const loadUsers = useStore((state) => state.loadUsers);
  const loadOrders = useStore((state) => state.loadOrders);
  const loadProducts = useStore((state) => state.loadProducts);
  const loadQuotes = useStore((state) => state.loadQuotes);
  const loadRFQs = useStore((state) => state.loadRFQs);
  const updateOrder = useStore((state) => state.updateOrder);
  const addNotification = useStore((state) => state.addNotification);

  const [pendingPOs, setPendingPOs] = useState<PendingPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<OrderDocument | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingPO | null>(null);
  const [pendingRejection, setPendingRejection] = useState<PendingPO | null>(null);
  const [actionErrorsByOrder, setActionErrorsByOrder] = useState<Record<string, string>>({});
  const [uploadingByOrder, setUploadingByOrder] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadPendingPOs = useCallback(async (forceReloadDocs: boolean = false) => {
    try {
      setLoading(true);
      setLoadError(null);

      const pendingOrders = orders.filter((order) => {
        const status = String(order.status || '').toUpperCase();
        return status === 'PENDING_ADMIN_CONFIRMATION' || status === 'PENDING_PO';
      });

      const existingByOrderId = new Map(pendingPOs.map((item) => [item.order.id, item]));

      const pendingBase: PendingPO[] = pendingOrders.map((order) => {
        const client = users.find((u) => u.id === order.clientId);
        const existing = existingByOrderId.get(order.id);
        const shouldReloadDoc = forceReloadDocs;

        return {
          order: {
            id: order.id,
            clientId: order.clientId,
            amount: order.amount,
            date: order.date,
            status: String(order.status),
          },
          clientName: client?.companyName || client?.name || t('admin.overview.unknownClient'),
          document: shouldReloadDoc ? undefined : existing?.document,
          documentLoadError: shouldReloadDoc ? undefined : existing?.documentLoadError,
          documentLoading: false,
        };
      });

      setPendingPOs(pendingBase);
      setActionErrorsByOrder({});
      setLoading(false);
    } catch (error) {
      const message = getErrorMessage(error, t('errors.failedToLoad'));
      logger.error('Error loading pending POs:', error);
      setLoadError(message);
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  }, [orders, pendingPOs, showErrorToast, t, users]);

  const resolveOrderDocument = useCallback(async (orderId: string): Promise<OrderDocument | null> => {
    setPendingPOs((prev) =>
      prev.map((item) =>
        item.order.id === orderId
          ? { ...item, documentLoading: true, documentLoadError: undefined }
          : item
      )
    );

    try {
      const docs = await withTimeout(
        orderDocumentService.getOrderDocumentsMetadata(orderId),
        DOCUMENT_FETCH_TIMEOUT_MS,
        `Loading PO documents for order ${orderId}`
      );

      const clientPODocuments = docs.filter(
        (document) => String(document.document_type || '').toUpperCase() === 'CLIENT_PO'
      );
      const clientPO =
        clientPODocuments.find((document) => !document.verified_at && !document.verified_by) ||
        clientPODocuments[0] ||
        null;
      const fallbackDocument = clientPO || docs[0] || null;

      setPendingPOs((prev) =>
        prev.map((item) =>
          item.order.id === orderId
            ? {
                ...item,
                document: fallbackDocument || undefined,
                documentLoading: false,
                documentLoadError: fallbackDocument
                  ? (clientPO ? undefined : 'Client PO document not found. Showing latest available order document.')
                  : 'Client PO document not found',
              }
            : item
        )
      );

      return fallbackDocument;
    } catch (err) {
      logger.error(`Error loading docs for order ${orderId}:`, err);
      setPendingPOs((prev) =>
        prev.map((item) =>
          item.order.id === orderId
            ? {
                ...item,
                document: undefined,
                documentLoading: false,
                documentLoadError: 'Unable to load PO document right now. You can still confirm using order details.',
              }
            : item
        )
      );
      return null;
    }
  }, []);

  const handleManualPOUpload = async (orderId: string, file: File) => {
    if (!currentUser) return;

    try {
      setUploadingByOrder((prev) => ({ ...prev, [orderId]: true }));
      const uploadedDoc = await orderDocumentService.uploadClientPOByAdmin(orderId, file, currentUser.id);

      setPendingPOs((prev) =>
        prev.map((item) =>
          item.order.id === orderId
            ? {
                ...item,
                document: uploadedDoc,
                documentLoading: false,
                documentLoadError: undefined,
              }
            : item
        )
      );

      showSuccessToast('Client PO uploaded successfully');

      if (selectedOrderId === orderId) {
        handlePreview(uploadedDoc);
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to upload client PO');
      logger.error('Error uploading manual client PO:', error);
      showErrorToast(message);
      setActionErrorsByOrder((prev) => ({ ...prev, [orderId]: message }));
    } finally {
      setUploadingByOrder((prev) => ({ ...prev, [orderId]: false }));
      const input = fileInputRefs.current[orderId];
      if (input) input.value = '';
    }
  };

  useEffect(() => {
    loadPendingPOs(false);
  }, [loadPendingPOs]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'ADMIN') return;
    void Promise.allSettled([loadOrders(), loadUsers()]);
  }, [currentUser?.id, currentUser?.role, loadOrders, loadUsers]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'ADMIN') return;
    void Promise.allSettled([loadProducts(), loadQuotes(), loadRFQs()]);
  }, [currentUser?.id, currentUser?.role, loadProducts, loadQuotes, loadRFQs]);

  const selectedPendingPO = useMemo(
    () => pendingPOs.find((item) => item.order.id === selectedOrderId) || null,
    [pendingPOs, selectedOrderId]
  );

  const selectedOrder = useMemo(
    () => (selectedPendingPO ? orders.find((order) => order.id === selectedPendingPO.order.id) || null : null),
    [orders, selectedPendingPO]
  );

  const selectedClient = useMemo(
    () => (selectedOrder ? users.find((user) => user.id === selectedOrder.clientId) || null : null),
    [selectedOrder, users]
  );

  const selectedSupplier = useMemo(
    () => (selectedOrder ? users.find((user) => user.id === selectedOrder.supplierId) || null : null),
    [selectedOrder, users]
  );

  const selectedOrderItems = useMemo((): PendingOrderItem[] => {
    if (!selectedOrder) return [];

    const productsById = new Map(products.map((product) => [product.id, product]));
    const quote = selectedOrder.quoteId ? quotes.find((entry) => entry.id === selectedOrder.quoteId) : undefined;
    const rfq = quote?.rfqId ? rfqs.find((entry) => entry.id === quote.rfqId) : undefined;

    const rawOrderItems = Array.isArray(selectedOrder.items) ? (selectedOrder.items as any[]) : [];
    if (rawOrderItems.length > 0) {
      return rawOrderItems.map((item, index) => {
        const productId = String(item.productId || item.product_id || `item-${index}`);
        const quantity = Math.max(0, Number(item.quantity || 0));
        const lineTotalRaw = Number(item.lineTotal ?? item.line_total ?? item.finalLineTotal ?? item.final_line_total);
        const unitPriceRaw = Number(item.unitPrice ?? item.unit_price ?? item.finalUnitPrice ?? item.final_unit_price);
        const lineTotal = Number.isFinite(lineTotalRaw) ? lineTotalRaw : null;
        const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : null;

        return {
          productId,
          name: String(item.name || item.productName || item.product_name || productsById.get(productId)?.name || productId),
          quantity,
          unitPrice: unitPrice ?? (lineTotal !== null && quantity > 0 ? lineTotal / quantity : null),
          lineTotal: lineTotal ?? (unitPrice !== null ? unitPrice * quantity : null),
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
    const estimatedUnitPrice = totalQuantity > 0 ? Number(selectedOrder.amount || 0) / totalQuantity : 0;

    return rfqItems.map((item) => ({
      productId: item.productId,
      name: productsById.get(item.productId)?.name || item.productId,
      quantity: Number(item.quantity || 0),
      unitPrice: estimatedUnitPrice || null,
      lineTotal: estimatedUnitPrice ? estimatedUnitPrice * Number(item.quantity || 0) : null,
    }));
  }, [products, quotes, rfqs, selectedOrder]);

  const selectedOrderSubtotal = useMemo(
    () => selectedOrderItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0),
    [selectedOrderItems]
  );
  const fallbackSystemPOUrl = useMemo(
    () => (selectedOrder?.system_po_generated ? `/api/generate-po/${selectedOrder.id}` : null),
    [selectedOrder?.id, selectedOrder?.system_po_generated]
  );
  const effectivePreviewUrl = previewUrl || fallbackSystemPOUrl;

  const openVerifyConfirm = (orderId: string) => {
    const pendingPo = pendingPOs.find((item) => item.order.id === orderId);
    if (!pendingPo) return;

    setSelectedOrderId(orderId);
    setPendingVerification(pendingPo);

    void (async () => {
      const doc = pendingPo.document || (await resolveOrderDocument(orderId));
      if (doc) {
        handlePreview(doc);
      } else {
        setSelectedDoc(null);
        setPreviewUrl(null);
      }
    })();
  };

  const handleVerify = async (orderId: string) => {
    if (!currentUser) return;

    let pendingPo: PendingPO | undefined;

    try {
      setVerifying(orderId);
      setActionErrorsByOrder((prev) => {
        if (!prev[orderId]) return prev;
        const next = { ...prev };
        delete next[orderId];
        return next;
      });

      pendingPo = pendingPOs.find((item) => item.order.id === orderId);
      if (!pendingPo) {
        throw new Error('Pending PO not found');
      }

      if (pendingPo.document) {
        await orderDocumentService.verifyClientPO(pendingPo.document.id);
      } else {
        await orderDocumentService.verifyOrderPO(orderId);
      }

      addNotification({
        type: 'order',
        title: t('notifications.poConfirmedTitle'),
        message: t('notifications.poConfirmedMessage', { orderId: pendingPo.order.id }),
        actionUrl: '/app?tab=orders',
      });

      await logPOAudit({
        orderId: pendingPo.order.id,
        documentId: pendingPo.document?.id,
        actorUserId: currentUser.id,
        actorRole: UserRole.ADMIN,
        action: 'PO_VERIFIED',
        metadata: {
          clientId: pendingPo.order.clientId,
          orderAmount: pendingPo.order.amount,
          verificationMethod: pendingPo.document ? 'DOCUMENT' : 'ORDER_ONLY',
        },
      });

      await loadOrders();
      showSuccessToast(t('admin.po.verifySuccess') || 'PO confirmed successfully');

      setPendingPOs((prev) => prev.filter((p) => p.order.id !== orderId));
      setPreviewUrl(null);
      setSelectedDoc(null);
      setSelectedOrderId(null);
    } catch (error) {
      const message = getErrorMessage(error, t('admin.po.verifyError') || 'Failed to verify PO');
      logger.error('Error verifying PO:', error);
      setActionErrorsByOrder((prev) => ({ ...prev, [orderId]: message }));
      showErrorToast(message);
    } finally {
      setVerifying(null);
      setPendingVerification(null);
    }
  };

  const handlePreview = (doc: OrderDocument) => {
    // Resolve signed URL lazily on-demand so listing never gets blocked.
    void (async () => {
      try {
        const latestDoc = await orderDocumentService.getDocument(doc.id);
        const resolvedDoc = latestDoc || doc;
        setSelectedDoc(resolvedDoc);
        setPreviewUrl(resolvedDoc.file_url);
      } catch {
        setSelectedDoc(doc);
        setPreviewUrl(doc.file_url);
      }
    })();
  };

  const handleReject = async (orderId: string) => {
    const matchingPendingPO = pendingPOs.find((pending) => pending.order.id === orderId);
    if (!matchingPendingPO) return;
    setPendingRejection(matchingPendingPO);
  };

  const handleConfirmReject = async () => {
    if (!currentUser || !pendingRejection) return;

    try {
      setVerifying(pendingRejection.order.id);
      const updatedOrder = await updateOrder(pendingRejection.order.id, { status: 'CANCELLED' as any });
      if (!updatedOrder) {
        throw new Error('Failed to cancel order');
      }

      await logPOAudit({
        orderId: pendingRejection.order.id,
        documentId: pendingRejection.document?.id,
        actorUserId: currentUser.id,
        actorRole: UserRole.ADMIN,
        action: 'PO_REJECTED',
        metadata: { clientId: pendingRejection.order.clientId, orderAmount: pendingRejection.order.amount },
      });

      await loadOrders();
      showSuccessToast(t('admin.po.rejectSuccess') || 'PO rejected and order cancelled');
      setPendingPOs((prev) => prev.filter((p) => p.order.id !== pendingRejection.order.id));
      setPreviewUrl(null);
      setSelectedDoc(null);
      if (selectedOrderId === pendingRejection.order.id) {
        setSelectedOrderId(null);
      }
      setPendingRejection(null);
    } catch (error) {
      const message = getErrorMessage(error, t('admin.po.rejectError') || 'Failed to reject PO');
      logger.error('Error rejecting PO:', error);
      setActionErrorsByOrder((prev) => ({ ...prev, [pendingRejection.order.id]: message }));
      showErrorToast(message);
    } finally {
      setVerifying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{t('admin.po.pendingReviewQueue')}</p>
          <p className="text-xs text-slate-500">
            {t('admin.po.description') || 'Review and confirm client purchase orders before supplier release'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
            {pendingPOs.length} {t('admin.po.pending') || 'Pending'}
          </span>
          <button
            onClick={() => loadPendingPOs(true)}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
            title={t('common.refresh')}
          >
            <span className="material-symbols-outlined text-neutral-600">refresh</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            onClick={() => loadPendingPOs(true)}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-red-700 border border-red-200 hover:bg-red-100"
          >
            {t('common.retry') || 'Retry'}
          </button>
        </div>
      )}

      {pendingPOs.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-neutral-300 mb-4">task_alt</span>
          <h3 className="text-lg font-semibold text-neutral-700 mb-2">{t('admin.po.noPending') || 'No Pending POs'}</h3>
          <p className="text-neutral-500">{t('admin.po.allVerified') || 'All client POs have been verified'}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {pendingPOs.map((item) => {
              const hasDocument = Boolean(item.document);
              return (
                <div
                  key={item.order.id}
                  className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedOrderId === item.order.id
                      ? 'border-blue-500 ring-2 ring-blue-100'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                  onClick={() => {
                    setSelectedOrderId(item.order.id);
                    if (item.document) {
                      handlePreview(item.document);
                    } else {
                      setSelectedDoc(null);
                      setPreviewUrl(null);
                      void resolveOrderDocument(item.order.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${hasDocument ? 'bg-amber-100' : 'bg-red-100'}`}>
                        <span className={`material-symbols-outlined ${hasDocument ? 'text-amber-600' : 'text-red-600'}`}>
                          {hasDocument ? 'description' : 'warning'}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-neutral-800">{item.clientName}</h4>
                        <p className="text-sm text-neutral-500">Order #{item.order.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-sm text-neutral-500">
                          {new Date((item.document?.created_at) || item.order.date).toLocaleDateString()}
                        </p>
                        {item.documentLoading && (
                          <p className="mt-1 text-xs text-slate-500">{t('common.loading') || 'Loading'}...</p>
                        )}
                        {!item.documentLoading && !hasDocument && (
                          <p className="mt-1 text-xs text-amber-700">
                            {item.documentLoadError || 'No client PO document found. Order-only verification is available.'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-neutral-800">
                        {t('common.currency')} {item.order.amount?.toLocaleString() || '0'}
                      </p>
                      <StatusBadge status={item.order.status.toLowerCase()} size="sm" />
                    </div>
                  </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-100">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[item.order.id] = el;
                      }}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onClick={(e) => {
                        (e.target as HTMLInputElement).value = '';
                      }}
                      onChange={(event) => {
                        const selectedFile = event.target.files?.[0];
                        if (!selectedFile) return;
                        void handleManualPOUpload(item.order.id, selectedFile);
                      }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openVerifyConfirm(item.order.id);
                      }}
                      disabled={verifying === item.order.id}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {verifying === item.order.id ? (
                        <>
                          <span className="animate-spin material-symbols-outlined text-sm">hourglass_empty</span>
                          {t('common.verifying') || 'Verifying...'}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          {t('admin.po.confirmAndSend') || 'Confirm & Send to Supplier'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRefs.current[item.order.id]?.click();
                      }}
                      disabled={Boolean(uploadingByOrder[item.order.id])}
                      className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium hover:bg-blue-100 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {uploadingByOrder[item.order.id] ? (
                        <>
                          <span className="animate-spin material-symbols-outlined text-sm">hourglass_empty</span>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">upload_file</span>
                          Upload PO
                        </>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(item.order.id);
                      }}
                      disabled={verifying === item.order.id}
                      className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {verifying === item.order.id ? (
                        <>
                          <span className="animate-spin material-symbols-outlined text-sm">hourglass_empty</span>
                          {t('common.processing') || 'Processing...'}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">cancel</span>
                          {t('admin.po.reject') || 'Reject'}
                        </>
                      )}
                    </button>
                  </div>
                  {actionErrorsByOrder[item.order.id] && (
                    <p className="mt-3 text-xs text-red-600">{actionErrorsByOrder[item.order.id]}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden lg:sticky lg:top-4 lg:h-[600px]">
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-neutral-200">
                <h3 className="font-semibold text-neutral-800">{t('admin.po.preview') || 'PO Review Details'}</h3>
                {selectedPendingPO ? (
                  <p className="text-xs text-neutral-500 mt-1">
                    {selectedPendingPO.clientName} | Order #{selectedPendingPO.order.id.slice(0, 8).toUpperCase()} | {t('common.currency')} {selectedPendingPO.order.amount?.toLocaleString() || '0'}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500 mt-1">{t('admin.po.selectToPreview') || 'Select a PO to preview'}</p>
                )}
              </div>

              {selectedPendingPO ? (
                <div className="flex-1 overflow-auto">
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-neutral-200 p-3">
                        <p className="text-neutral-500">{t('admin.orders.client') || 'Client'}</p>
                        <p className="font-semibold text-neutral-800 mt-1">
                          {selectedClient?.companyName || selectedClient?.name || selectedPendingPO.order.clientId}
                        </p>
                      </div>
                      <div className="rounded-lg border border-neutral-200 p-3">
                        <p className="text-neutral-500">{t('admin.orders.supplier') || 'Supplier'}</p>
                        <p className="font-semibold text-neutral-800 mt-1">{selectedSupplier?.companyName || selectedSupplier?.name || selectedOrder?.supplierId || '—'}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-neutral-200 overflow-hidden">
                      <div className="px-3 py-2 bg-neutral-50 text-xs font-semibold text-neutral-700">
                        {t('admin.orders.items') || 'Order Items'}
                      </div>
                      {selectedOrderItems.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-neutral-500">
                          {t('admin.orders.noItems') || 'No order item details available'}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead className="bg-neutral-50 text-neutral-600">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">{t('admin.orders.item') || 'Item'}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('admin.orders.quantity') || 'Qty'}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('admin.orders.unitPrice') || 'Unit Price'}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('admin.orders.lineTotal') || 'Line Total'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedOrderItems.map((orderItem, index) => (
                                <tr key={`${orderItem.productId}-${index}`} className="border-t border-neutral-100">
                                  <td className="px-3 py-2 text-neutral-800">{orderItem.name}</td>
                                  <td className="px-3 py-2 text-right text-neutral-700">{orderItem.quantity.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-neutral-700">
                                    {orderItem.unitPrice !== null
                                      ? `${t('common.currency')} ${orderItem.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                      : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-neutral-800 font-medium">
                                    {orderItem.lineTotal !== null
                                      ? `${t('common.currency')} ${orderItem.lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-neutral-50 border-t border-neutral-200">
                              <tr>
                                <td className="px-3 py-2 font-semibold text-neutral-900" colSpan={3}>
                                  {t('admin.orders.subtotal') || 'Subtotal'}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-neutral-900">
                                  {t('common.currency')} {(selectedOrderSubtotal > 0 ? selectedOrderSubtotal : Number(selectedPendingPO.order.amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-neutral-200 overflow-hidden">
                      <div className="px-3 py-2 bg-neutral-50 text-xs font-semibold text-neutral-700 flex items-center justify-between">
                        <span>{t('admin.po.preview') || 'Document Preview'}</span>
                        {effectivePreviewUrl && (
                          <a
                            href={effectivePreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            title={t('admin.po.openInNewTab')}
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            {t('admin.po.openInNewTab') || 'Open'}
                          </a>
                        )}
                      </div>
                      {effectivePreviewUrl ? (
                        <div className="bg-neutral-100 h-72">
                          <iframe src={effectivePreviewUrl} className="w-full h-full" title={t('admin.po.preview')} />
                        </div>
                      ) : (
                        <div className="px-3 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100 space-y-2">
                          {selectedPendingPO.documentLoading
                            ? `${t('common.loading') || 'Loading'}...`
                            : selectedPendingPO.documentLoadError ||
                              'No PO document available. You can still approve this order based on order details.'}
                          {!selectedPendingPO.documentLoading && (
                            <div>
                              <button
                                onClick={() => {
                                  void resolveOrderDocument(selectedPendingPO.order.id);
                                }}
                                className="rounded bg-white border border-amber-200 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                              >
                                Retry Document Load
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div>
                    <span className="material-symbols-outlined text-5xl text-neutral-300 mb-3">preview</span>
                    <p className="text-neutral-500">{t('admin.po.selectToPreview') || 'Select a PO to preview'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingVerification)}
        onClose={() => setPendingVerification(null)}
        onConfirm={() => pendingVerification && handleVerify(pendingVerification.order.id)}
        title={t('admin.po.confirmAndSend') || 'Confirm & Send to Supplier'}
        message={
          pendingVerification
            ? `Client: ${pendingVerification.clientName}. Order #${pendingVerification.order.id.slice(0, 8).toUpperCase()}. Amount: ${t('common.currency')} ${pendingVerification.order.amount?.toLocaleString() || '0'}. PO: ${pendingVerification.document?.file_name || pendingVerification.document?.id || 'No document attached'}. This will move the order to pending payment.`
            : t('admin.po.verifyPrompt') || 'Confirm this purchase order verification?'
        }
        confirmText={t('common.confirm') || 'Confirm'}
        type="info"
        isLoading={Boolean(pendingVerification && verifying === pendingVerification.order.id)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingRejection)}
        onClose={() => setPendingRejection(null)}
        onConfirm={handleConfirmReject}
        title={t('admin.po.reject') || 'Reject'}
        message={t('admin.po.confirmReject') || 'Reject this PO and cancel the related order?'}
        confirmText={t('admin.po.reject') || 'Reject'}
        type="danger"
        isLoading={Boolean(pendingRejection && verifying === pendingRejection.order.id)}
      />
    </div>
  );
};
