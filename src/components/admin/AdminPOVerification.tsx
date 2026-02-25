import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const DOCUMENT_FETCH_TIMEOUT_MS = 15000;

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

    // Use individual selectors to prevent infinite re-renders
    const currentUser = useStore(state => state.currentUser);
    const orders = useStore(state => state.orders);
    const users = useStore(state => state.users) || [];
    const loadUsers = useStore(state => state.loadUsers);
    const loadOrders = useStore(state => state.loadOrders);
    const updateOrder = useStore(state => state.updateOrder);
    const addNotification = useStore(state => state.addNotification);

    const [pendingPOs, setPendingPOs] = useState<PendingPO[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<OrderDocument | null>(null);
    const [pendingVerification, setPendingVerification] = useState<PendingPO | null>(null);
    const [pendingRejection, setPendingRejection] = useState<PendingPO | null>(null);
    const [actionErrorsByOrder, setActionErrorsByOrder] = useState<Record<string, string>>({});

    const loadPendingPOs = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);

            // Find orders strictly awaiting PO verification.
            const pendingOrders = orders.filter((order) => {
                const status = String(order.status || '').toUpperCase();
                return status === 'PENDING_ADMIN_CONFIRMATION' || status === 'PENDING_PO';
            });

            const pendingBase: PendingPO[] = pendingOrders.map((order) => {
                const client = users.find(u => u.id === order.clientId);
                return {
                    order: {
                        id: order.id,
                        clientId: order.clientId,
                        amount: order.amount,
                        date: order.date,
                        status: String(order.status),
                    },
                    clientName: client?.companyName || client?.name || t('admin.overview.unknownClient'),
                    documentLoading: true,
                };
            });

            // Render list immediately; load documents per order in background.
            setPendingPOs(pendingBase);
            setActionErrorsByOrder({});
            setLoading(false);

            const pendingWithDocs = await Promise.all(
                pendingBase.map(async (pendingItem): Promise<PendingPO> => {
                    try {
                        const docs = await withTimeout(
                            orderDocumentService.getOrderDocuments(pendingItem.order.id),
                            DOCUMENT_FETCH_TIMEOUT_MS,
                            `Loading PO documents for order ${pendingItem.order.id}`,
                        );

                        const clientPODocuments = docs.filter(
                            (document) => String(document.document_type || '').toUpperCase() === 'CLIENT_PO'
                        );
                        const clientPO = clientPODocuments.find(
                            (document) => !document.verified_at && !document.verified_by
                        ) || clientPODocuments[0];

                        return {
                            ...pendingItem,
                            document: clientPO,
                            documentLoading: false,
                            documentLoadError: clientPO ? undefined : 'Client PO document not found',
                        };
                    } catch (err) {
                        const message = getErrorMessage(err, t('errors.failedToLoad'));
                        logger.error(`Error loading docs for order ${pendingItem.order.id}:`, err);
                        return {
                            ...pendingItem,
                            document: undefined,
                            documentLoading: false,
                            documentLoadError: message,
                        };
                    }
                })
            );

            setPendingPOs(pendingWithDocs);
        } catch (error) {
            const message = getErrorMessage(error, t('errors.failedToLoad'));
            logger.error('Error loading pending POs:', error);
            setLoadError(message);
            showErrorToast(message);
        } finally {
            setLoading(false);
        }
    }, [orders, showErrorToast, t, users]);

    useEffect(() => {
        loadPendingPOs();
    }, [loadPendingPOs]);

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'ADMIN') return;
        void Promise.allSettled([loadOrders(), loadUsers()]);
    }, [currentUser?.id, currentUser?.role, loadOrders, loadUsers]);

    const selectedPendingPO = useMemo(
        () => pendingPOs.find((item) => item.document?.id === selectedDoc?.id),
        [pendingPOs, selectedDoc?.id]
    );

    const openVerifyConfirm = (orderId: string) => {
        const pendingPo = pendingPOs.find((item) => item.order.id === orderId);
        if (!pendingPo) return;
        setPendingVerification(pendingPo);

        if (pendingPo.document) {
            setSelectedDoc(pendingPo.document);
            setPreviewUrl(pendingPo.document.file_url);
        }
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

            if (!pendingPo.document) {
                throw new Error(
                    pendingPo.documentLoadError
                        || 'Missing client PO document. Please refresh and review details before confirming.'
                );
            }

            await orderDocumentService.verifyClientPO(pendingPo.document.id);

            addNotification({
                type: 'order',
                title: t('notifications.poConfirmedTitle'),
                message: t('notifications.poConfirmedMessage', { orderId: pendingPo.order.id }),
                actionUrl: '/app?tab=orders',
            });

            // PO audit log
            await logPOAudit({
                orderId: pendingPo.order.id,
                documentId: pendingPo.document?.id,
                actorUserId: currentUser.id,
                actorRole: UserRole.ADMIN,
                action: 'PO_VERIFIED',
                metadata: { clientId: pendingPo.order.clientId, orderAmount: pendingPo.order.amount },
            });

            await loadOrders();
            showSuccessToast(t('admin.po.verifySuccess') || 'PO confirmed successfully');

            // Remove from pending list
            setPendingPOs(prev => prev.filter(p => p.order.id !== orderId));
            setPreviewUrl(null);
            setSelectedDoc(null);
        } catch (error) {
            const message = getErrorMessage(error, t('admin.po.verifyError') || 'Failed to verify PO');
            logger.error('Error verifying PO:', error);
            setActionErrorsByOrder(prev => ({ ...prev, [orderId]: message }));
            showErrorToast(message);

            if (currentUser && pendingPo && !pendingPo.document) {
                await logPOAudit({
                    orderId: pendingPo.order.id,
                    documentId: pendingPo.document?.id,
                    actorUserId: currentUser.id,
                    actorRole: UserRole.ADMIN,
                    action: 'PO_VERIFIED',
                    notes: 'PO verification failed',
                    metadata: {
                        clientId: pendingPo.order.clientId,
                        orderAmount: pendingPo.order.amount,
                        verificationOutcome: 'FAILED',
                        errorMessage: message,
                    },
                });
            }
        } finally {
            setVerifying(null);
            setPendingVerification(null);
        }
    };

    const handlePreview = (doc: OrderDocument) => {
        setSelectedDoc(doc);
        setPreviewUrl(doc.file_url);
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

            // PO audit log
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
            setPendingPOs(prev => prev.filter(p => p.order.id !== pendingRejection.order.id));
            setPreviewUrl(null);
            setSelectedDoc(null);
            setPendingRejection(null);
        } catch (error) {
            const message = getErrorMessage(error, t('admin.po.rejectError') || 'Failed to reject PO');
            logger.error('Error rejecting PO:', error);
            setActionErrorsByOrder(prev => ({ ...prev, [pendingRejection.order.id]: message }));
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
                    <p className="text-sm font-semibold text-slate-900">
                        {t('admin.po.pendingReviewQueue')}
                    </p>
                    <p className="text-xs text-slate-500">
                        {t('admin.po.description') || 'Review and confirm client purchase orders before supplier release'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                        {pendingPOs.length} {t('admin.po.pending') || 'Pending'}
                    </span>
                    <button
                        onClick={loadPendingPOs}
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
                        onClick={loadPendingPOs}
                        className="rounded-lg bg-white px-3 py-1.5 font-medium text-red-700 border border-red-200 hover:bg-red-100"
                    >
                        {t('common.retry') || 'Retry'}
                    </button>
                </div>
            )}

            {pendingPOs.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
                    <span className="material-symbols-outlined text-6xl text-neutral-300 mb-4">task_alt</span>
                    <h3 className="text-lg font-semibold text-neutral-700 mb-2">
                        {t('admin.po.noPending') || 'No Pending POs'}
                    </h3>
                    <p className="text-neutral-500">
                        {t('admin.po.allVerified') || 'All client POs have been verified'}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {/* PO List */}
                    <div className="space-y-3">
                        {pendingPOs.map((item) => {
                            const hasDocument = Boolean(item.document);
                            const isDocumentReady = hasDocument && !item.documentLoading;
                            return (
                                <div
                                    key={item.order.id}
                                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selectedDoc?.id === item.document?.id && item.document
                                        ? 'border-blue-500 ring-2 ring-blue-100'
                                        : 'border-neutral-200 hover:border-neutral-300'
                                        }`}
                                    onClick={() => item.document ? handlePreview(item.document) : null}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className={`p-2 rounded-lg ${hasDocument ? 'bg-amber-100' : 'bg-red-100'}`}>
                                                <span className={`material-symbols-outlined ${hasDocument ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {hasDocument ? 'description' : 'warning'}
                                                </span>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-neutral-800">
                                                    {item.clientName}
                                                </h4>
                                                <p className="text-sm text-neutral-500">
                                                    Order #{item.order.id.slice(0, 8).toUpperCase()}
                                                </p>
                                                <p className="text-sm text-neutral-500">
                                                    {new Date((item.document?.created_at) || item.order.date).toLocaleDateString()}
                                                </p>
                                                {item.documentLoading && (
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        {t('common.loading') || 'Loading'}...
                                                    </p>
                                                )}
                                                {!item.documentLoading && !hasDocument && (
                                                    <p className="mt-1 text-xs text-red-600">
                                                        {item.documentLoadError || 'Client PO document is missing'}
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
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openVerifyConfirm(item.order.id);
                                            }}
                                            disabled={verifying === item.order.id || !isDocumentReady}
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

                    {/* Preview Panel */}
                    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden lg:sticky lg:top-4 lg:h-[600px]">
                        {previewUrl ? (
                            <div className="h-full flex flex-col">
                                <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-neutral-800">
                                            {t('admin.po.preview') || 'Document Preview'}
                                        </h3>
                                        {selectedPendingPO && (
                                            <p className="text-xs text-neutral-500 mt-1">
                                                {selectedPendingPO.clientName} | Order #{selectedPendingPO.order.id.slice(0, 8).toUpperCase()} | {t('common.currency')} {selectedPendingPO.order.amount?.toLocaleString() || '0'}
                                            </p>
                                        )}
                                    </div>
                                    <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                                        title={t('admin.po.openInNewTab')}
                                    >
                                        <span className="material-symbols-outlined text-neutral-600">open_in_new</span>
                                    </a>
                                </div>
                                <div className="flex-1 bg-neutral-100">
                                    <iframe
                                        src={previewUrl}
                                        className="w-full h-full"
                                        title={t('admin.po.preview')}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center p-8">
                                <div>
                                    <span className="material-symbols-outlined text-5xl text-neutral-300 mb-3">preview</span>
                                    <p className="text-neutral-500">
                                        {t('admin.po.selectToPreview') || 'Select a PO to preview'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingVerification)}
                onClose={() => setPendingVerification(null)}
                onConfirm={() => pendingVerification && handleVerify(pendingVerification.order.id)}
                title={t('admin.po.confirmAndSend') || 'Confirm & Send to Supplier'}
                message={pendingVerification
                    ? `Client: ${pendingVerification.clientName}. Order #${pendingVerification.order.id.slice(0, 8).toUpperCase()}. Amount: ${t('common.currency')} ${pendingVerification.order.amount?.toLocaleString() || '0'}. PO: ${pendingVerification.document?.file_name || pendingVerification.document?.id || 'Document attached'}. This will move the order to pending payment.`
                    : (t('admin.po.verifyPrompt') || 'Confirm this purchase order verification?')}
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
