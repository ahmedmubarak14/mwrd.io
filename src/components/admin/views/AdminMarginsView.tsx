import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClientMarginModal } from '../ClientMarginModal';
import RFQMarginModal from '../RFQMarginModal';
import { StatusBadge } from '../../ui/StatusBadge';
import {
  PortalMetricCard,
  PortalPageHeader,
  PortalPageShell,
  PortalSection
} from '../../ui/PortalDashboardShell';
import { Product, Quote, RFQ, SystemConfig, User, UserRole } from '../../../types/types';
import { categoryService } from '../../../services/categoryService';
import { api } from '../../../services/api';
import { logger } from '../../../utils/logger';

interface MarginSetting {
  category: string | null;
  marginPercent: number;
}

interface MarginData {
  value: number;
  source: string;
  type: string;
}

interface SaveResult {
  success: boolean;
  error?: string;
}

interface AdminMarginsViewProps {
  systemConfig: SystemConfig;
  marginSettings: MarginSetting[];
  users: User[];
  rfqs: RFQ[];
  products: Product[];
  quotes: Quote[];
  marginClientSearchTerm: string;
  onMarginClientSearchTermChange: (value: string) => void;
  clientWidgetSearch: string;
  onClientWidgetSearchChange: (value: string) => void;
  rfqWidgetSearch: string;
  onRfqWidgetSearchChange: (value: string) => void;
  onGlobalMarginSave: (value: number) => Promise<SaveResult>;
  onCategoryMarginSave: (category: string, value: number) => Promise<SaveResult>;
  onOpenClientMarginModal: (client: User) => void;
  onOpenRFQMarginModal: (rfqId: string, currentMargin: number) => void;
  getEffectiveMarginData: (quote: Quote, category: string) => MarginData;
  getQuoteCategory: (quote: Quote) => string;
  onManualMarginChange: (quoteId: string, value: number) => void;
  onResetQuoteMargin: (quoteId: string) => void;
  onSendQuoteToClient: (quoteId: string) => void;
  onRejectQuote?: (quoteId: string) => void;
  clientMarginClient: User | null;
  isClientMarginModalOpen: boolean;
  onCloseClientMarginModal: () => void;
  onSaveClientMargin: (clientId: string, margin: number) => Promise<void>;
  isClientMarginSubmitting: boolean;
  selectedRFQForMargin: RFQ | null;
  isRFQMarginModalOpen: boolean;
  onCloseRFQMarginModal: () => void;
  currentRFQMargin: number;
  onSaveRFQMargin: (rfqId: string, margin: number) => Promise<void>;
  isRFQMarginSubmitting: boolean;
}

const parseMarginInput = (input: string): number | null => {
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return Number(value.toFixed(2));
};

const clampMargin = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value.toFixed(2))));
};

const toReadableCategory = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toCategoryMatchKey = (value: string | null | undefined): string => {
  const normalized = (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'itsupplies' || normalized === 'it') return 'itsupplies';
  if (normalized === 'officesupplies') return 'office';
  return normalized;
};

const toCategoryTranslationKey = (value: string): string => {
  const matchKey = toCategoryMatchKey(value);
  if (matchKey === 'itsupplies') return 'itSupplies';
  return matchKey || value;
};

