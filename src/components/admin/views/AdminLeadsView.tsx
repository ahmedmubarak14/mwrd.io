import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { leadsService, Lead, LeadStatus } from '../../../services/leadsService';
import { useToast } from '../../../hooks/useToast';
import { logger } from '../../../utils/logger';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';
import { useStore } from '../../../store/useStore';

type LeadsViewMode = 'list' | 'kanban';

const LEADS_VIEW_STORAGE_PREFIX = 'mwrd-admin-leads-view';
const LEAD_STAGES: LeadStatus[] = ['NEW', 'CONTACTED', 'KYC', 'ONBOARDED', 'REJECTED'];

const getLeadStage = (status?: Lead['status']): LeadStatus => {
  const normalized = String(status || '').toUpperCase();
  switch (normalized) {
    case 'CONTACTED':
      return 'CONTACTED';
    case 'KYC':
      return 'KYC';
    case 'ONBOARDED':
    case 'CONVERTED':
      return 'ONBOARDED';
    case 'REJECTED':
      return 'REJECTED';
    case 'NEW':
    case 'PENDING':
    default:
      return 'NEW';
  }
};

const getStageClasses = (stage: LeadStatus) => {
  switch (stage) {
    case 'NEW':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CONTACTED':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'KYC':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ONBOARDED':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'REJECTED':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

export const AdminLeadsView: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const currentUserId = useStore((state) => state.currentUser?.id);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<LeadsViewMode>('list');

  useEffect(() => {
    if (!currentUserId) return;
    try {
      const storedPreference = localStorage.getItem(`${LEADS_VIEW_STORAGE_PREFIX}-${currentUserId}`);
      if (storedPreference === 'list' || storedPreference === 'kanban') {
        setViewMode(storedPreference);
      }
    } catch (error) {
      logger.warn('Failed to read admin leads view preference', error);
    }
  }, [currentUserId]);

  const persistViewMode = (nextMode: LeadsViewMode) => {
    setViewMode(nextMode);
    if (!currentUserId) return;
    try {
      localStorage.setItem(`${LEADS_VIEW_STORAGE_PREFIX}-${currentUserId}`, nextMode);
    } catch (error) {
      logger.warn('Failed to persist admin leads view preference', error);
    }
  };

  const loadLeads = async () => {
    try {
      const data = await leadsService.getLeads();
      setLeads(data);
    } catch (error) {
      logger.error('Failed to load leads', error);
      toast.error(t('admin.leads.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    await leadsService.updateLeadStatus(id, status);
    loadLeads();
    toast.success(t('admin.leads.statusUpdated'));
  };

  const leadsByStage = useMemo(() => {
    return leads.reduce<Record<LeadStatus, Lead[]>>((accumulator, lead) => {
      const stage = getLeadStage(lead.status);
      accumulator[stage].push(lead);
      return accumulator;
    }, {
      NEW: [],
      CONTACTED: [],
      KYC: [],
      ONBOARDED: [],
      REJECTED: []
    });
  }, [leads]);

  const getStageLabel = (stage: LeadStatus) => {
    switch (stage) {
      case 'NEW':
        return t('admin.leads.new');
      case 'CONTACTED':
        return t('admin.leads.contacted');
      case 'KYC':
        return t('admin.leads.kyc');
      case 'ONBOARDED':
        return t('admin.leads.onboarded');
      case 'REJECTED':
        return t('admin.leads.rejected');
      default:
        return stage;
    }
  };

  const renderStatusSelect = (lead: Lead, compact = false) => {
    const value = getLeadStage(lead.status);
    return (
      <select
        value={value}
        onChange={(e) => {
          if (!lead.id) return;
          handleStatusChange(lead.id, e.target.value as LeadStatus);
        }}
        className={`border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none ${compact ? 'w-full' : ''}`}
      >
        <option value="NEW">{t('admin.leads.new')}</option>
        <option value="CONTACTED">{t('admin.leads.contacted')}</option>
        <option value="KYC">{t('admin.leads.kyc')}</option>
        <option value="ONBOARDED">{t('admin.leads.onboarded')}</option>
        <option value="REJECTED">{t('admin.leads.rejected')}</option>
      </select>
    );
  };

  const renderStageBadge = (status?: Lead['status']) => {
    const stage = getLeadStage(status);
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStageClasses(stage)}`}>
        {getStageLabel(stage)}
      </span>
    );
  };

  return (
    <div data-testid="admin-leads-view">
      <PortalPageShell className="animate-in fade-in duration-300">
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal')}
          title={t('sidebar.leads') || 'Leads & Signups'}
          subtitle={t('admin.leads.subtitle')}
          actions={(
            <div className="inline-flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
                <button
                  onClick={() => persistViewMode('list')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {t('admin.leads.viewList')}
                </button>
                <button
                  onClick={() => persistViewMode('kanban')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {t('admin.leads.viewKanban')}
                </button>
              </div>
              <button
                onClick={loadLeads}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                aria-label={t('common.refresh')}
              >
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
          )}
        />

        {viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.date')}</th>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.name')}</th>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.company')}</th>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.contact')}</th>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.type')}</th>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.status')}</th>
                    <th className="px-6 py-4 font-semibold text-gray-500">{t('admin.leads.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {leads.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        {t('admin.leads.noLeadsFound')}
                      </td>
                    </tr>
                  )}
                  {leads.map((lead) => (
                    <tr key={lead.id || `${lead.email}-${lead.created_at}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {new Date(lead.created_at || '').toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{lead.name}</td>
                      <td className="px-6 py-4 text-gray-600">{lead.company_name}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col text-xs text-gray-500">
                          <span>{lead.email}</span>
                          <span>{lead.phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium uppercase ${lead.account_type === 'supplier' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                          {lead.account_type === 'supplier'
                            ? t('admin.leads.typeSupplier')
                            : t('admin.leads.typeClient')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {renderStageBadge(lead.status)}
                      </td>
                      <td className="px-6 py-4">
                        {renderStatusSelect(lead)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {LEAD_STAGES.map((stage) => {
              const stageLeads = leadsByStage[stage];
              return (
                <div key={stage} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">{getStageLabel(stage)}</h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="max-h-[64vh] space-y-3 overflow-y-auto p-3">
                    {stageLeads.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                        {t('admin.leads.noLeadsFound')}
                      </div>
                    )}
                    {stageLeads.map((lead) => (
                      <article key={lead.id || `${lead.email}-${lead.created_at}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900">{lead.company_name || t('admin.leads.unknownCompany')}</p>
                          <p className="text-xs text-gray-600">{lead.name}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase ${lead.account_type === 'supplier' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {lead.account_type === 'supplier' ? t('admin.leads.typeSupplier') : t('admin.leads.typeClient')}
                          </span>
                          {renderStageBadge(lead.status)}
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                          {t('admin.leads.submissionDate')}: {new Date(lead.created_at || '').toLocaleDateString()}
                        </p>
                        <div className="mt-3">
                          {renderStatusSelect(lead, true)}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PortalPageShell>
    </div>
  );
};
