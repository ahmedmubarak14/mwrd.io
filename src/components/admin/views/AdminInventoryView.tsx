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
          portalLabel={t('sidebar.adminPortal', 'Admin Portal')}
          title={t('sidebar.inventory', 'Inventory')}
          subtitle={t('admin.inventory.subtitle', 'Monitor inventory and stock movement across suppliers')}
        />
        <InventoryDashboard />
      </PortalPageShell>
    </div>
  );
};
