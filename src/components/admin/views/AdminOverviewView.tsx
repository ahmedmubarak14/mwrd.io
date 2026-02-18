import React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchBar } from '../../ui/SearchBar';
import {
  PortalPageHeader,
  PortalPageShell,
  PortalSection
} from '../../ui/PortalDashboardShell';
import type { DashboardStats } from '../../../services/dashboardService';

interface PendingAction {
  type: string;
  desc: string;
  tab: string;
}

interface RecentOrderRow {
  id: string;
  client: string;
  status: string;
  value: string;
  date: string;
}

interface ReadyForPickupRow {
  id: string;
  supplierName: string;
}

interface CategoryRevenue {
  category: string;
  revenue: number;
  percentage: number;
}

interface TopProduct {
  id: string;
  name: string;
  sold: number;
  revenue: number;
}

interface AdminOverviewViewProps {
  overviewRangeDays: number;
  onSetOverviewLast30Days: () => void;
  onSetOverviewCustomRange: () => void;
  onOpenAdminNotifications: () => void;
  onOverviewAction: (tab: string) => void;
  onExportOrdersCsv: () => void;
  dashboardStats: DashboardStats | null;
  currentTotalSales: number;
  currentAverageMargin: number;
  currentTotalOrders: number;
  salesDelta: number;
  marginDelta: number;
  ordersDelta: number;
  moneyFormatter: Intl.NumberFormat;
  integerFormatter: Intl.NumberFormat;
  trendClassName: (value: number) => string;
  trendIcon: (value: number) => string;
  formatDelta: (value: number) => string;
  salesChartRef: React.RefObject<HTMLCanvasElement | null>;
  marginChartRef: React.RefObject<HTMLCanvasElement | null>;
  ordersChartRef: React.RefObject<HTMLCanvasElement | null>;
  revenueChartRef: React.RefObject<HTMLCanvasElement | null>;
  visiblePendingActions: PendingAction[];
  recentOrders: RecentOrderRow[];
  readyForPickupOrders: ReadyForPickupRow[];
  categoryRevenue: CategoryRevenue[];
  topProducts: TopProduct[];
  onOpenReadyForPickupOrder: (orderId: string) => void;
  orderStatusBadgeClasses: Record<string, string>;
  renderAdminOverlay: () => React.ReactNode;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({
  overviewRangeDays,
  onSetOverviewLast30Days,
  onSetOverviewCustomRange,
  onOpenAdminNotifications,
  onOverviewAction,
  onExportOrdersCsv,
  dashboardStats,
  currentTotalSales,
  currentAverageMargin,
  currentTotalOrders,
  salesDelta,
  marginDelta,
  ordersDelta,
  moneyFormatter,
  integerFormatter,
  trendClassName,
  trendIcon,
  formatDelta,
  salesChartRef,
  marginChartRef,
  ordersChartRef,
  revenueChartRef,
  visiblePendingActions,
  recentOrders,
  readyForPickupOrders,
  categoryRevenue,
  topProducts,
  onOpenReadyForPickupOrder,
  orderStatusBadgeClasses,
  renderAdminOverlay,
}) => {
  const { t } = useTranslation();
  const commandCenterActions = [
    {
      tab: 'users',
      icon: 'group',
      title: t('sidebar.users') || 'Users',
      description: t('admin.overview.quickUsersDesc'),
    },
    {
      tab: 'approvals',
      icon: 'verified_user',
      title: t('sidebar.approvalsLink') || 'Approvals',
      description: t('admin.overview.quickApprovalsDesc'),
    },
    {
      tab: 'margins',
      icon: 'currency_exchange',
      title: t('sidebar.margins') || 'Margins',
      description: t('admin.overview.quickMarginsDesc'),
    },
    {
      tab: 'orders',
      icon: 'receipt_long',
      title: t('sidebar.orders') || 'Orders',
      description: t('admin.overview.quickOrdersDesc'),
    },
    {
      tab: 'po-verification',
      icon: 'fact_check',
      title: t('sidebar.poVerification') || 'PO Verification',
      description: t('admin.overview.quickPOVerificationDesc'),
    },
    {
      tab: 'supplier-performance',
      icon: 'insights',
      title: t('sidebar.supplierPerformance'),
      description: t('admin.overview.quickSupplierPerformanceDesc'),
    },
    {
      tab: 'credit-utilization',
      icon: 'account_balance',
      title: t('sidebar.creditUtilization'),
      description: t('admin.overview.quickCreditUtilizationDesc'),
    },
    {
      tab: 'categories',
      icon: 'category',
      title: t('sidebar.categories'),
      description: t('admin.overview.quickCategoriesDesc'),
    },
  ];

  return (
    <div data-testid="admin-overview-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('admin.overview.title')}
          subtitle={t('admin.overview.commandCenterDesc')}
          actions={(
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="w-full sm:w-64">
                <SearchBar
                  placeholder={t('admin.overview.searchPlaceholder')}
                  size="md"
                />
              </div>
              <button
                onClick={onSetOverviewLast30Days}
                className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-white border border-gray-300 px-3 hover:bg-neutral-50"
              >
                <p className="text-neutral-800 text-sm font-medium leading-normal">
                  {overviewRangeDays === 30
                    ? (t('admin.overview.last30Days') || 'Last 30 Days')
                    : `${overviewRangeDays} ${t('common.days') || 'days'}`}
                </p>
                <span className="material-symbols-outlined text-neutral-800 text-base">expand_more</span>
              </button>
              <button
                onClick={onSetOverviewCustomRange}
                className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-white border border-gray-300 px-3 hover:bg-neutral-50"
              >
                <p className="text-neutral-800 text-sm font-medium leading-normal">{t('admin.overview.customRange')}</p>
                <span className="material-symbols-outlined text-neutral-800 text-base">expand_more</span>
              </button>
              <button
                onClick={onExportOrdersCsv}
                className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 px-3 transition-colors border border-green-200"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <p className="text-sm font-bold leading-normal">{t('admin.overview.exportCsv')}</p>
              </button>
              <button
                onClick={onOpenAdminNotifications}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-neutral-800 hover:bg-neutral-50 transition-colors"
              >
                <span className="material-symbols-outlined text-base">notifications</span>
              </button>
            </div>
          )}
        />

        <div className="flex flex-col gap-6">

          <PortalSection
            title={t('admin.overview.commandCenter')}
            subtitle={t('admin.overview.commandCenterDesc')}
            action={<span className="text-xs text-slate-500">{commandCenterActions.length}</span>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {commandCenterActions.map((action) => (
                <button
                  key={action.tab}
                  data-testid={`admin-overview-quick-${action.tab}`}
                  onClick={() => onOverviewAction(action.tab)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:border-primary hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-slate-700">{action.icon}</span>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{action.description}</p>
                </button>
              ))}
            </div>
          </PortalSection>

          <PortalSection
            title={t('admin.overview.readyForPickupTitle')}
            subtitle={t('admin.overview.readyForPickupSubtitle')}
            className="border-orange-200 bg-orange-50"
            action={(
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white border border-orange-200">
                <span className="text-xl font-black text-orange-700">{readyForPickupOrders.length}</span>
              </div>
            )}
          >
            <div className="space-y-2">
              {readyForPickupOrders.length === 0 ? (
                <p className="text-sm text-orange-700">{t('admin.overview.readyForPickupEmpty')}</p>
              ) : (
                readyForPickupOrders.slice(0, 5).map((order) => (
                  <button
                    key={order.id}
                    onClick={() => onOpenReadyForPickupOrder(order.id)}
                    className="w-full flex items-center justify-between rounded-lg bg-white border border-orange-100 px-3 py-2 hover:border-orange-300 transition-colors text-left"
                  >
                    <span className="text-sm font-semibold text-orange-900">{order.id}</span>
                    <span className="text-xs text-orange-700">{order.supplierName}</span>
                  </button>
                ))
              )}
            </div>
          </PortalSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600 dark:text-neutral-200 text-sm font-medium leading-normal">{t('admin.overview.totalSales')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-neutral-800 dark:text-white tracking-tight text-3xl font-bold leading-tight">
                    {dashboardStats ? moneyFormatter.format(dashboardStats.totalSales) : moneyFormatter.format(currentTotalSales)}
                  </p>
                  {!dashboardStats && (
                    <p className={`${trendClassName(salesDelta)} text-sm font-medium leading-normal flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-base">{trendIcon(salesDelta)}</span>
                      <span>{formatDelta(salesDelta)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="h-24 -mx-6 -mb-6"><canvas ref={salesChartRef}></canvas></div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600 dark:text-neutral-200 text-sm font-medium leading-normal">{t('admin.overview.averageMargin')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-neutral-800 dark:text-white tracking-tight text-3xl font-bold leading-tight">
                    {dashboardStats ? dashboardStats.averageMargin.toFixed(1) : currentAverageMargin.toFixed(1)}%
                  </p>
                  {!dashboardStats && (
                    <p className={`${trendClassName(marginDelta)} text-sm font-medium leading-normal flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-base">{trendIcon(marginDelta)}</span>
                      <span>{formatDelta(marginDelta)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="h-24 -mx-6 -mb-6"><canvas ref={marginChartRef}></canvas></div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600 dark:text-neutral-200 text-sm font-medium leading-normal">{t('admin.overview.totalOrders')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-neutral-800 dark:text-white tracking-tight text-3xl font-bold leading-tight">
                    {dashboardStats ? integerFormatter.format(dashboardStats.totalOrders) : integerFormatter.format(currentTotalOrders)}
                  </p>
                  {!dashboardStats && (
                    <p className={`${trendClassName(ordersDelta)} text-sm font-medium leading-normal flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-base">{trendIcon(ordersDelta)}</span>
                      <span>{formatDelta(ordersDelta)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="h-24 -mx-6 -mb-6"><canvas ref={ordersChartRef}></canvas></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <div className="flex justify-between items-center">
                <h3 className="text-neutral-800 dark:text-white text-lg font-bold">{t('admin.overview.revenueBreakdown')}</h3>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-chart-blue"></div>
                    <span className="text-neutral-600 dark:text-neutral-200">{t('admin.overview.sales')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-chart-green"></div>
                    <span className="text-neutral-600 dark:text-neutral-200">{t('admin.overview.margin')}</span>
                  </div>
                </div>
              </div>
              <div className="h-80"><canvas ref={revenueChartRef}></canvas></div>
            </div>

            <div className="flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <h3 className="text-neutral-800 dark:text-white text-lg font-bold">{t('admin.overview.pendingActions')}</h3>
              <div className="flex flex-col gap-2">
                {visiblePendingActions.map((action, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-lg hover:bg-neutral-100/50 dark:hover:bg-neutral-600/20 transition-colors">
                    <div className="flex flex-col">
                      <p className="text-xs text-neutral-600 dark:text-neutral-200">{action.type}</p>
                      <p className="text-sm font-medium text-neutral-800 dark:text-white">{action.desc}</p>
                    </div>
                    <button
                      data-testid={`admin-overview-pending-action-${i}`}
                      onClick={() => onOverviewAction(action.tab)}
                      className="text-primary text-sm font-bold hover:underline"
                    >
                      {t('admin.overview.view')}
                    </button>
                  </div>
                ))}
                {visiblePendingActions.length === 0 && (
                  <div className="p-3 text-sm text-neutral-500 dark:text-neutral-200">
                    {t('admin.approvals.allCaughtUp') || 'All caught up'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Profitability Analytics Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by Category */}
            <div className="flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <h3 className="text-neutral-800 dark:text-white text-lg font-bold">{t('admin.overview.revenueByCategory')}</h3>
              <div className="space-y-4">
                {categoryRevenue.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-300">
                    {t('admin.overview.noRevenueData')}
                  </p>
                ) : (
                  categoryRevenue.map((item) => (
                    <div key={item.category} className="space-y-1">
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-neutral-700 dark:text-neutral-300">{item.category}</span>
                        <span className="text-neutral-900 dark:text-white">{moneyFormatter.format(item.revenue)} ({item.percentage}%)</span>
                      </div>
                      <div className="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${item.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top Selling Products */}
            <div className="flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50">
              <h3 className="text-neutral-800 dark:text-white text-lg font-bold">{t('admin.overview.topSellingProducts')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-neutral-500 uppercase border-b border-neutral-100 dark:border-neutral-700">
                    <tr>
                      <th className="py-2">{t('common.product')}</th>
                      <th className="py-2 text-right">{t('admin.overview.sold')}</th>
                      <th className="py-2 text-right">{t('admin.overview.revenue')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-800 dark:text-white divide-y divide-neutral-100 dark:divide-neutral-700">
                    {topProducts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-300">
                          {t('admin.overview.noProductData')}
                        </td>
                      </tr>
                    ) : (
                      topProducts.map((product) => (
                        <tr key={product.id}>
                          <td className="py-3 font-medium">{product.name}</td>
                          <td className="py-3 text-right">{product.sold}</td>
                          <td className="py-3 text-right">{moneyFormatter.format(product.revenue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600/50 overflow-hidden">
            <h3 className="text-neutral-800 dark:text-white text-lg font-bold p-6 pb-2">{t('admin.overview.recentOrders')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-600 dark:text-neutral-200 uppercase bg-neutral-100/50 dark:bg-neutral-600/20">
                  <tr>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.orderId')}</th>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.client')}</th>
                    <th className="px-6 py-3" scope="col">{t('common.status')}</th>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.value')}</th>
                    <th className="px-6 py-3" scope="col">{t('admin.overview.date')}</th>
                  </tr>
                </thead>
                <tbody className="text-neutral-800 dark:text-white">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 dark:border-neutral-600/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                      <td className="px-6 py-4 font-medium">{order.id}</td>
                      <td className="px-6 py-4">{order.client}</td>
                      <td className="px-6 py-4">
                        <span className={`${orderStatusBadgeClasses[order.status] || 'bg-slate-100 dark:bg-slate-900/40 text-slate-800 dark:text-slate-300'} text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full`}>
                          {t(`status.${order.status.toLowerCase()}`, order.status.replace(/_/g, ' '))}
                        </span>
                      </td>
                      <td className="px-6 py-4">{order.value}</td>
                      <td className="px-6 py-4 text-neutral-600 dark:text-neutral-200">{order.date}</td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-neutral-500 dark:text-neutral-200">
                        {t('admin.overview.noOrders')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PortalPageShell>
      {renderAdminOverlay()}
    </div>
  );
};
