import React from 'react';
import { AdminPOVerification } from '../AdminPOVerification';
import { useTranslation } from 'react-i18next';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

export const AdminPOVerificationView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div data-testid="admin-po-verification-view">
      <PortalPageShell>
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal', 'Admin Portal')}
          title={t('sidebar.poVerification', 'PO Verification')}
          subtitle={t('admin.po.description', 'Review and confirm client purchase orders before supplier release')}
        />
        <AdminPOVerification />
      </PortalPageShell>
    </div>
  );
};
