import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { useToast } from '../../../hooks/useToast';
import { PortalPageHeader, PortalPageShell } from '../../ui/PortalDashboardShell';

// The 20 notification event types seeded in notification_templates
const NOTIFICATION_EVENT_TYPES = [
  { key: 'account_created', icon: 'person_add', category: 'account' },
  { key: 'account_approved', icon: 'verified', category: 'account' },
  { key: 'account_suspended', icon: 'block', category: 'account' },
  { key: 'kyc_submitted', icon: 'badge', category: 'account' },
  { key: 'kyc_verified', icon: 'how_to_reg', category: 'account' },
  { key: 'product_submitted', icon: 'inventory_2', category: 'product' },
  { key: 'product_approved', icon: 'check_circle', category: 'product' },
  { key: 'product_rejected', icon: 'cancel', category: 'product' },
  { key: 'rfq_submitted', icon: 'request_quote', category: 'rfq' },
  { key: 'rfq_quoted', icon: 'receipt_long', category: 'rfq' },
  { key: 'rfq_expired', icon: 'timer_off', category: 'rfq' },
  { key: 'quote_received', icon: 'mark_email_read', category: 'quote' },
  { key: 'quote_approved', icon: 'thumb_up', category: 'quote' },
  { key: 'quote_accepted', icon: 'handshake', category: 'quote' },
  { key: 'quote_rejected', icon: 'thumb_down', category: 'quote' },
  { key: 'order_created', icon: 'shopping_cart', category: 'order' },
  { key: 'order_confirmed', icon: 'task_alt', category: 'order' },
  { key: 'order_shipped', icon: 'local_shipping', category: 'order' },
  { key: 'order_delivered', icon: 'package', category: 'order' },
  { key: 'payment_received', icon: 'payments', category: 'payment' },
] as const;

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  account: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  product: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
  rfq: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  quote: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
  order: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
  payment: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
};

const NotificationEventMatrix: React.FC = () => {
  const { t } = useTranslation();
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const unique = Array.from(new Set(NOTIFICATION_EVENT_TYPES.map(e => e.category)));
    return unique;
  }, []);

  const filteredEvents = useMemo(() => {
    if (filterCategory === 'all') return NOTIFICATION_EVENT_TYPES;
    return NOTIFICATION_EVENT_TYPES.filter(e => e.category === filterCategory);
  }, [filterCategory]);

  return (
    <div className="space-y-4">
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
            filterCategory === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
          }`}
        >
          {t('common.all', 'All')} ({NOTIFICATION_EVENT_TYPES.length})
        </button>
        {categories.map(cat => {
          const count = NOTIFICATION_EVENT_TYPES.filter(e => e.category === cat).length;
          const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.account;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                filterCategory === cat
                  ? `${colors.bg} ${colors.text} ${colors.border}`
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {t(`admin.settings.notifCategory.${cat}`, cat.charAt(0).toUpperCase() + cat.slice(1))} ({count})
            </button>
          );
        })}
      </div>

      {/* Events list */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {filteredEvents.map(event => {
          const colors = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.account;
          return (
            <div
              key={event.key}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
            >
              <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
                <span className="material-symbols-outlined text-lg">{event.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {String(t(`admin.settings.notifEvent.${event.key}`, event.key.replace(/_/g, ' ')))}
                </p>
                <p className="text-xs text-gray-400">
                  {String(t(`admin.settings.notifEventDesc.${event.key}`, `Triggered when ${event.key.replace(/_/g, ' ')} event occurs`))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${colors.bg} ${colors.text}`}>
                  {String(t(`admin.settings.notifCategory.${event.category}`, event.category))}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-50 text-green-600">
                  <span className="material-symbols-outlined text-xs">check_circle</span>
                  {t('admin.settings.notifActive', 'Active')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        {t('admin.settings.notifReadOnlyHint', 'Notification templates are managed via the database. This view is read-only.')}
      </p>
    </div>
  );
};

