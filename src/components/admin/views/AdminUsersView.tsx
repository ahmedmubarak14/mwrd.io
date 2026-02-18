import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../../ui/StatusBadge';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';
import { CreditLimitAdjustmentType, User, UserRole, Order } from '../../../types/types';
import { useStore } from '../../../store/useStore';
import { supabase } from '../../../lib/supabase';

interface AdminUsersViewProps {
  users: User[];
  userViewMode: 'suppliers' | 'clients';
  onUserViewModeChange: (mode: 'suppliers' | 'clients') => void;
  usersGlobalSearchTerm: string;
  onUsersGlobalSearchTermChange: (value: string) => void;
  supplierSearchTerm: string;
  onSupplierSearchTermChange: (value: string) => void;
  supplierStatusFilter: 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION';
  onSupplierStatusFilterChange: (value: 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION') => void;
  clientSearchTerm: string;
  onClientSearchTermChange: (value: string) => void;
  clientStatusFilter: 'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED';
  onClientStatusFilterChange: (value: 'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED') => void;
  clientDateRangeFilter: 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR';
  onClientDateRangeFilterChange: (value: 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR') => void;
  clientPage: number;
  onClientPageChange: (page: number) => void;
  matchesRelativeDateFilter: (value: string | undefined, filter: 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR') => boolean;
  creditLimitFormatter: Intl.NumberFormat;
  onOpenAdminNotifications: () => void;
  onOpenAddUser: (type: 'supplier' | 'client') => void;
  onOpenUserAction: (user: User) => void;
  onConvertRole: (userId: string, newRole: UserRole) => void;
  onOpenClientMarginModal: (client: User) => void;
  onOpenCreditAdjustModal: (client: User, mode: CreditLimitAdjustmentType) => void;
  onOpenCreditHistoryModal: (client: User) => void;
  exportToCSV: (data: any[], filename: string) => void;
}

const resolveStorageDocumentUrl = (documentPath: string): string => {
  if (!documentPath) return '#';
  if (/^https?:\/\//i.test(documentPath)) return documentPath;
  if (!documentPath.startsWith('storage://')) return documentPath;

  const storagePath = documentPath.slice('storage://'.length);
  const slashIndex = storagePath.indexOf('/');
  if (slashIndex <= 0) return documentPath;

  const bucket = storagePath.slice(0, slashIndex);
  const filePath = storagePath.slice(slashIndex + 1);
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl || documentPath;
};

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  users,
  userViewMode,
  onUserViewModeChange,
  usersGlobalSearchTerm,
  onUsersGlobalSearchTermChange,
  supplierSearchTerm,
  onSupplierSearchTermChange,
  supplierStatusFilter,
  onSupplierStatusFilterChange,
  clientSearchTerm,
  onClientSearchTermChange,
  clientStatusFilter,
  onClientStatusFilterChange,
  clientDateRangeFilter,
  onClientDateRangeFilterChange,
  clientPage,
  onClientPageChange,
  matchesRelativeDateFilter,
  creditLimitFormatter,
  onOpenAdminNotifications,
  onOpenAddUser,
  onOpenUserAction,
  onConvertRole,
  onOpenClientMarginModal,
  onOpenCreditAdjustModal,
  onOpenCreditHistoryModal,
  exportToCSV,
}) => {
  const { t } = useTranslation();
  const orders = useStore((state) => state.orders);
  const [isIdentityLookupOpen, setIsIdentityLookupOpen] = useState(false);
  const supplierUsers = users.filter((u) => u.role === UserRole.SUPPLIER);
  const normalizeSupplierStatus = (status?: string) => status || 'PENDING';
  const normalizeClientStatus = (status?: string) => status || 'ACTIVE';

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      APPROVED: 'approved',
      ACTIVE: 'approved',
      PENDING: 'pending',
      REJECTED: 'rejected',
      REQUIRES_ATTENTION: 'requires_attention',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const getKycBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      VERIFIED: 'verified',
      IN_REVIEW: 'in_review',
      REJECTED: 'rejected',
      INCOMPLETE: 'incomplete',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const globalQuery = usersGlobalSearchTerm.trim().toLowerCase();
  const filteredSupplierUsers = supplierUsers.filter((user) => {
    const searchable = `${user.name || ''} ${user.companyName || ''} ${user.email || ''}`.toLowerCase();
    const localQuery = supplierSearchTerm.trim().toLowerCase();
    const matchesGlobalSearch = !globalQuery || searchable.includes(globalQuery);
    const matchesLocalSearch = !localQuery || searchable.includes(localQuery);
    const matchesStatus = supplierStatusFilter === 'ALL' || normalizeSupplierStatus(user.status) === supplierStatusFilter;
    return matchesGlobalSearch && matchesLocalSearch && matchesStatus;
  });

  const clientUsers = users.filter((u) => u.role === UserRole.CLIENT);
  const getClientStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      ACTIVE: 'active',
      APPROVED: 'active',
      PENDING: 'pending',
      DEACTIVATED: 'deactivated',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const filteredClientUsers = clientUsers.filter((client) => {
    const searchable = `${client.name || ''} ${client.companyName || ''} ${client.email || ''}`.toLowerCase();
    const localQuery = clientSearchTerm.trim().toLowerCase();
    const matchesGlobalSearch = !globalQuery || searchable.includes(globalQuery);
    const matchesLocalSearch = !localQuery || searchable.includes(localQuery);
    const matchesStatus = clientStatusFilter === 'ALL' || normalizeClientStatus(client.status) === clientStatusFilter;
    const matchesDate = matchesRelativeDateFilter(client.dateJoined, clientDateRangeFilter);
    return matchesGlobalSearch && matchesLocalSearch && matchesStatus && matchesDate;
  });

  const clientsPerPage = 8;
  const totalClientPages = Math.max(1, Math.ceil(filteredClientUsers.length / clientsPerPage));
  const currentClientPage = Math.min(clientPage, totalClientPages);
  const paginatedClientUsers = filteredClientUsers.slice(
    (currentClientPage - 1) * clientsPerPage,
    currentClientPage * clientsPerPage
  );
  const clientStart = filteredClientUsers.length === 0 ? 0 : ((currentClientPage - 1) * clientsPerPage) + 1;
  const clientEnd = Math.min(currentClientPage * clientsPerPage, filteredClientUsers.length);

  return (
    <div data-testid="admin-users-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.users')}
          subtitle={userViewMode === 'suppliers'
            ? t('admin.users.supplierManagement')
            : t('admin.users.clientManagement')}
          actions={(
            <>
              <label className="flex w-full sm:w-64">
                <div className="flex w-full items-stretch rounded-lg h-10 border border-gray-300 bg-white">
                  <div className="text-[#616f89] flex items-center justify-center pl-3 rounded-l-lg">
                    <span className="material-symbols-outlined text-xl">search</span>
                  </div>
                  <input
                    className="w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-gray-800 focus:outline-none border-none bg-white pl-2 text-sm placeholder:text-gray-400"
                    placeholder={t('admin.users.globalSearch')}
                    value={usersGlobalSearchTerm}
                    onChange={(event) => onUsersGlobalSearchTermChange(event.target.value)}
                  />
                </div>
              </label>
              <button
                onClick={() => setIsIdentityLookupOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                title={t('admin.users.identityLookup')}
              >
                <span className="material-symbols-outlined text-xl">person_search</span>
                <span className="text-sm font-semibold hidden sm:inline">{t('admin.users.identityLookup')}</span>
              </button>
              <button
                onClick={onOpenAdminNotifications}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">notifications</span>
              </button>
            </>
          )}
        />

        <div>
        <div className="flex justify-center mb-8">
          <div className="bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 inline-flex shadow-sm">
            <button
              onClick={() => onUserViewModeChange('suppliers')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${userViewMode === 'suppliers' ? 'bg-[#135bec] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <span className="material-symbols-outlined text-lg">storefront</span>
              {t('admin.users.suppliers')}
            </button>
            <button
              onClick={() => onUserViewModeChange('clients')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${userViewMode === 'clients' ? 'bg-[#135bec] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
              {t('admin.users.clients')}
            </button>
          </div>
        </div>

        {userViewMode === 'suppliers' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <p className="text-gray-900 dark:text-white text-3xl font-bold tracking-tight">{t('admin.users.supplierManagement')}</p>
              <button
                onClick={() => onOpenAddUser('supplier')}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
              >
                <span className="material-symbols-outlined mr-2 text-lg">add</span>
                <span>{t('admin.users.addSupplier')}</span>
              </button>
            </div>

            <div className="flex justify-between items-center gap-2 p-4 bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex gap-2 items-center">
                <label className="flex flex-col min-w-40 !h-10 max-w-64">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                    <div className="text-[#616f89] dark:text-gray-400 flex bg-gray-100 dark:bg-gray-800 items-center justify-center pl-3 rounded-l-lg">
                      <span className="material-symbols-outlined text-xl">search</span>
                    </div>
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-gray-800 dark:text-gray-200 focus:outline-0 focus:ring-0 border-none bg-gray-100 dark:bg-gray-800 h-full placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-2 text-sm"
                      placeholder={t('admin.users.searchSuppliers')}
                      value={supplierSearchTerm}
                      onChange={(event) => onSupplierSearchTermChange(event.target.value)}
                    />
                  </div>
                </label>
                <div className="relative">
                  <select
                    value={supplierStatusFilter}
                    onChange={(event) => onSupplierStatusFilterChange(event.target.value as 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION')}
                    className="h-10 appearance-none rounded-lg bg-gray-100 pl-3 pr-8 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    <option value="ALL">{t('admin.users.filter')} - {t('common.all')}</option>
                    <option value="APPROVED">{t('common.approved')}</option>
                    <option value="PENDING">{t('common.pending')}</option>
                    <option value="REJECTED">{t('common.rejected')}</option>
                    <option value="REQUIRES_ATTENTION">{t('admin.users.requiresAttention')}</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2 text-xl text-gray-500 dark:text-gray-300">expand_more</span>
                </div>
              </div>
              <button
                onClick={() => exportToCSV(filteredSupplierUsers, 'suppliers_export')}
                className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 gap-2 text-sm font-bold min-w-0 px-4"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                <span className="truncate">{t('admin.users.export')}</span>
              </button>
            </div>

            <div className="mt-2 @container">
              <div className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                <table className="w-full text-left">
                  <thead className="border-b border-gray-200 dark:border-gray-800">
                    <tr className="bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 w-12 text-center">
                        <input className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-transparent text-primary focus:ring-primary/50" type="checkbox" />
                      </th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.supplierName')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.status')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.kycStatus')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.dateJoined')}</th>
                      <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{t('admin.users.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filteredSupplierUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-4 py-2 w-12 text-center">
                          <input className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-transparent text-primary focus:ring-primary/50" type="checkbox" />
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{user.companyName}</td>
                        <td className="px-4 py-2 text-sm">
                          {getStatusBadge(normalizeSupplierStatus(user.status))}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {getKycBadge(user.kycStatus || 'INCOMPLETE')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{user.dateJoined}</td>
                        <td className="px-4 py-2 text-sm font-medium text-primary cursor-pointer hover:underline">
                          <div className="flex items-center gap-2">
                            <span onClick={() => onOpenUserAction(user)}>{t('admin.users.review')}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onConvertRole(user.id, UserRole.CLIENT); }}
                              className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title={t('admin.users.convertToClient')}
                            >
                              <span className="material-symbols-outlined text-[20px]">switch_account</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSupplierUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                          {t('common.noResults')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {userViewMode === 'clients' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-text-light dark:text-text-dark text-3xl font-black tracking-tight">{t('admin.users.clientManagement')}</p>
              <button
                onClick={() => onOpenAddUser('client')}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                <span className="material-symbols-outlined !text-xl">add</span>
                <span className="truncate">{t('admin.users.addClient')}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-light dark:border-border-dark bg-content-light dark:bg-content-dark p-4">
              <div className="flex items-center gap-2 flex-1 min-w-64">
                <label className="flex flex-col w-full">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-10">
                    <div className="text-subtext-light dark:text-subtext-dark flex border-none bg-background-light dark:bg-background-dark items-center justify-center pl-3.5 rounded-l-lg border-r-0">
                      <span className="material-symbols-outlined !text-xl">search</span>
                    </div>
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-light dark:text-text-dark focus:outline-0 focus:ring-2 focus:ring-primary/50 border-none bg-background-light dark:bg-background-dark h-full placeholder:text-subtext-light dark:placeholder:text-subtext-dark px-4 rounded-l-none border-l-0 pl-2 text-sm"
                      placeholder={t('admin.users.searchClients')}
                      value={clientSearchTerm}
                      onChange={(event) => onClientSearchTermChange(event.target.value)}
                    />
                  </div>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={clientStatusFilter}
                    onChange={(event) => onClientStatusFilterChange(event.target.value as 'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED')}
                    className="h-10 appearance-none rounded-lg border border-border-light bg-transparent pl-3 pr-8 text-sm font-medium text-subtext-light hover:bg-primary/10 dark:border-border-dark dark:text-subtext-dark"
                  >
                    <option value="ALL">{t('admin.users.statusAll')}</option>
                    <option value="ACTIVE">{t('admin.users.active')}</option>
                    <option value="PENDING">{t('common.pending')}</option>
                    <option value="DEACTIVATED">{t('admin.users.deactivated')}</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2 !text-xl">expand_more</span>
                </div>
                <div className="relative">
                  <select
                    value={clientDateRangeFilter}
                    onChange={(event) => onClientDateRangeFilterChange(event.target.value as 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR')}
                    className="h-10 appearance-none rounded-lg border border-border-light bg-transparent pl-3 pr-8 text-sm font-medium text-subtext-light hover:bg-primary/10 dark:border-border-dark dark:text-subtext-dark"
                  >
                    <option value="ALL">{t('admin.users.dateRange')}</option>
                    <option value="LAST_30_DAYS">{t('common.dateFilter.last30Days')}</option>
                    <option value="LAST_90_DAYS">{t('common.dateFilter.last90Days')}</option>
                    <option value="THIS_YEAR">{t('common.dateFilter.thisYear')}</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2 top-2 !text-xl">expand_more</span>
                </div>
                <button disabled className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg h-10 px-4 bg-transparent text-subtext-light dark:text-subtext-dark text-sm font-medium border border-border-light dark:border-border-dark hover:bg-primary/10 opacity-50 cursor-not-allowed">
                  <span className="truncate">{t('admin.users.bulkActions')}</span>
                  <span className="material-symbols-outlined !text-xl">expand_more</span>
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-content-light dark:bg-content-dark">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark/50">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">
                        <input className="h-5 w-5 rounded border-2 border-border-light dark:border-border-dark bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0" type="checkbox" />
                      </th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.clientName')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.company')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.email')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.status')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.creditLimit')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.margin')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark">{t('admin.users.dateJoined')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-subtext-light dark:text-subtext-dark text-right">{t('admin.users.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-text-light dark:text-text-dark">
                    {paginatedClientUsers.map((client) => (
                      <tr key={client.id} className="border-b border-border-light dark:border-border-dark last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="h-[72px] px-4 py-2 text-center w-12">
                          <input className="h-5 w-5 rounded border-2 border-border-light dark:border-border-dark bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0" type="checkbox" />
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm font-medium">{client.name}</td>
                        <td className="h-[72px] px-4 py-2 text-sm text-subtext-light dark:text-subtext-dark">{client.companyName}</td>
                        <td className="h-[72px] px-4 py-2 text-sm text-subtext-light dark:text-subtext-dark">{client.email}</td>
                        <td className="h-[72px] px-4 py-2 text-sm">
                          {getClientStatusBadge(normalizeClientStatus(client.status))}
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm font-semibold">
                          {creditLimitFormatter.format(Number(client.creditLimit || 0))}
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm font-medium text-subtext-light dark:text-subtext-dark">
                          {client.clientMargin !== undefined ? `${client.clientMargin}%` : '-'}
                        </td>
                        <td className="h-[72px] px-4 py-2 text-sm text-subtext-light dark:text-subtext-dark">{client.dateJoined}</td>
                        <td className="h-[72px] px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onOpenClientMarginModal(client)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              title={t('admin.users.setClientMargin')}
                            >
                              {t('admin.margins.margin')}
                            </button>
                            <button
                              data-testid={`admin-client-credit-set-${client.id}`}
                              onClick={() => onOpenCreditAdjustModal(client, 'SET')}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              {t('common.set')}
                            </button>
                            <button
                              data-testid={`admin-client-credit-increase-${client.id}`}
                              onClick={() => onOpenCreditAdjustModal(client, 'INCREASE')}
                              className="p-1.5 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              title={t('admin.users.increaseCredit')}
                            >
                              <span className="material-symbols-outlined text-base">add</span>
                            </button>
                            <button
                              data-testid={`admin-client-credit-decrease-${client.id}`}
                              onClick={() => onOpenCreditAdjustModal(client, 'DECREASE')}
                              className="p-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20"
                              title={t('admin.users.decreaseCredit')}
                            >
                              <span className="material-symbols-outlined text-base">remove</span>
                            </button>
                            <button
                              data-testid={`admin-client-credit-history-${client.id}`}
                              onClick={() => onOpenCreditHistoryModal(client)}
                              className="p-1.5 rounded-md border border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/20"
                              title={t('admin.users.creditLimitHistory')}
                            >
                              <span className="material-symbols-outlined text-base">history</span>
                            </button>
                            <button
                              onClick={() => onOpenUserAction(client)}
                              className="p-2 text-subtext-light dark:text-subtext-dark rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              <span className="material-symbols-outlined">more_horiz</span>
                            </button>
                            <button
                              onClick={() => onConvertRole(client.id, UserRole.SUPPLIER)}
                              className="p-1 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
                              title={t('admin.users.convertToSupplier')}
                            >
                              <span className="material-symbols-outlined text-[20px]">switch_account</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paginatedClientUsers.length === 0 && (
                      <tr>
                        <td colSpan={9} className="h-[72px] px-4 py-2 text-center text-sm text-subtext-light dark:text-subtext-dark">
                          {t('common.noResults')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-t border-border-light dark:border-border-dark">
                <p className="text-sm text-subtext-light dark:text-subtext-dark">
                  {t('admin.users.showingResults', { count: clientEnd - clientStart + (clientStart === 0 ? 0 : 1), total: filteredClientUsers.length })}
                  {' '}
                  ({clientStart}-{clientEnd})
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center justify-center rounded-lg size-9 border border-border-light dark:border-border-dark text-subtext-light dark:text-subtext-dark hover:bg-primary/10 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={currentClientPage <= 1}
                    onClick={() => onClientPageChange(Math.max(1, currentClientPage - 1))}
                  >
                    <span className="material-symbols-outlined !text-xl">chevron_left</span>
                  </button>
                  <button disabled className="flex items-center justify-center rounded-lg size-9 border border-primary bg-primary/20 text-primary font-bold">
                    {currentClientPage}
                  </button>
                  <button
                    onClick={() => onClientPageChange(Math.min(totalClientPages, currentClientPage + 1))}
                    disabled={currentClientPage >= totalClientPages}
                    className="flex items-center justify-center rounded-lg size-9 border border-border-light dark:border-border-dark text-subtext-light dark:text-subtext-dark hover:bg-primary/10 hover:text-primary"
                  >
                    <span className="material-symbols-outlined !text-xl">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </PortalPageShell>

      {isIdentityLookupOpen && (
        <IdentityLookupModal
          users={users}
          orders={orders}
          onClose={() => setIsIdentityLookupOpen(false)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Identity Lookup Modal (G18)                                       */
/* ------------------------------------------------------------------ */

interface IdentityLookupModalProps {
  users: User[];
  orders: Order[];
  onClose: () => void;
}

const IdentityLookupModal: React.FC<IdentityLookupModalProps> = ({ users, orders, onClose }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const creditLimitFormatter = useMemo(
    () => new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR', minimumFractionDigits: 0 }),
    []
  );

  const handleSearch = useCallback(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      setSelectedUser(null);
      return;
    }
    const found = users.find(
      (u) =>
        (u.publicId && u.publicId.toLowerCase() === query) ||
        u.id.toLowerCase() === query ||
        u.email.toLowerCase() === query ||
        (u.name && u.name.toLowerCase().includes(query))
    );
    setSelectedUser(found || null);
  }, [searchTerm, users]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const userOrders = useMemo(() => {
    if (!selectedUser) return [];
    return orders.filter(
      (o) => o.clientId === selectedUser.id || o.supplierId === selectedUser.id
    );
  }, [selectedUser, orders]);

  const orderSummary = useMemo(() => {
    const count = userOrders.length;
    const totalAmount = userOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    return { count, totalAmount };
  }, [userOrders]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      APPROVED: 'approved',
      ACTIVE: 'active',
      PENDING: 'pending',
      REJECTED: 'rejected',
      DEACTIVATED: 'deactivated',
      REQUIRES_ATTENTION: 'requires_attention',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  const getKycBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      VERIFIED: 'verified',
      IN_REVIEW: 'in_review',
      REJECTED: 'rejected',
      INCOMPLETE: 'incomplete',
    };
    return <StatusBadge status={statusMap[status] || 'pending'} size="sm" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <span className="material-symbols-outlined text-xl">person_search</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('admin.users.identityLookup')}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('admin.users.identityLookupDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-2">
            <div className="flex-1 flex items-stretch rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
              <div className="flex items-center justify-center pl-3 text-gray-400">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <input
                type="text"
                className="flex-1 px-3 py-2.5 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
                placeholder={t('admin.users.identitySearchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {t('common.search')}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="p-6 overflow-y-auto max-h-[55vh]">
          {!searchTerm.trim() && !selectedUser && (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-5xl text-gray-300 mb-3">manage_search</span>
              <p className="text-sm text-gray-500">
                {t('admin.users.identitySearchHint')}
              </p>
            </div>
          )}

          {searchTerm.trim() && !selectedUser && (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-5xl text-amber-300 mb-3">person_off</span>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('admin.users.identityNotFound')}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {t('admin.users.identityNotFoundHint')}
              </p>
            </div>
          )}

          {selectedUser && (
            <div className="space-y-5">
              {/* User Details Card */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-300 flex-shrink-0">
                    {selectedUser.profilePicture ? (
                      <img
                        src={selectedUser.profilePicture}
                        alt={selectedUser.name}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-2xl">person</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                      {selectedUser.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedUser.companyName}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                        {selectedUser.role}
                      </span>
                      {getStatusBadge(
                        selectedUser.status
                        || (selectedUser.role === UserRole.CLIENT ? 'ACTIVE' : 'PENDING')
                      )}
                    </div>
                  </div>
                </div>

                {/* Detail fields */}
                <div className="grid grid-cols-2 gap-4 mt-5">
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      {t('admin.users.email')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 truncate">{selectedUser.email}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      {t('admin.users.identityUserId')}
                    </p>
                    <p className="text-sm font-mono text-gray-900 dark:text-white mt-0.5 truncate">{selectedUser.id}</p>
                  </div>
                  {selectedUser.publicId && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        {t('admin.users.identityPublicId')}
                      </p>
                      <p className="text-sm font-mono text-gray-900 dark:text-white mt-0.5">{selectedUser.publicId}</p>
                    </div>
                  )}
                  {selectedUser.phone && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        {t('common.phone')}
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">{selectedUser.phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      {t('admin.users.kycStatus')}
                    </p>
                    <div className="mt-1">{getKycBadge(selectedUser.kycStatus || 'INCOMPLETE')}</div>
                  </div>
                  {selectedUser.dateJoined && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        {t('admin.users.dateJoined')}
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">{selectedUser.dateJoined}</p>
                    </div>
                  )}
                  {selectedUser.role === UserRole.CLIENT && (
                    <>
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                          {t('admin.users.creditLimit')}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                          {creditLimitFormatter.format(Number(selectedUser.creditLimit || 0))}
                        </p>
                      </div>
                      {selectedUser.creditUsed !== undefined && (
                        <div>
                          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                            {t('admin.users.identityCreditUsed')}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                            {creditLimitFormatter.format(Number(selectedUser.creditUsed || 0))}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {selectedUser.rating !== undefined && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        {t('admin.users.identityRating')}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-amber-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{selectedUser.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                  {selectedUser.role === UserRole.SUPPLIER && selectedUser.paymentSettings && (
                    <div className="col-span-2">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        {t('supplier.settings.paymentSettings')}
                      </p>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-900 dark:text-white">
                        <p>{selectedUser.paymentSettings.bankName || '-'}</p>
                        <p>{selectedUser.paymentSettings.accountHolder || '-'}</p>
                        <p>{selectedUser.paymentSettings.iban || '-'}</p>
                        <p>{selectedUser.paymentSettings.swiftCode || '-'}</p>
                      </div>
                    </div>
                  )}
                  {selectedUser.role === UserRole.SUPPLIER && selectedUser.kycDocuments && Object.keys(selectedUser.kycDocuments).length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        {t('supplier.settings.kycDocuments')}
                      </p>
                      <div className="mt-1 space-y-1">
                        {Object.entries(selectedUser.kycDocuments).map(([documentType, documentPath]) => (
                          <p key={documentType} className="text-sm text-gray-900 dark:text-white break-all">
                            <span className="font-semibold">{documentType}:</span>{' '}
                            <a
                              href={resolveStorageDocumentUrl(documentPath)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {documentPath}
                            </a>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Order History Summary */}
              <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-lg text-gray-600 dark:text-gray-300">receipt_long</span>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    {t('admin.users.identityOrderSummary')}
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">{orderSummary.count}</p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-300/70 font-medium mt-1">
                      {t('admin.users.identityTotalOrders')}
                    </p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
                      {creditLimitFormatter.format(orderSummary.totalAmount)}
                    </p>
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-300/70 font-medium mt-1">
                      {t('admin.users.identityTotalAmount')}
                    </p>
                  </div>
                </div>
                {userOrders.length === 0 && (
                  <p className="text-xs text-gray-400 mt-3 text-center">
                    {t('admin.users.identityNoOrders')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
