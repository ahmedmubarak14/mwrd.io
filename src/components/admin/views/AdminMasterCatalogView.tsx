import React from 'react';
import { useTranslation } from 'react-i18next';
import MasterProductManagement from '../MasterProductManagement';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

export const AdminMasterCatalogView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div data-testid="admin-master-catalog-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.masterCatalog')}
          subtitle={t('admin.masterCatalog.subtitle')}
        />
        <MasterProductManagement />
      </PortalPageShell>
    </div>
  );
};
