import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, User, UserRole } from '../../../types/types';
import { api } from '../../../services/api';
import { logger } from '../../../utils/logger';
import {
  PortalMetricCard,
  PortalPageHeader,
  PortalPageShell,
  PortalSection,
} from '../../ui/PortalDashboardShell';

interface AdminCreditUtilizationViewProps {
  users: User[];
  orders: Order[];
}

const orderDate = (order: Order) => order.createdAt || order.updatedAt || order.date;

export const AdminCreditUtilizationView: React.FC<AdminCreditUtilizationViewProps> = ({ users, orders }) => {
  const { t, i18n } = useTranslation();
  const [fallbackUsers, setFallbackUsers] = useState<User[]>([]);

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
        logger.error('Failed to load fallback users for credit utilization', error);
      }
    };

    void loadFallbackUsers();
    return () => {
      isActive = false;
    };
  }, [users]);

  const effectiveUsers = users.length > 0 ? users : fallbackUsers;

  const currency = useMemo(() => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-SA' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }), [i18n.language]);

  const clientRows = useMemo(() => {
    return effectiveUsers
      .filter((user) => user.role === UserRole.CLIENT)
      .map((client) => {
        const creditLimit = Math.max(Number(client.creditLimit || 0), 0);
        const creditUsed = Math.max(Number(client.creditUsed || 0), 0);
        const available = Math.max(creditLimit - creditUsed, 0);
        const utilization = creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0;

        const overduePayments = orders.some((order) => {
          if (order.clientId !== client.id) return false;
          if (!(order.status === 'PENDING_PAYMENT' || order.status === 'AWAITING_CONFIRMATION')) return false;
          const parsedDate = new Date(orderDate(order));
          if (Number.isNaN(parsedDate.getTime())) return false;
          const threshold = new Date();
          threshold.setDate(threshold.getDate() - 30);
          return parsedDate <= threshold;
        });

        return {
          client,
          creditLimit,
          creditUsed,
          available,
          utilization,
          overduePayments,
        };
      })
      .sort((a, b) => b.utilization - a.utilization);
  }, [effectiveUsers, orders]);

  const summary = useMemo(() => {
    const totalCreditExtended = clientRows.reduce((sum, row) => sum + row.creditLimit, 0);
    const totalUsed = clientRows.reduce((sum, row) => sum + row.creditUsed, 0);
    const totalAvailable = Math.max(totalCreditExtended - totalUsed, 0);
    const utilization = totalCreditExtended > 0 ? (totalUsed / totalCreditExtended) * 100 : 0;

    return {
      totalCreditExtended,
      totalUsed,
      totalAvailable,
      utilization,
    };
  }, [clientRows]);

  const getUtilizationClass = (utilization: number) => {
    if (utilization < 50) return 'bg-green-100 text-green-800';
    if (utilization <= 80) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div data-testid="admin-credit-utilization-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('admin.creditUtilization.title')}
          subtitle={t('admin.creditUtilization.subtitle')}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <PortalMetricCard
            tone="primary"
            icon="account_balance"
            label={t('admin.creditUtilization.totalCreditExtended')}
            value={currency.format(summary.totalCreditExtended)}
          />
          <PortalMetricCard
            tone="warning"
            icon="credit_score"
            label={t('admin.creditUtilization.totalUsed')}
            value={currency.format(summary.totalUsed)}
          />
          <PortalMetricCard
            tone="success"
            icon="savings"
            label={t('admin.creditUtilization.totalAvailable')}
            value={currency.format(summary.totalAvailable)}
          />
          <PortalMetricCard
            tone="info"
            icon="percent"
            label={t('admin.creditUtilization.utilization')}
            value={`${summary.utilization.toFixed(1)}%`}
          />
        </div>

        <PortalSection>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.clientId')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.company')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.creditLimit')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.used')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.available')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.utilization')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.creditUtilization.status')}</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((row) => (
                  <tr key={row.client.id} className={`border-b border-gray-100 hover:bg-gray-50 ${row.overduePayments ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-800">{row.client.publicId || row.client.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{row.client.companyName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{currency.format(row.creditLimit)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{currency.format(row.creditUsed)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{currency.format(row.available)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getUtilizationClass(row.utilization)}`}>
                        {row.utilization.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.overduePayments ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {t('admin.creditUtilization.overdue')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {t('admin.creditUtilization.current')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {clientRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      {t('admin.creditUtilization.noClients')}
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
