import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { CreditLimitAdjustment, CreditLimitAdjustmentType, Order, OrderStatus, PaymentAuditLog, Product, Quote, RFQ, User, UserRole } from '../../types/types';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import { loadChartJs } from '../../utils/loadChartJs';
import { AdminLeadsView } from '../../components/admin/views/AdminLeadsView';
import { AdminCustomRequestsView } from '../../components/admin/views/AdminCustomRequestsView';
import { AdminLogisticsView } from '../../components/admin/views/AdminLogisticsView';
import { AdminOrdersView } from '../../components/admin/views/AdminOrdersView';
import { AdminApprovalsView } from '../../components/admin/views/AdminApprovalsView';
import { AdminSettingsView } from '../../components/admin/views/AdminSettingsView';
import { AdminOverviewView } from '../../components/admin/views/AdminOverviewView';
import { AdminMarginsView } from '../../components/admin/views/AdminMarginsView';
import { AdminUsersManagementView } from '../../components/admin/views/AdminUsersManagementView';
import { AdminPOVerificationView } from '../../components/admin/views/AdminPOVerificationView';
import { AdminMasterCatalogView } from '../../components/admin/views/AdminMasterCatalogView';
import { AdminSupplierPerformanceView } from '../../components/admin/views/AdminSupplierPerformanceView';
import { AdminCreditUtilizationView } from '../../components/admin/views/AdminCreditUtilizationView';
import { AdminPayoutsView } from '../../components/admin/views/AdminPayoutsView';
import { AdminCategoriesView } from '../../components/admin/views/AdminCategoriesView';
import { api } from '../../services/api';

interface AdminPortalProps {
  activeTab: string;
  onNavigate?: (tab: string) => void;
}

