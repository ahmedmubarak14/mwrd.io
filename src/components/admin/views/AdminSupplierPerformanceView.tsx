import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Product, Quote, User, UserRole } from '../../../types/types';
import {
  PortalMetricCard,
  PortalPageHeader,
  PortalPageShell,
  PortalSection,
} from '../../ui/PortalDashboardShell';

type DateRangeFilter = 'ALL' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_YEAR';

interface AdminSupplierPerformanceViewProps {
  users: User[];
  quotes: Quote[];
  orders: Order[];
  products: Product[];
}

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const matchesDateFilter = (value: string | undefined, filter: DateRangeFilter) => {
  if (filter === 'ALL') return true;
  const date = parseDate(value);
  if (!date) return false;

  const now = new Date();
  if (filter === 'THIS_YEAR') {
    return date.getFullYear() === now.getFullYear();
  }

  const days = filter === 'LAST_30_DAYS' ? 30 : 90;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
};

const quoteCreatedAt = (quote: Quote) => {
  const quoteWithDate = quote as Quote & { createdAt?: string; created_at?: string };
  return quoteWithDate.createdAt || quoteWithDate.created_at;
};

const orderDate = (order: Order) => order.createdAt || order.updatedAt || order.date;

export const AdminSupplierPerformanceView: React.FC<AdminSupplierPerformanceViewProps> = ({
  users,
  quotes,
  orders,
  products,
}) => {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRangeFilter>('ALL');
  const [minRating, setMinRating] = useState('0');
  const [category, setCategory] = useState('ALL');

  const supplierUsers = useMemo(
    () => users.filter((user) => user.role === UserRole.SUPPLIER),
    [users]
  );

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(),
    [products]
  );

  const minRatingValue = Number(minRating) || 0;

  const rows = useMemo(() => {
    return supplierUsers
      .map((supplier) => {
        const supplierQuotes = quotes.filter(
          (quote) => quote.supplierId === supplier.id && matchesDateFilter(quoteCreatedAt(quote), dateRange)
        );
        const supplierAcceptedQuotes = supplierQuotes.filter((quote) => quote.status === 'ACCEPTED');
        const supplierOrders = orders.filter(
          (order) => order.supplierId === supplier.id && matchesDateFilter(orderDate(order), dateRange)
        );
        const supplierCategories = new Set(
          products.filter((product) => product.supplierId === supplier.id).map((product) => product.category)
        );

        const quotesSubmitted = supplierQuotes.length;
        const quotesAccepted = supplierAcceptedQuotes.length;
        const winRate = quotesSubmitted > 0 ? (quotesAccepted / quotesSubmitted) * 100 : 0;
        const rating = Number(supplier.rating || 0);

        return {
          supplier,
          quotesSubmitted,
          quotesAccepted,
          winRate,
          avgRating: rating,
          totalOrders: supplierOrders.length,
          avgResponseTime: t('common.notAvailable'),
          categoryMatch: category === 'ALL' || supplierCategories.has(category),
        };
      })
      .filter((row) => row.avgRating >= minRatingValue && row.categoryMatch)
      .sort((a, b) => b.winRate - a.winRate);
  }, [supplierUsers, quotes, orders, products, dateRange, minRatingValue, category]);

  const summary = useMemo(() => {
    if (rows.length === 0) {
      return {
        supplierCount: 0,
        avgWinRate: 0,
        avgRating: 0,
      };
    }
    const avgWinRate = rows.reduce((sum, row) => sum + row.winRate, 0) / rows.length;
    const avgRating = rows.reduce((sum, row) => sum + row.avgRating, 0) / rows.length;
    return {
      supplierCount: rows.length,
      avgWinRate,
      avgRating,
    };
  }, [rows]);

  return (
    <div data-testid="admin-supplier-performance-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('admin.supplierPerformance.title')}
          subtitle={t('admin.supplierPerformance.subtitle')}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PortalMetricCard
            tone="primary"
            icon="storefront"
            label={t('admin.supplierPerformance.title')}
            value={summary.supplierCount}
            hint={t('admin.supplierPerformance.companyName')}
          />
          <PortalMetricCard
            tone="info"
            icon="insights"
            label={t('admin.supplierPerformance.winRate')}
            value={`${summary.avgWinRate.toFixed(1)}%`}
            hint={t('admin.supplierPerformance.quotesAccepted')}
          />
          <PortalMetricCard
            tone="success"
            icon="star"
            label={t('admin.supplierPerformance.avgRating')}
            value={summary.avgRating.toFixed(1)}
            hint={t('admin.supplierPerformance.minRating')}
          />
        </div>

        <PortalSection bodyClassName="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as DateRangeFilter)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540]"
              aria-label={t('admin.supplierPerformance.dateRange')}
            >
              <option value="ALL">{t('admin.supplierPerformance.allDates')}</option>
              <option value="LAST_30_DAYS">{t('admin.supplierPerformance.last30Days')}</option>
              <option value="LAST_90_DAYS">{t('admin.supplierPerformance.last90Days')}</option>
              <option value="THIS_YEAR">{t('admin.supplierPerformance.thisYear')}</option>
            </select>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">{t('admin.supplierPerformance.minRating')}</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={minRating}
                onChange={(event) => setMinRating(event.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540]"
                aria-label={t('admin.supplierPerformance.minRating')}
              />
            </div>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540]"
              aria-label={t('admin.supplierPerformance.category')}
            >
              <option value="ALL">{t('admin.supplierPerformance.allCategories')}</option>
              {categories.map((categoryOption) => (
                <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.supplierId')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.companyName')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.quotesSubmitted')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.quotesAccepted')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.winRate')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.avgRating')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.totalOrders')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.supplierPerformance.avgResponseTime')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.supplier.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{row.supplier.publicId || row.supplier.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{row.supplier.companyName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.quotesSubmitted}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.quotesAccepted}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{row.winRate.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.avgRating.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.totalOrders}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{row.avgResponseTime}</td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                      {t('admin.supplierPerformance.noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </PortalSection>
      </PortalPageShell>
    </div>
  );
};
