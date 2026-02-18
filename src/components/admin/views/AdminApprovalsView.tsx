import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../hooks/useToast';
import { Product, User } from '../../../types/types';
import { PortalPageHeader, PortalPageShell, PortalSection } from '../../ui/PortalDashboardShell';

type ApprovalDateFilter = 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_YEAR';

interface AdminApprovalsViewProps {
  products: Product[];
  users: User[];
  onApproveProduct: (productId: string) => Promise<boolean>;
  onRejectProduct: (productId: string) => Promise<boolean>;
  exportToCSV: (data: any[], filename: string) => void;
  openAdminNotifications: () => void;
  openAdminHelp: () => void;
  renderAdminOverlay: () => React.ReactNode;
}

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (value?: string) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().split('T')[0] : null;
};

const getHoursSince = (value?: string) => {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60));
};

const matchesRelativeDateFilter = (value: string | undefined, filter: ApprovalDateFilter) => {
  if (filter === 'ALL') return true;
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  if (filter === 'THIS_YEAR') return date.getFullYear() === now.getFullYear();
  const days = filter === 'LAST_7_DAYS' ? 7 : 30;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
};

export const AdminApprovalsView: React.FC<AdminApprovalsViewProps> = ({
  products,
  users,
  onApproveProduct,
  onRejectProduct,
  exportToCSV,
  openAdminNotifications,
  openAdminHelp,
  renderAdminOverlay,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [approvalSearchTerm, setApprovalSearchTerm] = useState('');
  const [approvalSupplierFilter, setApprovalSupplierFilter] = useState('ALL');
  const [approvalCategoryFilter, setApprovalCategoryFilter] = useState('ALL');
  const [approvalDateFilter, setApprovalDateFilter] = useState<ApprovalDateFilter>('ALL');
  const [selectedApprovalProductIds, setSelectedApprovalProductIds] = useState<string[]>([]);
  const [approvalInfoProductId, setApprovalInfoProductId] = useState<string | null>(null);
  const [isBulkActionInProgress, setIsBulkActionInProgress] = useState(false);

  const pendingProducts = products.filter((p) => p.status === 'PENDING');
  const pendingRows = pendingProducts.map((product) => {
    const supplier = users.find((u) => u.id === product.supplierId);
    const productRecord = product as Product & {
      submittedAt?: string;
      submitted_at?: string;
      createdAt?: string;
      created_at?: string;
      updatedAt?: string;
      updated_at?: string;
    };
    const submittedAtRaw = productRecord.submittedAt
      || productRecord.submitted_at
      || productRecord.createdAt
      || productRecord.created_at
      || productRecord.updatedAt
      || productRecord.updated_at;
    return {
      product,
      supplierName: supplier?.companyName || t('admin.approvals.unknownSupplier'),
      submittedAtRaw: submittedAtRaw || undefined,
      submittedAt: toDateKey(submittedAtRaw) || undefined,
      slaHours: getHoursSince(submittedAtRaw),
    };
  });

  const supplierOptions = Array.from(new Set(pendingRows.map((row) => row.supplierName))).sort();
  const categoryOptions = Array.from(new Set(pendingRows.map((row) => row.product.category))).sort();
  const searchQuery = approvalSearchTerm.trim().toLowerCase();
  const filteredRows = pendingRows.filter((row) => {
    const matchesSearch = !searchQuery || [
      row.product.name,
      row.product.sku || '',
      row.product.category,
      row.supplierName,
    ].join(' ').toLowerCase().includes(searchQuery);
    const matchesSupplier = approvalSupplierFilter === 'ALL' || row.supplierName === approvalSupplierFilter;
    const matchesCategory = approvalCategoryFilter === 'ALL' || row.product.category === approvalCategoryFilter;
    const matchesDate = matchesRelativeDateFilter(row.submittedAtRaw || row.submittedAt, approvalDateFilter);
    return matchesSearch && matchesSupplier && matchesCategory && matchesDate;
  });

  const visibleIds = filteredRows.map((row) => row.product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedApprovalProductIds.includes(id));
  const selectedVisibleRows = filteredRows.filter((row) => selectedApprovalProductIds.includes(row.product.id));
  const bulkTargetProducts = selectedVisibleRows.length > 0 ? selectedVisibleRows.map((row) => row.product) : [];
  const infoProduct = approvalInfoProductId ? products.find((product) => product.id === approvalInfoProductId) : null;

  const toggleVisibleSelection = () => {
    setSelectedApprovalProductIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const toggleSingleSelection = (productId: string) => {
    setSelectedApprovalProductIds((prev) => (
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    ));
  };

  const handleApproveSingleProduct = async (productId: string) => {
    const success = await onApproveProduct(productId);
    if (!success) {
      toast.error(t('admin.approvals.approveError'));
      return;
    }
    setSelectedApprovalProductIds((prev) => prev.filter((id) => id !== productId));
    toast.success(t('admin.approvals.approved'));
  };

  const handleRejectSingleProduct = async (productId: string) => {
    const success = await onRejectProduct(productId);
    if (!success) {
      toast.error(t('admin.approvals.rejectError'));
      return;
    }
    setSelectedApprovalProductIds((prev) => prev.filter((id) => id !== productId));
    toast.success(t('admin.approvals.rejected'));
  };

  const handleApproveAllPendingProducts = async (targets: Product[]) => {
    if (isBulkActionInProgress) return;
    if (targets.length === 0) {
      toast.info(t('admin.approvals.allCaughtUp'));
      return;
    }
    setIsBulkActionInProgress(true);
    try {
      const results = await Promise.all(targets.map((product) => onApproveProduct(product.id)));
      const succeededIds = targets
        .filter((_, index) => results[index])
        .map((product) => product.id);
      const failedCount = results.length - succeededIds.length;

      if (succeededIds.length === 0) {
        toast.error(t('admin.approvals.approveError'));
        return;
      }

      setSelectedApprovalProductIds((prev) => prev.filter((id) => !targets.some((product) => product.id === id)));
      if (failedCount > 0) {
        toast.info(t('admin.approvals.bulkPartial', { defaultValue: '{{success}} approved, {{failed}} failed', success: succeededIds.length, failed: failedCount }));
      } else {
        toast.success(t('admin.approvals.bulkApproved'));
      }
    } finally {
      setIsBulkActionInProgress(false);
    }
  };

  const handleRejectAllPendingProducts = async (targets: Product[]) => {
    if (isBulkActionInProgress) return;
    if (targets.length === 0) {
      toast.info(t('admin.approvals.allCaughtUp'));
      return;
    }
    setIsBulkActionInProgress(true);
    try {
      const results = await Promise.all(targets.map((product) => onRejectProduct(product.id)));
      const succeededIds = targets
        .filter((_, index) => results[index])
        .map((product) => product.id);
      const failedCount = results.length - succeededIds.length;

      if (succeededIds.length === 0) {
        toast.error(t('admin.approvals.rejectError'));
        return;
      }

      setSelectedApprovalProductIds((prev) => prev.filter((id) => !targets.some((product) => product.id === id)));
      if (failedCount > 0) {
        toast.info(t('admin.approvals.bulkPartial', { defaultValue: '{{success}} processed, {{failed}} failed', success: succeededIds.length, failed: failedCount }));
      } else {
        toast.success(t('admin.approvals.bulkRejected'));
      }
    } finally {
      setIsBulkActionInProgress(false);
    }
  };

  return (
    <div data-testid="admin-approvals-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('admin.approvals.productApprovalQueue')}
          subtitle={`${filteredRows.length} ${t('admin.approvals.itemsAwaitingReview')}`}
          actions={(
            <>
              <label className="flex w-full sm:w-72">
                <div className="flex w-full items-stretch rounded-lg h-10 border border-gray-300 bg-white">
                  <div className="text-[#616f89] flex items-center justify-center pl-3 rounded-l-lg">
                    <span className="material-symbols-outlined text-xl">search</span>
                  </div>
                  <input
                    className="w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-gray-800 focus:outline-none border-none bg-white pl-2 text-sm placeholder:text-gray-400"
                    placeholder={t('common.search')}
                    value={approvalSearchTerm}
                    onChange={(event) => setApprovalSearchTerm(event.target.value)}
                  />
                </div>
              </label>
              <button
                onClick={openAdminNotifications}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                aria-label={t('common.notifications')}
              >
                <span className="material-symbols-outlined text-xl">notifications</span>
              </button>
              <button
                onClick={openAdminHelp}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                aria-label={t('common.help')}
              >
                <span className="material-symbols-outlined text-xl">help</span>
              </button>
            </>
          )}
        />

        <PortalSection
          action={(
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRejectAllPendingProducts(bulkTargetProducts)}
                disabled={bulkTargetProducts.length === 0 || isBulkActionInProgress}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-x-2 overflow-hidden rounded-lg bg-white px-4 text-sm font-medium leading-normal text-red-600 ring-1 ring-inset ring-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBulkActionInProgress && (
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                )}
                {t('admin.approvals.rejectSelected')}
              </button>
              <button
                onClick={() => handleApproveAllPendingProducts(bulkTargetProducts)}
                disabled={bulkTargetProducts.length === 0 || isBulkActionInProgress}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-x-2 overflow-hidden rounded-lg bg-[#135bec] px-4 text-sm font-medium leading-normal text-white hover:bg-[#135bec]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBulkActionInProgress && (
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                )}
                {t('admin.approvals.approveSelected')}
              </button>
              <button
                onClick={() => exportToCSV(filteredRows.map((row) => row.product), 'pending_products')}
                disabled={filteredRows.length === 0}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-x-2 overflow-hidden rounded-lg bg-white border border-slate-200 px-4 text-sm font-medium leading-normal text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span>{t('common.export')}</span>
              </button>
            </div>
          )}
        >
          <div className="flex flex-wrap gap-3 border-b border-b-gray-200 pb-4">
            <div className="relative">
              <select
                value={approvalSupplierFilter}
                onChange={(event) => setApprovalSupplierFilter(event.target.value)}
                className="h-8 appearance-none rounded-lg bg-white pl-4 pr-8 text-sm font-medium text-[#111318] ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                <option value="ALL">{t('admin.approvals.supplier')} - {t('common.all')}</option>
                {supplierOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-[#111318]">expand_more</span>
            </div>
            <div className="relative">
              <select
                value={approvalCategoryFilter}
                onChange={(event) => setApprovalCategoryFilter(event.target.value)}
                className="h-8 appearance-none rounded-lg bg-white pl-4 pr-8 text-sm font-medium text-[#111318] ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                <option value="ALL">{t('admin.approvals.category')} - {t('common.all')}</option>
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-[#111318]">expand_more</span>
            </div>
            <div className="relative">
              <select
                value={approvalDateFilter}
                onChange={(event) => setApprovalDateFilter(event.target.value as ApprovalDateFilter)}
                className="h-8 appearance-none rounded-lg bg-white pl-4 pr-8 text-sm font-medium text-[#111318] ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                <option value="ALL">{t('admin.approvals.dateSubmitted')} - {t('common.all')}</option>
                <option value="LAST_7_DAYS">{t('common.dateFilter.last7Days')}</option>
                <option value="LAST_30_DAYS">{t('common.dateFilter.last30Days')}</option>
                <option value="THIS_YEAR">{t('common.dateFilter.thisYear')}</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-[#111318]">expand_more</span>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full flex-1">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="w-12 px-6 py-3">
                    <input
                      className="h-4 w-4 rounded border-gray-300 text-[#135bec] focus:ring-[#135bec]"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSelection}
                    />
                  </th>
                  <th className="px-6 py-3">{t('admin.approvals.product')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.supplier')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.costPrice')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.submitted')}</th>
                  <th className="px-6 py-3">{t('admin.approvals.sla')}</th>
                  <th className="relative px-6 py-3"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRows.map(({ product, supplierName, submittedAt, slaHours }) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4">
                      <input
                        className="h-4 w-4 rounded border-gray-300 text-[#135bec] focus:ring-[#135bec]"
                        type="checkbox"
                        checked={selectedApprovalProductIds.includes(product.id)}
                        onChange={() => toggleSingleSelection(product.id)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-lg w-10" style={{ backgroundImage: `url("${product.image}")` }}></div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#111318]">{product.name}</div>
                          <div className="text-sm text-gray-500">{t('common.sku')}: {product.sku || t('common.notAvailable')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{supplierName}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{t('common.currency')} {product.supplierPrice?.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{submittedAt || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {typeof slaHours === 'number' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          slaHours < 24
                            ? 'bg-green-100 text-green-800'
                            : slaHours <= 48
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {t('admin.approvals.slaHoursAgo', { hours: slaHours })}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setApprovalInfoProductId(product.id)}
                          className="flex h-8 items-center justify-center gap-1 rounded-md bg-yellow-100 px-3 text-xs font-semibold text-yellow-800 hover:bg-yellow-200 transition-colors"
                        >
                          {t('admin.approvals.info')}
                        </button>
                        <button
                          onClick={() => handleRejectSingleProduct(product.id)}
                          className="flex h-8 items-center justify-center gap-1 rounded-md bg-red-100 px-3 text-xs font-semibold text-red-800 hover:bg-red-200 transition-colors"
                        >
                          {t('admin.approvals.reject')}
                        </button>
                        <button
                          onClick={() => handleApproveSingleProduct(product.id)}
                          className="flex h-8 items-center justify-center gap-1 rounded-md bg-green-100 px-3 text-xs font-semibold text-green-800 hover:bg-green-200 transition-colors"
                        >
                          {t('admin.approvals.approve')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-gray-300 text-3xl">check_circle</span>
                      </div>
                      <p className="text-gray-500 font-medium">
                        {pendingProducts.length === 0
                          ? t('admin.approvals.allCaughtUp')
                          : t('common.noResults')}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </PortalSection>
      </PortalPageShell>

      {infoProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h3 className="text-lg font-bold text-slate-900">{t('admin.approvals.info')}</h3>
              <button
                onClick={() => setApprovalInfoProductId(null)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid gap-3 p-4 text-sm text-slate-700">
              <p><span className="font-semibold">{t('common.name')}:</span> {infoProduct.name}</p>
              <p><span className="font-semibold">{t('common.sku')}:</span> {infoProduct.sku || t('common.notAvailable')}</p>
              <p><span className="font-semibold">{t('admin.approvals.category')}:</span> {infoProduct.category}</p>
              <p><span className="font-semibold">{t('admin.approvals.costPrice')}:</span> {t('common.currency')} {infoProduct.supplierPrice?.toFixed(2)}</p>
              <p><span className="font-semibold">{t('common.description')}:</span> {infoProduct.description || '-'}</p>
            </div>
            <div className="flex justify-end border-t border-slate-200 p-4">
              <button
                onClick={() => setApprovalInfoProductId(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {renderAdminOverlay()}
    </div>
  );
};