export const exportToCSV = (data: any[], filename: string) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(fieldName => JSON.stringify(row[fieldName], (key, value) => value === null ? '' : value)).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const AdminPortal: React.FC<AdminPortalProps> = ({ activeTab, onNavigate }) => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  // Store access
  const {
    products, quotes, users, rfqs, orders,
    systemConfig, updateSystemConfig,
    marginSettings, updateMarginSetting,
    addUser, updateUser,
    adjustClientCreditLimit, getClientCreditLimitAdjustments, setClientMargin, setRFQMargin,
    loadOrders, loadQuotes, loadUsers, loadProducts, loadRFQs, loadSystemConfig, loadMarginSettings
  } = useStore();



  // Local state for individual quote overrides (Manual) - kept local for now or could be part of Quote object
  const [editingQuotes, setEditingQuotes] = useState<Record<string, number>>({});

  // Charts Refs


  // User Management Sub-tab state
  const [userViewMode, setUserViewMode] = useState<'suppliers' | 'clients'>('suppliers');
  const [dashboardStats, setDashboardStats] = useState<import('../../services/dashboardService').DashboardStats | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addUserType, setAddUserType] = useState<'supplier' | 'client'>('supplier');
  const [adminOverlay, setAdminOverlay] = useState<'none' | 'notifications' | 'help' | 'range'>('none');
  const [overviewRangeDays, setOverviewRangeDays] = useState(30);
  const [overviewCustomRangeInput, setOverviewCustomRangeInput] = useState('30');
  const [isTabDataLoading, setIsTabDataLoading] = useState(false);

  // Users view state
  const [usersGlobalSearchTerm, setUsersGlobalSearchTerm] = useState('');
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION'>('ALL');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientStatusFilter, setClientStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'DEACTIVATED'>('ALL');
  const [clientDateRangeFilter, setClientDateRangeFilter] = useState<'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR'>('ALL');
  const [clientPage, setClientPage] = useState(1);
  const [isCreditAdjustModalOpen, setIsCreditAdjustModalOpen] = useState(false);
  const [creditAdjustClient, setCreditAdjustClient] = useState<User | null>(null);
  const [creditAdjustMode, setCreditAdjustMode] = useState<CreditLimitAdjustmentType>('SET');
  const [isCreditAdjustSubmitting, setIsCreditAdjustSubmitting] = useState(false);
  const [isCreditHistoryModalOpen, setIsCreditHistoryModalOpen] = useState(false);
  const [creditHistoryClient, setCreditHistoryClient] = useState<User | null>(null);
  const [creditHistoryEntries, setCreditHistoryEntries] = useState<CreditLimitAdjustment[]>([]);
  const [isCreditHistoryLoading, setIsCreditHistoryLoading] = useState(false);

  // Client Margin State
  const [isClientMarginModalOpen, setIsClientMarginModalOpen] = useState(false);
  const [clientMarginClient, setClientMarginClient] = useState<User | null>(null);
  const [isClientMarginSubmitting, setIsClientMarginSubmitting] = useState(false);
  const [marginClientSearchTerm, setMarginClientSearchTerm] = useState('');
  const [clientWidgetSearch, setClientWidgetSearch] = useState('');
  const [rfqWidgetSearch, setRfqWidgetSearch] = useState('');

  // RFQ Margin Modal State
  const [isRFQMarginModalOpen, setIsRFQMarginModalOpen] = useState(false);
  const [selectedRFQForMargin, setSelectedRFQForMargin] = useState<RFQ | null>(null);
  const [currentRFQMargin, setCurrentRFQMargin] = useState<number>(0);
  const [isRFQMarginSubmitting, setIsRFQMarginSubmitting] = useState(false);

  const handleOpenAddUser = (type: 'supplier' | 'client') => {
    setAddUserType(type);
    setIsAddUserModalOpen(true);
  };

  const handleCreateUser = async (userData: any) => {
    try {
      await addUser(userData);
      toast.success(t('admin.users.userCreated', 'User created successfully'));
    } catch (error: any) {
      logger.error('Error creating user:', error);
      toast.error(error.message || t('admin.users.createUserFailed', 'Failed to create user'));
    }
  };

  // User Action State
  const [selectedUserForAction, setSelectedUserForAction] = useState<any>(null);
  const [isUserActionModalOpen, setIsUserActionModalOpen] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    userId: string;
    newRole: UserRole;
    userLabel: string;
  } | null>(null);
  const [isConvertingRole, setIsConvertingRole] = useState(false);

  const handleOpenUserAction = (user: any) => {
    setSelectedUserForAction(user);
    setIsUserActionModalOpen(true);
  };

  const handleUpdateUserStatus = async (userId: string, status: any, kycStatus?: any) => {
    if (!updateUser) {
      logger.warn('updateUser action missing in store');
      return;
    }

    const updatedUser = await updateUser(userId, { status, kycStatus });
    if (!updatedUser) {
      toast.error(t('common.error', 'Unable to save changes'));
      return;
    }

    toast.success(t('common.statusUpdated', 'User status updated'));
  };

  const handleConvertRole = async (userId: string, newRole: UserRole) => {
    const targetUser = users.find((user) => user.id === userId);
    setPendingRoleChange({
      userId,
      newRole,
      userLabel: targetUser?.companyName || targetUser?.name || userId
    });
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChange) return;

    try {
      setIsConvertingRole(true);
      const updatedUser = await updateUser(pendingRoleChange.userId, { role: pendingRoleChange.newRole });
      if (!updatedUser) {
        throw new Error('Failed to update user role');
      }
      toast.success(t('admin.users.roleUpdated', 'User role updated successfully'));
      setPendingRoleChange(null);
    } catch (error) {
      logger.error('Failed to update user role:', error);
      toast.error(t('admin.users.roleUpdateFailed', 'Failed to update user role'));
    } finally {
      setIsConvertingRole(false);
    }
  };

  const sarLocale = i18n.language === 'ar' ? 'ar-SA' : 'en-SA';
  const creditLimitFormatter = new Intl.NumberFormat(sarLocale, {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  });

  const handleOpenCreditAdjustModal = (client: User, mode: CreditLimitAdjustmentType) => {
    setCreditAdjustClient(client);
    setCreditAdjustMode(mode);
    setIsCreditAdjustModalOpen(true);
  };

  const handleCloseCreditAdjustModal = () => {
    setIsCreditAdjustModalOpen(false);
    setCreditAdjustClient(null);
  };

  const loadCreditHistoryForClient = async (clientId: string) => {
    try {
      const entries = await getClientCreditLimitAdjustments(clientId, 30);
      setCreditHistoryEntries(entries);
    } catch (err) {
      logger.error('Failed to load credit history:', err);
      setCreditHistoryEntries([]);
    }
  };

  const handleOpenCreditHistoryModal = async (client: User) => {
    setCreditHistoryClient(client);
    setIsCreditHistoryModalOpen(true);
    setIsCreditHistoryLoading(true);
    await loadCreditHistoryForClient(client.id);
    setIsCreditHistoryLoading(false);
  };

  const handleCloseCreditHistoryModal = () => {
    setIsCreditHistoryModalOpen(false);
    setCreditHistoryClient(null);
    setCreditHistoryEntries([]);
    setIsCreditHistoryLoading(false);
  };

  const handleOpenClientMarginModal = (client: User) => {
    setClientMarginClient(client);
    setIsClientMarginModalOpen(true);
  };

  const handleSaveClientMargin = async (clientId: string, margin: number) => {
    setIsClientMarginSubmitting(true);
    const result = await setClientMargin(clientId, margin);
    setIsClientMarginSubmitting(false);

    if (result.success) {
      toast.success(t('admin.users.marginUpdated', 'Client margin updated successfully'));
      setIsClientMarginModalOpen(false);
    } else {
      toast.error(t('admin.users.marginUpdateError', 'Failed to update client margin'));
    }
  };

  const handleOpenRFQMarginModal = (rfqId: string, currentMargin: number) => {
    const rfq = rfqs.find(r => r.id === rfqId);
    if (rfq) {
      setSelectedRFQForMargin(rfq);
      setCurrentRFQMargin(currentMargin);
      setIsRFQMarginModalOpen(true);
    }
  };

  const handleSaveRFQMargin = async (rfqId: string, margin: number) => {
    setIsRFQMarginSubmitting(true);
    const result = await setRFQMargin(rfqId, margin);
    if (result.success) {
      await loadQuotes();
      setEditingQuotes((previous) => {
        const next = { ...previous };
        quotes
          .filter((quote) => quote.rfqId === rfqId)
          .forEach((quote) => {
            delete next[quote.id];
          });
        return next;
      });
      toast.success(t('admin.margins.rfqMarginUpdated', 'RFQ margin updated'));
      setIsRFQMarginModalOpen(false);
    } else {
      toast.error(result.error || t('common.error', 'Failed to update RFQ margin'));
    }
    setIsRFQMarginSubmitting(false);
  };

  const handleApproveProduct = async (productId: string): Promise<boolean> => {
    try {
      await api.approveProduct(productId);
      await loadProducts();
      return true;
    } catch (error) {
      logger.error('Failed to approve product', { productId, error });
      toast.error(t('admin.products.approveFailed', 'Failed to approve product'));
      return false;
    }
  };

  const handleRejectProduct = async (productId: string): Promise<boolean> => {
    try {
      await api.rejectProduct(productId);
      await loadProducts();
      return true;
    } catch (error) {
      logger.error('Failed to reject product', { productId, error });
      toast.error(t('admin.products.rejectFailed', 'Failed to reject product'));
      return false;
    }
  };

  const handleSubmitCreditAdjustment = async (payload: { amount: number; reason: string }) => {
    if (!creditAdjustClient) return;

    setIsCreditAdjustSubmitting(true);
    const result = await adjustClientCreditLimit(
      creditAdjustClient.id,
      creditAdjustMode,
      payload.amount,
      payload.reason
    );
    setIsCreditAdjustSubmitting(false);

    if (!result.user) {
      toast.error(result.error || t('common.error', 'Unable to update credit limit'));
      return;
    }

    if (selectedUserForAction?.id === result.user.id) {
      setSelectedUserForAction({ ...selectedUserForAction, creditLimit: result.user.creditLimit });
    }

    const actionVerb = creditAdjustMode === 'SET'
      ? t('common.set', 'set')
      : creditAdjustMode === 'INCREASE'
        ? t('admin.users.increaseCredit', 'increased')
        : t('admin.users.decreaseCredit', 'decreased');

    toast.success(
      t('admin.users.creditLimitUpdateSuccess', {
        defaultValue: `Credit limit ${actionVerb} to ${creditLimitFormatter.format(Number(result.user.creditLimit || 0))}`,
        name: result.user.companyName || result.user.name,
        action: actionVerb,
        amount: creditLimitFormatter.format(Number(result.user.creditLimit || 0))
      })
    );

    // Reload users list to reflect updated credit limits in the table
    await loadUsers();

    if (creditHistoryClient?.id === result.user.id) {
      setIsCreditHistoryLoading(true);
      await loadCreditHistoryForClient(result.user.id);
      setIsCreditHistoryLoading(false);
    }

    handleCloseCreditAdjustModal();
  };

  // Charts Refs
  const salesChartRef = useRef<HTMLCanvasElement>(null);
  const marginChartRef = useRef<HTMLCanvasElement>(null);
  const ordersChartRef = useRef<HTMLCanvasElement>(null);
  const revenueChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<Array<{ destroy: () => void }>>([]);

  const categoryMatchKey = (value: string | null | undefined): string => {
    const normalized = (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (normalized === 'itsupplies' || normalized === 'it') return 'itsupplies';
    if (normalized === 'officesupplies') return 'office';
    return normalized;
  };

  const categoryTranslationKey = (value: string): string => {
    const key = categoryMatchKey(value);
    if (key === 'itsupplies') return 'itSupplies';
    return key || value;
  };

  // Helper: Get category for a quote based on the first item in its RFQ
  const getQuoteCategory = (quote: Quote): string => {
    const rfq = rfqs.find((r) => r.id === quote.rfqId);
    const rfqItems = Array.isArray(rfq?.items) ? rfq.items : [];
    if (rfqItems.length === 0) return 'Office';
    const firstItem = rfqItems[0];
    if (!firstItem?.productId) return 'Office';
    const product = products.find((p) => p.id === firstItem.productId);
    return (product?.category || 'Office').trim() || 'Office';
  };



  // Helper: Determine effective margin and source
  // Priority: 1) Manual Override, 2) Client-Specific, 3) MAX(Category, Global)
  const getEffectiveMarginData = (quote: Quote, category: string) => {
    // 1. Manual Override (via local state) — highest priority
    if (editingQuotes[quote.id] !== undefined) {
      return { value: editingQuotes[quote.id], source: t('admin.margins.manualOverride'), type: 'manual' };
    }

    // 2. Client-Specific Margin — second priority
    const rfq = rfqs.find(r => r.id === quote.rfqId);
    if (rfq) {
      const client = users.find(u => u.id === rfq.clientId);
      if (client?.clientMargin !== undefined && client.clientMargin !== null) {
        return { value: client.clientMargin, source: `${t('admin.margins.clientSpecific')} ${client.companyName || client.name}`, type: 'client' };
      }
    }

    // 3. MAX(Category Margin, Global Margin) — use whichever is higher to maximize MWRD profit
    const targetCategoryKey = categoryMatchKey(category);
    const matchingCategorySettings = marginSettings.filter(
      (marginSetting) => categoryMatchKey(marginSetting.category) === targetCategoryKey
    );
    const categoryMargin = matchingCategorySettings.reduce((maxMargin, currentSetting) => (
      Math.max(maxMargin, Number(currentSetting.marginPercent || 0))
    ), 0);
    const globalMargin = systemConfig.defaultMarginPercent;
    const categoryLabel = t(`categories.${categoryTranslationKey(category)}.label`, category);

    if (categoryMargin >= globalMargin && matchingCategorySettings.length > 0) {
      return {
        value: categoryMargin,
        source: `${t('admin.margins.categoryPrefix')} ${categoryLabel} (${t('admin.margins.higherThanGlobal')})`,
        type: 'category'
      };
    }

    return { value: globalMargin, source: `${t('admin.margins.universalMargin')} (${t('admin.margins.higherThanCategory')})`, type: 'global' };
  };

  const handleManualMarginChange = (quoteId: string, val: number) => {
    setEditingQuotes({ ...editingQuotes, [quoteId]: val });
  };



  const validateMarginValue = (value: number): number | null => {
    if (!Number.isFinite(value)) return null;
    if (value < 0 || value > 100) return null;
    return Number(value.toFixed(2));
  };

  const handleCategoryMarginSave = async (category: string, val: number): Promise<{ success: boolean; error?: string }> => {
    const normalized = validateMarginValue(val);
    if (normalized === null) {
      const error = t('admin.margins.invalidMarginRange', 'Margin must be between 0 and 100');
      toast.error(error);
      return { success: false, error };
    }

    const sanitizedCategory = category.trim();
    const success = await updateMarginSetting(sanitizedCategory, normalized);
    if (success) {
      toast.success(
        t('admin.margins.categoryMarginSaved', {
          category: t(`categories.${categoryTranslationKey(sanitizedCategory)}.label`, sanitizedCategory),
        })
      );
      return { success: true };
    }

    const error = t('admin.margins.categoryMarginSaveFailed', 'Failed to update category margin');
    toast.error(error);
    return { success: false, error };
  };

  const handleGlobalMarginSave = async (val: number): Promise<{ success: boolean; error?: string }> => {
    const normalized = validateMarginValue(val);
    if (normalized === null) {
      const error = t('admin.margins.invalidMarginRange', 'Margin must be between 0 and 100');
      toast.error(error);
      return { success: false, error };
    }

    const systemConfigUpdated = await updateSystemConfig({
      ...systemConfig,
      defaultMarginPercent: normalized,
    });
    if (systemConfigUpdated) {
      await loadSystemConfig(); // Reload to update UI immediately
      toast.success(t('admin.margins.globalMarginSaved', 'Global margin updated'));
      return { success: true };
    }

    const marginSettingUpdated = await updateMarginSetting(null, normalized);
    if (marginSettingUpdated) {
      await loadSystemConfig(); // Reload to update UI immediately
      toast.success(t('admin.margins.globalMarginSaved', 'Global margin updated'));
      return { success: true };
    }

    const error = t('admin.margins.globalMarginSaveFailed', 'Failed to update global margin');
    toast.error(error);
    return { success: false, error };
  };

  const resetQuoteMargin = (quoteId: string) => {
    const newEditing = { ...editingQuotes };
    delete newEditing[quoteId];
    setEditingQuotes(newEditing);
  };

  const parseDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const matchesRelativeDateFilter = (value: string | undefined, filter: 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR') => {
    if (filter === 'ALL') return true;
    const date = parseDate(value);
    if (!date) return false;
    const now = new Date();
    if (filter === 'THIS_YEAR') return date.getFullYear() === now.getFullYear();
    const days = filter === 'LAST_7_DAYS' ? 7 : filter === 'LAST_30_DAYS' ? 30 : 90;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    return date >= threshold;
  };

  const handleSetOverviewLast30Days = () => {
    setOverviewRangeDays(30);
  };

  const handleSetOverviewCustomRange = () => {
    setOverviewCustomRangeInput(String(overviewRangeDays));
    setAdminOverlay('range');
  };

  const handleApplyOverviewCustomRange = () => {
    const parsed = Number(overviewCustomRangeInput);
    if (!Number.isFinite(parsed) || parsed < 7 || parsed > 365) {
      toast.error(t('admin.overview.invalidRange', 'Please enter a number between 7 and 365'));
      return;
    }
    setOverviewRangeDays(Math.floor(parsed));
    closeAdminOverlay();
  };

  const openAdminNotifications = () => {
    setAdminOverlay('notifications');
  };

  const openAdminHelp = () => {
    setAdminOverlay('help');
  };

  const closeAdminOverlay = () => {
    setAdminOverlay('none');
  };

  const renderAdminOverlay = () => {
    if (adminOverlay === 'none') return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-900">
              {adminOverlay === 'notifications'
                ? t('common.notifications', 'Notifications')
                : adminOverlay === 'range'
                  ? t('admin.overview.customRangeTitle', 'Custom Date Range')
                  : t('common.help', 'Help')}
            </h3>
            <button
              onClick={closeAdminOverlay}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {adminOverlay === 'notifications' ? (
            <div className="space-y-3 p-4">
              {[
                t('admin.overview.pendingActions', 'Pending actions require review'),
                t('admin.approvals.itemsAwaitingReview', 'Products are awaiting approval'),
                t('admin.users.supplierManagement', 'User updates are available'),
              ].map((item, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          ) : adminOverlay === 'range' ? (
            <div className="space-y-4 p-4">
              <p className="text-sm text-slate-600">
                {t('admin.overview.customRangePrompt', 'Enter number of days (7-365)')}
              </p>
              <input
                type="number"
                min={7}
                max={365}
                value={overviewCustomRangeInput}
                onChange={(event) => setOverviewCustomRangeInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={closeAdminOverlay}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleApplyOverviewCustomRange}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t('common.apply', 'Apply')}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm text-slate-600 mb-4">
                {t('help.description', 'Find answers to common questions and manage your support requests.')}
              </p>
              <div className="grid gap-3">
                <button className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <span className="material-symbols-outlined">description</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{t('help.reviewRequests', 'Review Requests')}</h4>
                    <p className="text-xs text-slate-500">{t('help.checkPendingItems', 'Check pending items')}</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600">
                    <span className="material-symbols-outlined">settings</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{t('help.openSettings', 'Open Settings')}</h4>
                    <p className="text-xs text-slate-500">{t('help.configureSystem', 'Configure system')}</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleSendQuoteToClient = async (quoteId: string) => {
    try {
      const quote = quotes.find((item) => item.id === quoteId);
      if (!quote) {
        toast.error(t('admin.margins.quoteNotFound', 'Quote not found'));
        return;
      }

      const marginPercent = Number(editingQuotes[quoteId] ?? quote.marginPercent ?? systemConfig.defaultMarginPercent);
      const supplierPrice = Number(quote.supplierPrice || 0);
      const finalPrice = Math.round(supplierPrice * (1 + marginPercent / 100) * 100) / 100;

      await api.updateQuote(quoteId, {
        status: 'SENT_TO_CLIENT',
        marginPercent,
        finalPrice,
      });

      setEditingQuotes((previous) => {
        const next = { ...previous };
        delete next[quoteId];
        return next;
      });
      await loadQuotes();
      toast.success(t('admin.margins.sentToClient', 'Quote sent to client'));
    } catch (error) {
      logger.error('Failed to send quote to client', error);
      toast.error(t('admin.margins.sendFailed', 'Failed to send quote to client'));
    }
  };

  const handleRejectQuote = async (quoteId: string) => {
    try {
      await api.updateQuote(quoteId, { status: 'REJECTED' });
      await loadQuotes();
      toast.success(t('admin.margins.quoteRejected', 'Quote rejected'));
    } catch (error) {
      logger.error('Failed to reject quote', error);
      toast.error(t('admin.margins.rejectFailed', 'Failed to reject quote'));
    }
  };

  const toDateKey = (value?: string) => {
    const parsed = parseDate(value);
    return parsed ? parsed.toISOString().split('T')[0] : null;
  };

  const toMonthKey = (value?: string) => {
    const parsed = parseDate(value);
    if (!parsed) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  };

  const orderDateValue = (order: Order) => order.createdAt || order.updatedAt || order.date;
  const quoteMarginById = new Map(quotes.map((quote) => [quote.id, quote.marginPercent]));

  const resolveOrderMargin = (order: Order) => {
    if (order.quoteId && quoteMarginById.has(order.quoteId)) {
      return quoteMarginById.get(order.quoteId) as number;
    }
    return systemConfig.defaultMarginPercent;
  };

  const recentDays = Array.from({ length: overviewRangeDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (overviewRangeDays - 1 - i));
    return d.toISOString().split('T')[0];
  });
  const recentDaySet = new Set(recentDays);

  const previousDays = Array.from({ length: overviewRangeDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - ((overviewRangeDays * 2) - 1 - i));
    return d.toISOString().split('T')[0];
  });
  const previousDaySet = new Set(previousDays);

  const dailySalesMap = new Map<string, number>();
  const dailyOrderCountMap = new Map<string, number>();
  const dailyMarginMap = new Map<string, { sum: number; count: number }>();

  orders.forEach((order) => {
    const dateKey = toDateKey(orderDateValue(order));
    if (!dateKey) return;

    dailyOrderCountMap.set(dateKey, (dailyOrderCountMap.get(dateKey) || 0) + 1);

    if (order.status !== 'CANCELLED') {
      dailySalesMap.set(dateKey, (dailySalesMap.get(dateKey) || 0) + order.amount);
      const dailyMargin = dailyMarginMap.get(dateKey) || { sum: 0, count: 0 };
      dailyMargin.sum += resolveOrderMargin(order);
      dailyMargin.count += 1;
      dailyMarginMap.set(dateKey, dailyMargin);
    }
  });

  const salesData = recentDays.map((day) => dailySalesMap.get(day) || 0);
  const ordersCountData = recentDays.map((day) => dailyOrderCountMap.get(day) || 0);
  const marginData = recentDays.map((day) => {
    const entry = dailyMarginMap.get(day);
    if (!entry || entry.count === 0) return systemConfig.defaultMarginPercent;
    return entry.sum / entry.count;
  });

  const currentRangeOrders = orders.filter((order) => {
    const dateKey = toDateKey(orderDateValue(order));
    return dateKey ? recentDaySet.has(dateKey) : false;
  });
  const previousRangeOrders = orders.filter((order) => {
    const dateKey = toDateKey(orderDateValue(order));
    return dateKey ? previousDaySet.has(dateKey) : false;
  });

  const currentRangeNonCancelledOrders = currentRangeOrders.filter((order) => order.status !== 'CANCELLED');
  const previousRangeNonCancelledOrders = previousRangeOrders.filter((order) => order.status !== 'CANCELLED');

  const currentTotalSales = currentRangeNonCancelledOrders.reduce((sum, order) => sum + order.amount, 0);
  const previousTotalSales = previousRangeNonCancelledOrders.reduce((sum, order) => sum + order.amount, 0);

  const getAverageMargin = (items: Order[]) => {
    if (items.length === 0) return systemConfig.defaultMarginPercent;
    const total = items.reduce((sum, order) => sum + resolveOrderMargin(order), 0);
    return total / items.length;
  };

  const currentAverageMargin = getAverageMargin(currentRangeNonCancelledOrders);
  const previousAverageMargin = getAverageMargin(previousRangeNonCancelledOrders);

  const currentTotalOrders = currentRangeOrders.length;
  const previousTotalOrders = previousRangeOrders.length;

  const calcPercentDelta = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const salesDelta = calcPercentDelta(currentTotalSales, previousTotalSales);
  const marginDelta = currentAverageMargin - previousAverageMargin;
  const ordersDelta = calcPercentDelta(currentTotalOrders, previousTotalOrders);

  const formatDelta = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  const trendClassName = (value: number) => (
    value >= 0
      ? 'text-positive dark:text-positive'
      : 'text-negative dark:text-negative'
  );
  const trendIcon = (value: number) => (value >= 0 ? 'arrow_upward' : 'arrow_downward');

  const moneyFormatter = new Intl.NumberFormat(sarLocale, { style: 'currency', currency: 'SAR' });
  const integerFormatter = new Intl.NumberFormat(sarLocale);

  const orderDates = orders
    .map((order) => parseDate(orderDateValue(order)))
    .filter((date): date is Date => date !== null);
  const latestOrderDate = orderDates.length > 0
    ? new Date(Math.max(...orderDates.map((date) => date.getTime())))
    : new Date();

  const monthlyPeriods = Array.from({ length: 12 }, (_, i) => {
    const monthDate = new Date(latestOrderDate.getFullYear(), latestOrderDate.getMonth() - (11 - i), 1);
    return {
      key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      label: monthDate.toLocaleString('en-US', { month: 'short' }),
    };
  });
  const monthlyPeriodSet = new Set(monthlyPeriods.map((period) => period.key));
  const monthlySalesMap = new Map<string, number>();
  const monthlyMarginMap = new Map<string, { sum: number; count: number }>();

  orders.forEach((order) => {
    const monthKey = toMonthKey(orderDateValue(order));
    if (!monthKey || !monthlyPeriodSet.has(monthKey)) return;

    if (order.status !== 'CANCELLED') {
      monthlySalesMap.set(monthKey, (monthlySalesMap.get(monthKey) || 0) + order.amount);
      const monthMargins = monthlyMarginMap.get(monthKey) || { sum: 0, count: 0 };
      monthMargins.sum += resolveOrderMargin(order);
      monthMargins.count += 1;
      monthlyMarginMap.set(monthKey, monthMargins);
    }
  });

  const monthlySalesData = monthlyPeriods.map((period) => monthlySalesMap.get(period.key) || 0);
  const monthlyMarginData = monthlyPeriods.map((period) => {
    const entry = monthlyMarginMap.get(period.key);
    if (!entry || entry.count === 0) return systemConfig.defaultMarginPercent;
    return Number((entry.sum / entry.count).toFixed(1));
  });
  const monthlyLabels = monthlyPeriods.map((period) => period.label);

  const orderStatusBadgeClasses: Record<string, string> = {
    PENDING_ADMIN_CONFIRMATION: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300',
    PENDING_PAYMENT: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    AWAITING_CONFIRMATION: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300',
    PAYMENT_CONFIRMED: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
    PROCESSING: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
    READY_FOR_PICKUP: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
    PICKUP_SCHEDULED: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300',
    OUT_FOR_DELIVERY: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
    SHIPPED: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300',
    IN_TRANSIT: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300',
    DELIVERED: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300',
    CANCELLED: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
  };

  const recentOrders = [...orders]
    .sort((a, b) => {
      const aDate = parseDate(orderDateValue(a));
      const bDate = parseDate(orderDateValue(b));
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
    })
    .slice(0, 5)
    .map((order) => {
      const client = users.find((user) => user.id === order.clientId);
      const dateKey = toDateKey(orderDateValue(order)) || '-';
      return {
        id: order.id,
        client: client?.companyName || client?.name || t('admin.overview.unknownClient', 'Unknown Client'),
        status: order.status,
        value: moneyFormatter.format(order.amount),
        date: dateKey,
      };
    });

  const readyForPickupOrders = orders
    .filter((order) => order.status === 'READY_FOR_PICKUP')
    .map((order) => {
      const supplier = users.find((user) => user.id === order.supplierId);
      return {
        id: order.id,
        supplierName: supplier?.companyName || supplier?.publicId || supplier?.name || t('admin.overview.unknownSupplier', 'Unknown Supplier'),
      };
    })
    .slice(0, 12);

  const quotesById = new Map(quotes.map((quote) => [quote.id, quote]));
  const rfqsById = new Map(rfqs.map((rfq) => [rfq.id, rfq]));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const validRevenueOrders = orders.filter((order) => order.status !== 'CANCELLED');

  const categoryRevenueMap = new Map<string, number>();
  validRevenueOrders.forEach((order) => {
    const quote = order.quoteId ? quotesById.get(order.quoteId) : undefined;
    const rfq = quote ? rfqsById.get(quote.rfqId) : undefined;
    const firstItem = rfq?.items?.[0];
    const category = firstItem
      ? (productsById.get(firstItem.productId)?.category || t('admin.overview.uncategorized', 'Uncategorized'))
      : t('admin.overview.uncategorized', 'Uncategorized');
    categoryRevenueMap.set(category, (categoryRevenueMap.get(category) || 0) + Number(order.amount || 0));
  });

  const totalCategoryRevenue = Array.from(categoryRevenueMap.values()).reduce((sum, value) => sum + value, 0);
  const categoryRevenue = Array.from(categoryRevenueMap.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([category, revenue]) => ({
      category,
      revenue,
      percentage: totalCategoryRevenue > 0 ? Math.round((revenue / totalCategoryRevenue) * 100) : 0,
    }));

  const productStats = new Map<string, { name: string; sold: number; revenue: number }>();
  validRevenueOrders.forEach((order) => {
    const quote = order.quoteId ? quotesById.get(order.quoteId) : undefined;
    const rfq = quote ? rfqsById.get(quote.rfqId) : undefined;
    const fallbackItems = Array.isArray(rfq?.items)
      ? (rfq.items as Array<{ productId: string; quantity?: number }>)
      : [];
    const orderItems = Array.isArray(order.items)
      ? (order.items as Array<{ productId?: string; name?: string; quantity?: number; lineTotal?: number; line_total?: number; unitPrice?: number; unit_price?: number }>)
      : fallbackItems;

    orderItems.forEach((item) => {
      const productId = item.productId;
      if (!productId) return;
      const quantity = Number(item.quantity || 0);
      const lineTotal = Number(item.lineTotal ?? item.line_total ?? 0);
      const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
      const revenue = lineTotal > 0 ? lineTotal : unitPrice > 0 ? unitPrice * quantity : 0;
      const productName = item.name || productsById.get(productId)?.name || productId;
      const current = productStats.get(productId) || { name: productName, sold: 0, revenue: 0 };
      productStats.set(productId, {
        name: current.name || productName,
        sold: current.sold + quantity,
        revenue: current.revenue + revenue,
      });
    });
  });

  const topProducts = Array.from(productStats.entries())
    .map(([id, stats]) => ({ id, name: stats.name, sold: stats.sold, revenue: stats.revenue }))
    .sort((left, right) => {
      if (right.revenue !== left.revenue) return right.revenue - left.revenue;
      return right.sold - left.sold;
    })
    .slice(0, 5);

  const pendingSupplierUsers = users.filter((user) =>
    user.role === UserRole.SUPPLIER && (user.status === 'PENDING' || user.status === 'REQUIRES_ATTENTION')
  );
  const pendingClientUsers = users.filter((user) =>
    user.role === UserRole.CLIENT && user.status === 'PENDING'
  );
  const pendingProductApprovals = products.filter((product) => product.status === 'PENDING');
  const pendingQuoteReviews = quotes.filter((quote) => quote.status === 'PENDING_ADMIN');
  const paymentReviewOrders = orders.filter((order) => order.status === 'AWAITING_CONFIRMATION');

  const overviewPendingActions: Array<{ type: string; desc: string; tab: string }> = [];

  // Use real stats for pending actions if available
  if (dashboardStats?.pendingUsers) {
    overviewPendingActions.push({
      type: t('admin.overview.newSupplier'),
      desc: `${dashboardStats.pendingUsers} ${t('admin.overview.awaitsVerification', 'users awaiting verification')}`,
      tab: 'users',
    });
  }

  if (dashboardStats?.pendingProducts) {
    overviewPendingActions.push({
      type: t('admin.overview.productApproval'),
      desc: `${dashboardStats.pendingProducts} ${t('admin.overview.needsApproval', 'products need approval')}`,
      tab: 'approvals',
    });
  }

  // Fallback to existing logic if dashboardStats is null (or for other types)
  if (!dashboardStats && pendingQuoteReviews[0]) {
    overviewPendingActions.push({
      type: t('admin.overview.pendingActions'),
      desc: `${pendingQuoteReviews.length} ${t('admin.margins.quotesAwaitingApproval', 'quotes awaiting approval')}`,
      tab: 'margins',
    });
  }

  const visiblePendingActions = overviewPendingActions.slice(0, 4);
  const handleOverviewAction = (tab: string) => {
    if (onNavigate) {
      onNavigate(tab);
      return;
    }
    openAdminNotifications();
  };

  const handleOpenReadyForPickupOrder = (orderId: string) => {
    try {
      localStorage.setItem('mwrd-admin-orders-focus', orderId);
    } catch {
      // no-op
    }
    handleOverviewAction('orders');
  };

  useEffect(() => {
    setClientPage(1);
  }, [clientSearchTerm, clientStatusFilter, clientDateRangeFilter, usersGlobalSearchTerm, userViewMode]);

  useEffect(() => {
    let isCancelled = false;
    const refreshAdminData = async () => {
      const refreshTasks: Promise<unknown>[] = [];

      if (activeTab === 'overview' || activeTab === 'users' || activeTab === 'supplier-performance' || activeTab === 'credit-utilization' || activeTab === 'margins' || activeTab === 'payouts' || activeTab === 'custom-requests' || activeTab === 'po-verification') {
        refreshTasks.push(loadUsers());
      }

      if (activeTab === 'overview' || activeTab === 'orders' || activeTab === 'credit-utilization' || activeTab === 'logistics' || activeTab === 'payouts' || activeTab === 'po-verification') {
        refreshTasks.push(loadOrders());
      }

      if (activeTab === 'overview' || activeTab === 'margins' || activeTab === 'supplier-performance') {
        refreshTasks.push(loadQuotes());
      }

      if (activeTab === 'approvals' || activeTab === 'overview' || activeTab === 'margins') {
        refreshTasks.push(loadProducts());
      }

      if (activeTab === 'margins' || activeTab === 'overview') {
        refreshTasks.push(loadRFQs());
      }

      if (activeTab === 'settings' || activeTab === 'overview') {
        refreshTasks.push(loadSystemConfig());
        refreshTasks.push(loadMarginSettings());
      }

      if (refreshTasks.length > 0) {
        setIsTabDataLoading(true);
        try {
          const refreshResults = await Promise.allSettled(refreshTasks);
          const failedResults = refreshResults.filter(
            (result): result is PromiseRejectedResult => result.status === 'rejected'
          );
          if (!isCancelled && failedResults.length > 0) {
            logger.error('Failed to refresh admin tab data', {
              activeTab,
              failureCount: failedResults.length,
              failures: failedResults.map((result) => (
                result.reason instanceof Error ? result.reason.message : String(result.reason)
              )),
            });
            toast.error(t('admin.loadingTabDataFailed', 'Some dashboard data failed to load. Please refresh again.'));
          }
        } finally {
          if (!isCancelled) {
            setIsTabDataLoading(false);
          }
        }
      } else {
        setIsTabDataLoading(false);
      }
    };

    void refreshAdminData();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, loadMarginSettings, loadOrders, loadProducts, loadQuotes, loadRFQs, loadSystemConfig, loadUsers]);

  // Fetch Dashboard Stats
  useEffect(() => {
    const fetchStats = async () => {
      const stats = await import('../../services/dashboardService').then(m => m.dashboardService.getAdminStats());
      setDashboardStats(stats);
    };
    if (activeTab === 'overview') {
      fetchStats();
    }
  }, [activeTab]);

  // Initialize charts for the Overview tab.
  useEffect(() => {
    let isCancelled = false;

    const destroyCharts = () => {
      chartInstances.current.forEach((chart) => chart.destroy());
      chartInstances.current = [];
    };

    const initCharts = async () => {
      if (activeTab !== 'overview') {
        destroyCharts();
        return;
      }

      let Chart: Awaited<ReturnType<typeof loadChartJs>>;
      try {
        Chart = await loadChartJs();
      } catch (error) {
        destroyCharts();
        logger.error('Chart.js failed to load', error);
        return;
      }

      if (isCancelled) {
        return;
      }

      destroyCharts();

      const colors = {
        'neutral-800': '#111318',
        'neutral-100': '#f0f2f4',
        'neutral-600': '#616f89',
        'neutral-200': '#dbdfe6',
        'chart-blue': '#3b82f6',
        'chart-green': '#22c55e',
        'chart-purple': '#8b5cf6',
      };

      const commonTooltipOptions = {
        enabled: true,
        backgroundColor: colors['neutral-800'],
        titleColor: colors['neutral-100'],
        bodyColor: colors['neutral-100'],
        borderColor: colors['neutral-600'],
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) {
              if (context.dataset.yAxisID === 'yMargin') {
                label += context.parsed.y.toFixed(1) + '%';
              } else if (context.dataset.label === 'Orders' || context.dataset.label === t('admin.margins.orders')) {
                label += context.parsed.y;
              } else {
                label += new Intl.NumberFormat(sarLocale, { style: 'currency', currency: 'SAR' }).format(context.parsed.y);
              }
            }
            return label;
          }
        }
      };

      const commonChartOptions = {
        maintainAspectRatio: false,
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { point: { radius: 0, hoverRadius: 5 }, line: { tension: 0.4 } },
      };

      // Sales Chart
      if (salesChartRef.current && !isCancelled) {
        const ctx = salesChartRef.current.getContext('2d');
        if (ctx) {
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

          const chart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: recentDays.map(d => d.split('-').slice(1).join('/')),
              datasets: [{
                label: t('admin.overview.sales'),
                data: salesData,
                borderColor: colors['chart-blue'],
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
              }]
            },
            options: { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, tooltip: commonTooltipOptions } }
          });
          chartInstances.current.push(chart);
        }
      }

      // Margin Chart
      if (marginChartRef.current && !isCancelled) {
        const ctx = marginChartRef.current.getContext('2d');
        if (ctx) {
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

          const chart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: recentDays.map(d => d.split('-').slice(1).join('/')),
              datasets: [{
                label: t('admin.overview.margin'),
                data: marginData,
                borderColor: colors['chart-purple'],
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
              }]
            },
            options: { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, tooltip: { ...commonTooltipOptions, callbacks: { label: (context: any) => `${t('admin.overview.margin')}: ${context.parsed.y.toFixed(1)}%` } } } }
          });
          chartInstances.current.push(chart);
        }
      }

      // Orders Chart
      if (ordersChartRef.current && !isCancelled) {
        const chart = new Chart(ordersChartRef.current, {
          type: 'bar',
          data: {
            labels: recentDays.map(d => d.split('-').slice(1).join('/')),
            datasets: [{
              label: t('admin.margins.orders'),
              data: ordersCountData,
              backgroundColor: colors['chart-green'],
              borderRadius: 2,
              barThickness: 4,
            }]
          },
          options: { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, tooltip: { ...commonTooltipOptions, callbacks: { label: (context: any) => `${t('admin.margins.orders')}: ${context.parsed.y}` } } } }
        });
        chartInstances.current.push(chart);
      }

      // Revenue Main Chart
      if (revenueChartRef.current && !isCancelled) {
        const chart = new Chart(revenueChartRef.current, {
          type: 'bar',
          data: {
            labels: monthlyLabels,
            datasets: [
              {
                label: t('admin.overview.sales'),
                data: monthlySalesData,
                backgroundColor: colors['chart-blue'],
                borderColor: colors['chart-blue'],
                borderWidth: 1,
                borderRadius: 4,
                yAxisID: 'ySales',
              },
              {
                label: t('admin.overview.margin'),
                data: monthlyMarginData,
                backgroundColor: colors['chart-green'],
                borderColor: colors['chart-green'],
                type: 'line',
                tension: 0.4,
                yAxisID: 'yMargin',
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: colors['chart-green'],
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: commonTooltipOptions },
            scales: {
              x: { grid: { display: false }, ticks: { color: colors['neutral-600'] } },
              ySales: {
                type: 'linear',
                position: 'left',
                grid: { color: colors['neutral-200'], borderDash: [4, 4] },
                ticks: { color: colors['neutral-600'], callback: (value: any) => t('common.currency') + ' ' + value / 1000 + 'k' }
              },
              yMargin: {
                type: 'linear',
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { color: colors['neutral-600'], callback: (value: any) => value + '%' }
              }
            }
          }
        });
        chartInstances.current.push(chart);
      }
    };

    void initCharts();

    return () => {
      isCancelled = true;
      destroyCharts();
    };
  }, [activeTab, overviewRangeDays, orders, quotes, systemConfig.defaultMarginPercent, t]);

  const showInitialTabLoading = isTabDataLoading && (
    (activeTab === 'overview' && (orders.length === 0 || quotes.length === 0))
    || (activeTab === 'users' && users.length === 0)
    || (activeTab === 'margins' && (rfqs.length === 0 || quotes.length === 0))
    || (activeTab === 'approvals' && products.length === 0)
    || (activeTab === 'orders' && orders.length === 0)
    || (activeTab === 'logistics' && orders.length === 0)
    || (activeTab === 'credit-utilization' && (users.length === 0 || orders.length === 0))
    || (activeTab === 'payouts' && (users.length === 0 || orders.length === 0))
  );

  if (showInitialTabLoading) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <span className="material-symbols-outlined mb-3 inline-flex animate-spin text-4xl text-slate-400">progress_activity</span>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('common.loading', 'Loading...')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin.loadingTabData', 'Fetching latest dashboard data...')}
          </p>
        </div>
      </div>
    );
  }

  if (activeTab === 'overview') {
    return (
      <AdminOverviewView
        overviewRangeDays={overviewRangeDays}
        onSetOverviewLast30Days={handleSetOverviewLast30Days}
        onSetOverviewCustomRange={handleSetOverviewCustomRange}
        onOpenAdminNotifications={openAdminNotifications}
        onOverviewAction={handleOverviewAction}
        onExportOrdersCsv={() => exportToCSV(orders, 'orders_export')}
        dashboardStats={dashboardStats}
        currentTotalSales={currentTotalSales}
        currentAverageMargin={currentAverageMargin}
        currentTotalOrders={currentTotalOrders}
        salesDelta={salesDelta}
        marginDelta={marginDelta}
        ordersDelta={ordersDelta}
        moneyFormatter={moneyFormatter}
        integerFormatter={integerFormatter}
        trendClassName={trendClassName}
        trendIcon={trendIcon}
        formatDelta={formatDelta}
        salesChartRef={salesChartRef}
        marginChartRef={marginChartRef}
        ordersChartRef={ordersChartRef}
        revenueChartRef={revenueChartRef}
        visiblePendingActions={visiblePendingActions}
        recentOrders={recentOrders}
        readyForPickupOrders={readyForPickupOrders}
        categoryRevenue={categoryRevenue}
        topProducts={topProducts}
        onOpenReadyForPickupOrder={handleOpenReadyForPickupOrder}
        orderStatusBadgeClasses={orderStatusBadgeClasses}
        renderAdminOverlay={renderAdminOverlay}
      />
    );
  }

  if (activeTab === 'approvals') {
    return (
      <AdminApprovalsView
        products={products}
        users={users}
        onApproveProduct={handleApproveProduct}
        onRejectProduct={handleRejectProduct}
        exportToCSV={exportToCSV}
        openAdminNotifications={openAdminNotifications}
        openAdminHelp={openAdminHelp}
        renderAdminOverlay={renderAdminOverlay}
      />
    );
  }

  if (activeTab === 'margins') {
    return (
      <AdminMarginsView
        systemConfig={systemConfig}
        marginSettings={marginSettings}
        users={users}
        rfqs={rfqs}
        products={products}
        quotes={quotes}
        marginClientSearchTerm={marginClientSearchTerm}
        onMarginClientSearchTermChange={setMarginClientSearchTerm}
        clientWidgetSearch={clientWidgetSearch}
        onClientWidgetSearchChange={setClientWidgetSearch}
        rfqWidgetSearch={rfqWidgetSearch}
        onRfqWidgetSearchChange={setRfqWidgetSearch}
        onGlobalMarginSave={handleGlobalMarginSave}
        onCategoryMarginSave={handleCategoryMarginSave}
        onOpenClientMarginModal={handleOpenClientMarginModal}
        onOpenRFQMarginModal={handleOpenRFQMarginModal}
        getEffectiveMarginData={getEffectiveMarginData}
        getQuoteCategory={getQuoteCategory}
        onManualMarginChange={handleManualMarginChange}
        onResetQuoteMargin={resetQuoteMargin}
        onSendQuoteToClient={handleSendQuoteToClient}
        onRejectQuote={handleRejectQuote}
        clientMarginClient={clientMarginClient}
        isClientMarginModalOpen={isClientMarginModalOpen}
        onCloseClientMarginModal={() => {
          setIsClientMarginModalOpen(false);
          setClientMarginClient(null);
        }}
        onSaveClientMargin={handleSaveClientMargin}
        isClientMarginSubmitting={isClientMarginSubmitting}
        selectedRFQForMargin={selectedRFQForMargin}
        isRFQMarginModalOpen={isRFQMarginModalOpen}
        onCloseRFQMarginModal={() => {
          setIsRFQMarginModalOpen(false);
          setSelectedRFQForMargin(null);
        }}
        currentRFQMargin={currentRFQMargin}
        onSaveRFQMargin={handleSaveRFQMargin}
        isRFQMarginSubmitting={isRFQMarginSubmitting}
      />
    );
  }

  // Unified Users Management View (Supports Suppliers and Clients)
  if (activeTab === 'users') {
    return (
      <AdminUsersManagementView
        users={users}
        userViewMode={userViewMode}
        onUserViewModeChange={setUserViewMode}
        usersGlobalSearchTerm={usersGlobalSearchTerm}
        onUsersGlobalSearchTermChange={setUsersGlobalSearchTerm}
        supplierSearchTerm={supplierSearchTerm}
        onSupplierSearchTermChange={setSupplierSearchTerm}
        supplierStatusFilter={supplierStatusFilter}
        onSupplierStatusFilterChange={setSupplierStatusFilter}
        clientSearchTerm={clientSearchTerm}
        onClientSearchTermChange={setClientSearchTerm}
        clientStatusFilter={clientStatusFilter}
        onClientStatusFilterChange={setClientStatusFilter}
        clientDateRangeFilter={clientDateRangeFilter}
        onClientDateRangeFilterChange={setClientDateRangeFilter}
        clientPage={clientPage}
        onClientPageChange={setClientPage}
        matchesRelativeDateFilter={matchesRelativeDateFilter}
        creditLimitFormatter={creditLimitFormatter}
        onOpenAdminNotifications={openAdminNotifications}
        onOpenAddUser={handleOpenAddUser}
        onOpenUserAction={handleOpenUserAction}
        onConvertRole={handleConvertRole}
        onOpenClientMarginModal={handleOpenClientMarginModal}
        onOpenCreditAdjustModal={handleOpenCreditAdjustModal}
        onOpenCreditHistoryModal={handleOpenCreditHistoryModal}
        exportToCSV={exportToCSV}
        renderAdminOverlay={renderAdminOverlay}
        isClientMarginModalOpen={isClientMarginModalOpen}
        onCloseClientMarginModal={() => setIsClientMarginModalOpen(false)}
        clientMarginClient={clientMarginClient}
        onSaveClientMargin={handleSaveClientMargin}
        isClientMarginSubmitting={isClientMarginSubmitting}
        isCreditAdjustModalOpen={isCreditAdjustModalOpen}
        onCloseCreditAdjustModal={handleCloseCreditAdjustModal}
        creditAdjustClient={creditAdjustClient}
        creditAdjustMode={creditAdjustMode}
        onSubmitCreditAdjustment={handleSubmitCreditAdjustment}
        isCreditAdjustSubmitting={isCreditAdjustSubmitting}
        isCreditHistoryModalOpen={isCreditHistoryModalOpen}
        onCloseCreditHistoryModal={handleCloseCreditHistoryModal}
        creditHistoryClientName={creditHistoryClient?.companyName || creditHistoryClient?.name || '-'}
        creditHistoryEntries={creditHistoryEntries}
        isCreditHistoryLoading={isCreditHistoryLoading}
        isAddUserModalOpen={isAddUserModalOpen}
        onCloseAddUserModal={() => setIsAddUserModalOpen(false)}
        addUserType={addUserType}
        onCreateUser={handleCreateUser}
        selectedUserForAction={selectedUserForAction}
        isUserActionModalOpen={isUserActionModalOpen}
        onCloseUserActionModal={() => setIsUserActionModalOpen(false)}
        onUpdateUserStatus={handleUpdateUserStatus}
      />
    );
  }

  if (activeTab === 'supplier-performance') {
    return (
      <AdminSupplierPerformanceView
        users={users}
        quotes={quotes}
        orders={orders}
        products={products}
      />
    );
  }

  if (activeTab === 'credit-utilization') {
    return (
      <AdminCreditUtilizationView
        users={users}
        orders={orders}
      />
    );
  }

  // --- LOGISTICS VIEW ---
  // (Moving directly to used implementation)

  if (activeTab === 'leads') {
    return <AdminLeadsView />;
  }

  if (activeTab === 'custom-requests') {
    return <AdminCustomRequestsView />;
  }

  if (activeTab === 'orders') {
    return <AdminOrdersView exportToCSV={exportToCSV} />;
  }

  if (activeTab === 'po-verification') {
    return <AdminPOVerificationView />;
  }

  if (activeTab === 'logistics') {
    return (
      <AdminLogisticsView
        orders={orders}
        users={users}
        orderStatusBadgeClasses={orderStatusBadgeClasses}
        onRefreshOrders={loadOrders}
      />
    );
  }

  if (activeTab === 'inventory') {
    return <AdminCategoriesView />;
  }

  if (activeTab === 'master-catalog') {
    return <AdminMasterCatalogView />;
  }

  if (activeTab === 'payouts') {
    return <AdminPayoutsView />;
  }

  if (activeTab === 'settings') {
    return <AdminSettingsView />;
  }

  if (activeTab === 'categories' || activeTab === 'category-management' || activeTab === 'category-hierarchy') {
    return <AdminCategoriesView />;
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 flex items-center justify-center h-96 flex-col text-center rounded-2xl">
      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
        <span className="material-symbols-outlined text-4xl text-slate-300">construction</span>
      </div>
      <h3 className="text-xl font-bold text-slate-900">{t('comingSoon.title')}</h3>
      <p className="text-slate-500 max-w-md mt-2 leading-relaxed">{t('comingSoon.description')}</p>
    </div>
  );
};