export const AdminSettingsView: React.FC = () => {
  const { t } = useTranslation();
  const { systemConfig, updateSystemConfig, triggerAutoQuoteCheck } = useStore();
  const [localConfig, setLocalConfig] = useState(systemConfig);
  const toast = useToast();
  const [isRunningAutoQuote, setIsRunningAutoQuote] = useState(false);

  useEffect(() => {
    setLocalConfig(systemConfig);
  }, [systemConfig]);

  const handleSave = async () => {
    try {
      const success = await updateSystemConfig(localConfig);
      if (success) {
        toast.success(t('admin.settings.saved', 'Settings Saved'));
        return;
      }
      toast.error(t('admin.settings.saveFailed', 'Failed to save settings.'));
    } catch {
      toast.error(t('admin.settings.saveFailed', 'Failed to save settings.'));
    }
  };

  return (
    <div data-testid="admin-settings-view">
      <PortalPageShell className="animate-in fade-in duration-300">
        <PortalPageHeader
          portalLabel={t('sidebar.adminPortal', 'Admin Portal')}
          title={t('admin.settings.title', 'Platform Settings')}
          subtitle={t('admin.settings.subtitle', 'Configure system-wide parameters and automation rules')}
          actions={(
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-blue-500/20"
            >
              {t('common.saveChanges', 'Save Changes')}
            </button>
          )}
        />

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <span className="material-symbols-outlined text-2xl">bolt</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('admin.settings.autoQuote', 'Auto-Quote System')}</h3>
              <p className="text-sm text-gray-400">{t('admin.settings.autoQuoteDesc', 'Automated pricing for expired RFQs')}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Auto-Quote Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex-1">
                <label className="block text-sm font-bold text-gray-700">
                  {t('admin.settings.autoQuoteEnabled', 'Enable Auto-Quote')}
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  {t('admin.settings.autoQuoteEnabledDesc', 'When enabled, the system will automatically generate quotes for RFQs that receive no supplier response within the configured delay.')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localConfig.autoQuoteEnabled !== false}
                onClick={() => setLocalConfig({ ...localConfig, autoQuoteEnabled: !localConfig.autoQuoteEnabled })}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  localConfig.autoQuoteEnabled !== false ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    localConfig.autoQuoteEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Show disabled warning when auto-quote is off */}
            {localConfig.autoQuoteEnabled === false && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="material-symbols-outlined text-amber-600">warning</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    {t('admin.settings.autoQuoteDisabled', 'Auto-Quote Disabled')}
                  </p>
                  <p className="text-xs text-amber-600">
                    {t('admin.settings.autoQuoteDisabledDesc', 'The auto-quote system is currently turned off. RFQs will not be automatically quoted.')}
                  </p>
                </div>
              </div>
            )}

            <div className={localConfig.autoQuoteEnabled === false ? 'opacity-50 pointer-events-none' : ''}>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {t('admin.settings.timerDelay', 'Auto-Quote Delay (Minutes)')}
                </label>
                <div className="flex items-center gap-4">
                  <select
                    value={localConfig.autoQuoteDelayMinutes}
                    onChange={(e) => setLocalConfig({ ...localConfig, autoQuoteDelayMinutes: Number(e.target.value) })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value={15}>15 {t('admin.settings.min', 'min')}</option>
                    <option value={30}>30 {t('admin.settings.min', 'min')}</option>
                    <option value={60}>60 {t('admin.settings.min', 'min')}</option>
                  </select>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {t('admin.settings.autoQuoteHelp', 'RFQs will be automatically quoted if no suppliers respond within this time.')}
                </p>
              </div>

              {/* Limited Stock Inclusion Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 mt-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700">
                    {t('admin.settings.limitedStockToggle', 'Include Limited Stock Items')}
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('admin.settings.limitedStockDesc', 'When enabled, auto-quotes will include items with limited stock availability.')}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={localConfig.autoQuoteIncludeLimitedStock !== false}
                  onClick={() => setLocalConfig({ ...localConfig, autoQuoteIncludeLimitedStock: !localConfig.autoQuoteIncludeLimitedStock })}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    localConfig.autoQuoteIncludeLimitedStock !== false ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      localConfig.autoQuoteIncludeLimitedStock !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {t('admin.settings.defaultMargin', 'Default Automation Margin')}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={localConfig.defaultMarginPercent}
                    onChange={(e) => setLocalConfig({ ...localConfig, defaultMarginPercent: Number(e.target.value) })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-gray-400 font-medium">{t('admin.settings.percent', '%')}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {t('admin.settings.marginHelp', "Margin applied to the supplier's selling price for auto-generated quotes. Category-specific margins will override this if higher.")}
                </p>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {t('admin.settings.rfqDefaultExpiryDays', 'RFQ Default Expiry (Days)')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={localConfig.rfqDefaultExpiryDays ?? 7}
                  onChange={(e) => setLocalConfig({ ...localConfig, rfqDefaultExpiryDays: Math.max(1, Number(e.target.value) || 7) })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-2">
                  {t('admin.settings.rfqDefaultExpiryDaysHelp', 'Client RFQs automatically use this expiry window. Clients can view it but cannot override it.')}
                </p>
              </div>

              {/* Manual Auto-Quote Trigger */}
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-blue-800">
                      {t('admin.settings.runAutoQuoteNow', 'Run Auto-Quote Now')}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {t('admin.settings.runAutoQuoteNowDesc', 'Manually trigger the auto-quote check for all eligible RFQs immediately.')}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setIsRunningAutoQuote(true);
                      try {
                        await triggerAutoQuoteCheck();
                        toast.success(t('admin.settings.autoQuoteTriggered', 'Auto-quote check completed'));
                      } catch {
                        toast.error(t('admin.settings.autoQuoteError', 'Failed to run auto-quote check'));
                      } finally {
                        setIsRunningAutoQuote(false);
                      }
                    }}
                    disabled={isRunningAutoQuote}
                    className="px-4 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                  >
                    {isRunningAutoQuote ? (
                      <>
                        <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                        {t('admin.settings.running', 'Running...')}
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">bolt</span>
                        {t('admin.settings.runNow', 'Run Now')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <span className="material-symbols-outlined text-2xl">notifications</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('admin.settings.notifications', 'Notification Rules')}</h3>
              <p className="text-sm text-gray-400">{t('admin.settings.notificationsDesc', 'Event types that trigger platform notifications')}</p>
            </div>
          </div>

          <NotificationEventMatrix />
        </div>
      </div>
      </PortalPageShell>
    </div>
  );
};
