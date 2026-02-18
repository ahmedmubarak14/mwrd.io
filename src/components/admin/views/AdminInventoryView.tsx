import React from 'react';
import { InventoryDashboard } from '../InventoryDashboard';
import { useTranslation } from 'react-i18next';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

export const AdminInventoryView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div data-testid="admin-inventory-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.inventory')}
          subtitle={t('admin.inventory.subtitle')}
        />
        <InventoryDashboard />
      </PortalPageShell>
    </div>
  );
};