const formatCurrencyValue = (value: number): string =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const AdminMarginsView: React.FC<AdminMarginsViewProps> = ({
  systemConfig,
  marginSettings,
  users,
  rfqs,
  products,
  quotes,
  marginClientSearchTerm,
  onMarginClientSearchTermChange,
  clientWidgetSearch,
  onClientWidgetSearchChange,
  rfqWidgetSearch,
  onRfqWidgetSearchChange,
  onGlobalMarginSave,
  onCategoryMarginSave,
  onOpenClientMarginModal,
  onOpenRFQMarginModal,
  getEffectiveMarginData,
  getQuoteCategory,
  onManualMarginChange,
  onResetQuoteMargin,
  onSendQuoteToClient,
  onRejectQuote,
  clientMarginClient,
  isClientMarginModalOpen,
  onCloseClientMarginModal,
  onSaveClientMargin,
  isClientMarginSubmitting,
  selectedRFQForMargin,
  isRFQMarginModalOpen,
  onCloseRFQMarginModal,
  currentRFQMargin,
  onSaveRFQMargin,
  isRFQMarginSubmitting,
}) => {
  const { t } = useTranslation();
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [fallbackUsers, setFallbackUsers] = useState<User[]>([]);
  const [globalMarginInput, setGlobalMarginInput] = useState(String(systemConfig.defaultMarginPercent ?? 0));
  const [isSavingGlobalMargin, setIsSavingGlobalMargin] = useState(false);
  const [globalMarginError, setGlobalMarginError] = useState<string | null>(null);
  const [categoryMarginInputs, setCategoryMarginInputs] = useState<Record<string, string>>({});
  const [savingCategoryMargins, setSavingCategoryMargins] = useState<Record<string, boolean>>({});
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string | null>>({});
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [quoteSearchTerm, setQuoteSearchTerm] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<'ALL' | string>('ALL');
  const [quoteTypeFilter, setQuoteTypeFilter] = useState<'ALL' | 'auto' | 'custom'>('ALL');
  const [manualOverridesOnly, setManualOverridesOnly] = useState(false);

  const effectiveUsers = useMemo(() => (users.length > 0 ? users : fallbackUsers), [users, fallbackUsers]);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );
  const usersById = useMemo(() => new Map(effectiveUsers.map((user) => [user.id, user])), [effectiveUsers]);
  const rfqsById = useMemo(() => new Map(rfqs.map((rfq) => [rfq.id, rfq])), [rfqs]);
  const clientUsers = useMemo(
    () => effectiveUsers.filter((user) => user.role === UserRole.CLIENT),
    [effectiveUsers]
  );
  const quoteCountByRfqId = useMemo(() => {
    const counts: Record<string, number> = {};
    quotes.forEach((quote) => {
      counts[quote.rfqId] = (counts[quote.rfqId] ?? 0) + 1;
    });
    return counts;
  }, [quotes]);

  const categoryKeys = useMemo(() => {
    const keysByMatch = new Map<string, string>();
    dbCategories.forEach((category) => {
      const key = toCategoryMatchKey(category);
      if (!key) return;
      if (!keysByMatch.has(key)) {
        keysByMatch.set(key, category);
      }
    });
    marginSettings.forEach((setting) => {
      const key = toCategoryMatchKey(setting.category);
      if (!key) return;
      if (!keysByMatch.has(key) && setting.category) {
        keysByMatch.set(key, setting.category);
      }
    });
    products.forEach((product) => {
      const category = product.category?.trim();
      const key = toCategoryMatchKey(category);
      if (!key || !category) return;
      if (!keysByMatch.has(key)) {
        keysByMatch.set(key, category);
      }
    });
    return Array.from(keysByMatch.values()).sort((a, b) => a.localeCompare(b));
  }, [dbCategories, marginSettings, products]);

  const savedCategoryMargins = useMemo(() => {
    const values: Record<string, number> = {};
    categoryKeys.forEach((category) => {
      const categoryMatch = toCategoryMatchKey(category);
      const stored = marginSettings.find(
        (setting) => toCategoryMatchKey(setting.category) === categoryMatch
      );
      values[category] = stored?.marginPercent ?? systemConfig.defaultMarginPercent;
    });
    return values;
  }, [categoryKeys, marginSettings, systemConfig.defaultMarginPercent]);

  const quickClientMatches = useMemo(() => {
    const term = marginClientSearchTerm.trim().toLowerCase();
    if (!term) return [];
    return clientUsers
      .filter((client) =>
        `${client.name} ${client.companyName || ''} ${client.email}`.toLowerCase().includes(term)
      )
      .slice(0, 6);
  }, [clientUsers, marginClientSearchTerm]);

  const clientList = useMemo(() => {
    const term = clientWidgetSearch.trim().toLowerCase();
    if (!term) return clientUsers;
    return clientUsers.filter((client) =>
      `${client.name} ${client.companyName || ''} ${client.email}`.toLowerCase().includes(term)
    );
  }, [clientUsers, clientWidgetSearch]);

  const filteredRfqs = useMemo(() => {
    const term = rfqWidgetSearch.trim().toLowerCase();
    if (!term) return rfqs;
    return rfqs.filter((rfq) => {
      const firstItem = rfq.items?.[0];
      const productName = firstItem ? productsById.get(firstItem.productId)?.name || '' : '';
      return (
        rfq.id.toLowerCase().includes(term) ||
        productName.toLowerCase().includes(term) ||
        rfq.status.toLowerCase().includes(term)
      );
    });
  }, [productsById, rfqWidgetSearch, rfqs]);

  const sortedQuotes = useMemo(() => {
    const statusPriority: Record<string, number> = {
      PENDING_ADMIN: 0,
      SENT_TO_CLIENT: 1,
      ACCEPTED: 2,
      REJECTED: 3,
    };

    return [...quotes].sort((left, right) => {
      const leftPriority = statusPriority[left.status] ?? 99;
      const rightPriority = statusPriority[right.status] ?? 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.id.localeCompare(right.id);
    });
  }, [quotes]);

  const categoriesWithOverrides = useMemo(
    () => marginSettings.filter((setting) => Boolean(setting.category)).length,
    [marginSettings]
  );
  const clientsWithCustomMargin = useMemo(
    () => clientUsers.filter((client) => client.clientMargin !== undefined && client.clientMargin !== null).length,
    [clientUsers]
  );
  const pendingReviewQuotes = useMemo(
    () => quotes.filter((quote) => quote.status === 'PENDING_ADMIN').length,
    [quotes]
  );
  const filteredCategoryKeys = useMemo(() => {
    const term = categorySearchTerm.trim().toLowerCase();
    if (!term) return categoryKeys;
    return categoryKeys.filter((category) => {
      const label = toReadableCategory(category).toLowerCase();
      return label.includes(term);
    });
  }, [categoryKeys, categorySearchTerm]);
  const filteredQuotes = useMemo(() => {
    const term = quoteSearchTerm.trim().toLowerCase();

    return sortedQuotes.filter((quote) => {
      const type = quote.type === 'auto' ? 'auto' : 'custom';
      if (quoteTypeFilter !== 'ALL' && type !== quoteTypeFilter) return false;
      if (quoteStatusFilter !== 'ALL' && quote.status !== quoteStatusFilter) return false;

      const category = getQuoteCategory(quote);
      const effective = getEffectiveMarginData(quote, category);
      if (manualOverridesOnly && effective.type !== 'manual') return false;

      if (!term) return true;

      const rfq = rfqsById.get(quote.rfqId) || null;
      const supplier = usersById.get(quote.supplierId);
      const client = rfq ? usersById.get(rfq.clientId) : null;
      const searchText = [
        quote.id,
        quote.rfqId,
        quote.status,
        supplier?.publicId,
        supplier?.companyName,
        supplier?.name,
        client?.publicId,
        client?.companyName,
        client?.name,
        category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(term);
    });
  }, [
    sortedQuotes,
    quoteSearchTerm,
    quoteTypeFilter,
    quoteStatusFilter,
    manualOverridesOnly,
    getQuoteCategory,
    getEffectiveMarginData,
    rfqsById,
    usersById,
  ]);

  useEffect(() => {
    let isActive = true;
    const loadCategories = async () => {
      try {
        const mainCategories = await categoryService.getMainCategories();
        if (!isActive) return;
        setDbCategories(mainCategories || []);
      } catch {
        if (!isActive) return;
        setDbCategories([]);
      }
    };

    void loadCategories();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (users.length > 0) {
      setFallbackUsers([]);
      return;
    }

    let isActive = true;
    const loadFallbackUsers = async () => {
      try {
        const rows = await api.getUsers({ page: 1, pageSize: 500 });
        if (!isActive) return;
        setFallbackUsers(rows);
      } catch (error) {
        logger.warn('Unable to load fallback users for admin margins view', error);
      }
    };

    void loadFallbackUsers();
    return () => {
      isActive = false;
    };
  }, [users]);

  useEffect(() => {
    setGlobalMarginInput(String(systemConfig.defaultMarginPercent ?? 0));
  }, [systemConfig.defaultMarginPercent]);

  useEffect(() => {
    const nextInputs: Record<string, string> = {};
    categoryKeys.forEach((category) => {
      nextInputs[category] = String(savedCategoryMargins[category]);
    });
    setCategoryMarginInputs(nextInputs);
    setCategoryErrors({});
  }, [categoryKeys, savedCategoryMargins]);

  const parsedGlobalMargin = parseMarginInput(globalMarginInput);
  const globalMarginChanged =
    parsedGlobalMargin !== null && parsedGlobalMargin !== systemConfig.defaultMarginPercent;

  const handleSaveGlobalMargin = async () => {
    const parsed = parseMarginInput(globalMarginInput);
    if (parsed === null) {
      setGlobalMarginError(t('admin.margins.invalidMarginRange'));
      return;
    }

    setIsSavingGlobalMargin(true);
    setGlobalMarginError(null);
    const result = await onGlobalMarginSave(parsed);
    setIsSavingGlobalMargin(false);

    if (!result.success) {
      setGlobalMarginError(result.error || t('admin.margins.marginSaveFailed'));
    }
  };

  const handleSaveCategoryMargin = async (category: string) => {
    const parsed = parseMarginInput(categoryMarginInputs[category] ?? '');
    if (parsed === null) {
      setCategoryErrors((prev) => ({
        ...prev,
        [category]: t('admin.margins.invalidMarginRange'),
      }));
      return;
    }

    setSavingCategoryMargins((prev) => ({ ...prev, [category]: true }));
    setCategoryErrors((prev) => ({ ...prev, [category]: null }));
    const result = await onCategoryMarginSave(category, parsed);
    setSavingCategoryMargins((prev) => ({ ...prev, [category]: false }));

    if (!result.success) {
      setCategoryErrors((prev) => ({
        ...prev,
        [category]: result.error || t('admin.margins.marginSaveFailed'),
      }));
    }
  };

  const getClientMarginBadgeLabel = (client: User) =>
    client.clientMargin !== undefined && client.clientMargin !== null
      ? `${client.clientMargin}%`
      : t('admin.margins.default');

  const getRfqProductLabel = (rfq: RFQ) => {
    const firstItem = rfq.items?.[0];
    if (!firstItem) return t('admin.margins.unknownProduct');
    return productsById.get(firstItem.productId)?.name || t('admin.margins.unknownProduct');
  };

  return (
    <div data-testid="admin-margins-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.margins')}
          subtitle={t(
            'admin.margins.configurationDesc'
          )}
          actions={(
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
              {t('admin.margins.universalMargin')}: {systemConfig.defaultMarginPercent}%
            </div>
          )}
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PortalMetricCard
            label={t('admin.margins.universalMargin')}
            value={`${systemConfig.defaultMarginPercent}%`}
            icon="tune"
            tone="info"
          />
          <PortalMetricCard
            label={t('admin.margins.categoryMargins')}
            value={categoriesWithOverrides}
            icon="category"
            tone="success"
            hint={t('admin.margins.categoriesConfigured')}
          />
          <PortalMetricCard
            label={t('admin.margins.manageClientMargins')}
            value={clientsWithCustomMargin}
            icon="group"
            tone="info"
            hint={t('admin.margins.clientsWithCustomMargins')}
          />
          <PortalMetricCard
            label={t('admin.margins.quoteManager')}
            value={pendingReviewQuotes}
            icon="receipt_long"
            tone="warning"
            hint={t('admin.margins.quotesAwaitingApproval')}
          />
        </section>

        <PortalSection title={t('admin.margins.configuration')}>

        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="global-margin-input">
              {t('admin.margins.universalMargin')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="global-margin-input"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={globalMarginInput}
                onChange={(event) => setGlobalMarginInput(event.target.value)}
                aria-label={t('admin.margins.universalMargin')}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
              />
              <span className="text-sm font-semibold text-gray-500">%</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {t(
                'admin.margins.globalMarginHint'
              )}
            </p>
            {globalMarginError && <p className="mt-2 text-xs font-semibold text-red-600">{globalMarginError}</p>}
            <button
              type="button"
              onClick={handleSaveGlobalMargin}
              disabled={isSavingGlobalMargin || parsedGlobalMargin === null || !globalMarginChanged}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#0A2540] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#081a2c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingGlobalMargin && (
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              )}
              {isSavingGlobalMargin ? t('common.saving') : t('common.save')}
            </button>
          </div>

          <div className="lg:col-span-3">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-semibold text-gray-700">{t('admin.margins.categoryMargins')}</h4>
              <div className="relative w-full sm:w-72">
                <span className="material-symbols-outlined pointer-events-none absolute left-2 top-2.5 text-base text-gray-400">
                  search
                </span>
                <input
                  type="text"
                  value={categorySearchTerm}
                  onChange={(event) => setCategorySearchTerm(event.target.value)}
                  placeholder={t('admin.margins.searchCategoriesPlaceholder')}
                  aria-label={t('admin.margins.searchCategoriesPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-8 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCategoryKeys.map((category) => {
                const parsed = parseMarginInput(categoryMarginInputs[category] ?? '');
                const savedValue = savedCategoryMargins[category];
                const hasChanges = parsed !== null && parsed !== savedValue;
                const categoryTranslationKey = toCategoryTranslationKey(category);
                const categoryLabel = t(
                  `categories.${categoryTranslationKey}.label`,
                  toReadableCategory(category)
                );

                return (
                  <div key={category} className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{categoryLabel}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={categoryMarginInputs[category] ?? ''}
                        onChange={(event) =>
                          setCategoryMarginInputs((prev) => ({
                            ...prev,
                            [category]: event.target.value,
                          }))
                        }
                        aria-label={t('admin.margins.marginPercentage')}
                        className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
                      />
                      <span className="text-sm font-semibold text-gray-500">%</span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {t('admin.margins.source')}: {savedValue}%
                    </p>
                    {categoryErrors[category] && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600">{categoryErrors[category]}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSaveCategoryMargin(category)}
                      disabled={savingCategoryMargins[category] || parsed === null || !hasChanges}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingCategoryMargins[category] && (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      )}
                      {savingCategoryMargins[category] ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                );
              })}
              {filteredCategoryKeys.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  {t('admin.margins.noCategoriesMatching')}
                </div>
              )}
            </div>
          </div>
        </div>
        </PortalSection>

        <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-900">{t('admin.margins.manageClientMargins')}</h3>
            <div className="relative w-full max-w-[220px]">
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-2.5 text-base text-gray-400">
                search
              </span>
              <input
                type="text"
                value={clientWidgetSearch}
                onChange={(event) => onClientWidgetSearchChange(event.target.value)}
                placeholder={t('admin.margins.searchClientsPlaceholder')}
                aria-label={t('admin.margins.searchClientsPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-8 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
              />
            </div>
          </div>

          <div className="relative mb-4">
            <div className="flex items-center rounded-lg border border-gray-300 bg-white px-3">
              <span className="material-symbols-outlined text-base text-gray-400">search</span>
              <input
                type="text"
                value={marginClientSearchTerm}
                onChange={(event) => onMarginClientSearchTermChange(event.target.value)}
                placeholder={t('admin.margins.searchClient')}
                aria-label={t('admin.margins.searchClient')}
                className="w-full px-2 py-2 text-sm text-gray-900 outline-none"
              />
            </div>

            {marginClientSearchTerm.trim().length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {quickClientMatches.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => {
                      onOpenClientMarginModal(client);
                      onMarginClientSearchTermChange('');
                    }}
                    className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                  >
                    <span className="text-sm font-semibold text-gray-900">{client.companyName || client.name}</span>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {getClientMarginBadgeLabel(client)}
                    </span>
                  </button>
                ))}
                {quickClientMatches.length === 0 && (
                  <p className="px-3 py-3 text-sm text-gray-500">
                    {t('admin.margins.noClientsMatchingSearch', { term: marginClientSearchTerm })}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {clientList.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{client.companyName || client.name}</p>
                  <p className="truncate text-xs text-gray-500">{client.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {getClientMarginBadgeLabel(client)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenClientMarginModal(client)}
                    aria-label={t('admin.margins.setMargin')}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    {t('admin.margins.setMargin')}
                  </button>
                </div>
              </div>
            ))}
            {clientList.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-500">{t('admin.margins.noClientsFound')}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-900">{t('admin.margins.analytics.rfqMargin')}</h3>
            <div className="relative w-full max-w-[220px]">
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-2.5 text-base text-gray-400">
                search
              </span>
              <input
                type="text"
                value={rfqWidgetSearch}
                onChange={(event) => onRfqWidgetSearchChange(event.target.value)}
                placeholder={t('admin.margins.searchRfqsPlaceholder')}
                aria-label={t('admin.margins.searchRfqsPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-8 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
              />
            </div>
          </div>

          <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
            {filteredRfqs.map((rfq) => {
              const defaultMargin = systemConfig.defaultMarginPercent;
              const currentMargin = quotes.find((quote) => quote.rfqId === rfq.id)?.marginPercent ?? defaultMargin;

              return (
                <div key={rfq.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {t('admin.margins.analytics.rfq')}: #{rfq.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="truncate text-xs text-gray-500">{getRfqProductLabel(rfq)}</p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {t('admin.margins.orders')}: {quoteCountByRfqId[rfq.id] ?? 0}
                      </p>
                    </div>
                    <StatusBadge status={rfq.status.toLowerCase()} size="sm" />
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {t('admin.margins.margin')}: {currentMargin}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenRFQMarginModal(rfq.id, currentMargin)}
                      aria-label={t('admin.margins.setRFQMargin')}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                    >
                      {t('admin.margins.setRFQMargin')}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredRfqs.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-500">{t('admin.margins.noRfqsFound')}</p>
            )}
          </div>
        </div>
        </section>

        <PortalSection
          title={t('admin.margins.quoteManager')}
          subtitle={t('admin.margins.quoteManagerDesc')}
        >
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2">
            <span className="material-symbols-outlined pointer-events-none absolute left-2 top-2.5 text-base text-gray-400">
              search
            </span>
            <input
              type="text"
              value={quoteSearchTerm}
              onChange={(event) => setQuoteSearchTerm(event.target.value)}
              placeholder={t('admin.margins.quoteSearchPlaceholder')}
              aria-label={t('admin.margins.quoteSearchPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-8 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
            />
          </div>
          <select
            value={quoteStatusFilter}
            onChange={(event) => setQuoteStatusFilter(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
            aria-label={t('admin.margins.statusFilter')}
          >
            <option value="ALL">{t('common.all')} {t('common.status')}</option>
            <option value="PENDING_ADMIN">{t('status.pendingadmin')}</option>
            <option value="SENT_TO_CLIENT">{t('status.senttoclient')}</option>
            <option value="ACCEPTED">{t('status.accepted')}</option>
            <option value="REJECTED">{t('status.rejected')}</option>
          </select>
          <select
            value={quoteTypeFilter}
            onChange={(event) => setQuoteTypeFilter(event.target.value as 'ALL' | 'auto' | 'custom')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
            aria-label={t('admin.margins.typeFilter')}
          >
            <option value="ALL">{t('common.all')} {t('common.type')}</option>
            <option value="auto">{t('client.quotes.quoteTypeAuto')}</option>
            <option value="custom">{t('client.quotes.quoteTypeCustom')}</option>
          </select>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={manualOverridesOnly}
              onChange={(event) => setManualOverridesOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#0A2540] focus:ring-[#0A2540]/30"
            />
            {t('admin.margins.manualOverridesOnly')}
          </label>
          <span className="text-xs font-semibold text-gray-500">
            {t('admin.margins.showingQuotesCount', { shown: filteredQuotes.length, total: sortedQuotes.length, defaultValue: 'Showing {{shown}} of {{total}} quotes' })}
          </span>
        </div>

        <div className="space-y-3">
          {filteredQuotes.map((quote) => {
            const category = getQuoteCategory(quote);
            const effective = getEffectiveMarginData(quote, category);
            const currentMargin = clampMargin(effective.value);
            const supplierPrice = Number(quote.supplierPrice || 0);
            const finalPrice = supplierPrice * (1 + currentMargin / 100);
            const profit = finalPrice - supplierPrice;
            const rfq = rfqs.find((item) => item.id === quote.rfqId) || null;
            const supplier = usersById.get(quote.supplierId);
            const client = rfq ? usersById.get(rfq.clientId) : null;
            const quoteType = quote.type === 'auto' ? 'auto' : 'custom';

            return (
              <article
                key={quote.id}
                className={`rounded-xl border p-4 ${
                  effective.type === 'manual'
                    ? 'border-blue-200 bg-blue-50/40'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {t('admin.margins.quote')}: #{quote.id.slice(0, 8).toUpperCase()}
                      </p>
                      <StatusBadge status={quote.status.toLowerCase()} size="sm" />
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          quoteType === 'auto'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {quoteType === 'auto'
                          ? t('client.quotes.quoteTypeAuto')
                          : t('client.quotes.quoteTypeCustom')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {t('admin.margins.refRfq')}: #{quote.rfqId.slice(0, 8).toUpperCase()} |{' '}
                      {t('admin.margins.supplier')}: {supplier?.publicId || supplier?.companyName || t('common.notAvailable')} |{' '}
                      {t('admin.margins.client')}: {client?.publicId || client?.companyName || t('common.notAvailable')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t('admin.margins.categoryPrefix')} {t(`categories.${toCategoryTranslationKey(category)}.label`, toReadableCategory(category))}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t('admin.margins.source')}: {effective.source}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:min-w-[520px]">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-[11px] font-semibold uppercase text-gray-500">{t('admin.margins.costPrice')}</p>
                      <p className="mt-1 text-sm font-bold text-gray-900">
                        {t('common.currency')} {formatCurrencyValue(supplierPrice)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {t('admin.margins.lead')}: {quote.leadTime || t('common.notAvailable')}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-[11px] font-semibold uppercase text-gray-500">{t('admin.margins.margin')}</p>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onManualMarginChange(quote.id, clampMargin(currentMargin - 1))}
                          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          aria-label={t('admin.margins.margin')}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={currentMargin}
                          onChange={(event) =>
                            onManualMarginChange(quote.id, clampMargin(Number(event.target.value)))
                          }
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/10"
                          aria-label={t('admin.margins.margin')}
                        />
                        <button
                          type="button"
                          onClick={() => onManualMarginChange(quote.id, clampMargin(currentMargin + 1))}
                          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          aria-label={t('admin.margins.margin')}
                        >
                          +
                        </button>
                      </div>
                      {effective.type === 'manual' && (
                        <button
                          type="button"
                          onClick={() => onResetQuoteMargin(quote.id)}
                          className="mt-1 text-[11px] font-semibold text-blue-700 underline"
                        >
                          {t('admin.margins.resetToDefault')}
                        </button>
                      )}
                    </div>

                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-[11px] font-semibold uppercase text-emerald-700">
                        {t('admin.margins.finalClientPrice')}
                      </p>
                      <p className="mt-1 text-sm font-bold text-emerald-800">
                        {t('common.currency')} {formatCurrencyValue(finalPrice)}
                      </p>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[11px] font-semibold uppercase text-blue-700">{t('admin.margins.profit')}</p>
                      <p className="mt-1 text-sm font-bold text-blue-800">
                        {t('common.currency')} {formatCurrencyValue(profit)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSendQuoteToClient(quote.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0A2540] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#081a2c]"
                  >
                    <span className="material-symbols-outlined text-sm">send</span>
                    {t('admin.margins.sendToClient')}
                  </button>

                  {onRejectQuote && quote.status === 'PENDING_ADMIN' && (
                    <button
                      type="button"
                      onClick={() => onRejectQuote(quote.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
                    >
                      <span className="material-symbols-outlined text-sm">block</span>
                      {t('admin.margins.rejectQuote')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {filteredQuotes.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
              {t('admin.margins.noFilteredQuotes')}
            </div>
          )}
        </div>
        </PortalSection>
      </PortalPageShell>

      {clientMarginClient && (
        <ClientMarginModal
          isOpen={isClientMarginModalOpen}
          onClose={onCloseClientMarginModal}
          client={clientMarginClient}
          onSave={onSaveClientMargin}
          isLoading={isClientMarginSubmitting}
        />
      )}

      {selectedRFQForMargin && (
        <RFQMarginModal
          isOpen={isRFQMarginModalOpen}
          onClose={onCloseRFQMarginModal}
          rfq={selectedRFQForMargin}
          currentMargin={currentRFQMargin}
          onSave={onSaveRFQMargin}
          isLoading={isRFQMarginSubmitting}
        />
      )}
    </div>
  );
};
