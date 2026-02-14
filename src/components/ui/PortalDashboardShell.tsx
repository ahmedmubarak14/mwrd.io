import React from 'react';
import { cn } from '../../utils/helpers';

interface PortalPageShellProps {
  children: React.ReactNode;
  className?: string;
}

export const PortalPageShell: React.FC<PortalPageShellProps> = ({ children, className }) => (
  <div className={cn('p-4 md:p-8 lg:p-12 space-y-6', className)}>{children}</div>
);

interface PortalPageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  portalLabel?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PortalPageHeader: React.FC<PortalPageHeaderProps> = ({
  title,
  subtitle,
  portalLabel,
  actions,
  className,
}) => (
  <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm', className)}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {portalLabel ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{portalLabel}</p>
        ) : null}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0A2540]">{title}</h1>
        {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  </div>
);

interface PortalSectionProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const PortalSection: React.FC<PortalSectionProps> = ({
  children,
  title,
  subtitle,
  action,
  className,
  bodyClassName,
}) => (
  <section className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)}>
    {title || subtitle || action ? (
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div>
          {title ? <h2 className="text-base font-semibold text-[#111827]">{title}</h2> : null}
          {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </header>
    ) : null}
    <div className={cn('p-5', bodyClassName)}>{children}</div>
  </section>
);

type MetricTone = 'primary' | 'info' | 'success' | 'warning' | 'neutral';

interface PortalMetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: string;
  tone?: MetricTone;
  action?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

const metricToneStyles: Record<MetricTone, string> = {
  primary: 'border-[#0A2540] bg-[#0A2540] text-white',
  info: 'border-blue-100 bg-blue-50 text-slate-900',
  success: 'border-emerald-100 bg-emerald-50 text-slate-900',
  warning: 'border-amber-100 bg-amber-50 text-slate-900',
  neutral: 'border-gray-200 bg-white text-slate-900',
};

const metricLabelStyles: Record<MetricTone, string> = {
  primary: 'text-white/80',
  info: 'text-blue-700',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  neutral: 'text-gray-600',
};

const metricValueStyles: Record<MetricTone, string> = {
  primary: 'text-white',
  info: 'text-[#0A2540]',
  success: 'text-[#0A2540]',
  warning: 'text-[#0A2540]',
  neutral: 'text-[#0A2540]',
};

const metricHintStyles: Record<MetricTone, string> = {
  primary: 'text-white/70',
  info: 'text-slate-600',
  success: 'text-slate-600',
  warning: 'text-slate-600',
  neutral: 'text-slate-500',
};

export const PortalMetricCard: React.FC<PortalMetricCardProps> = ({
  label,
  value,
  icon,
  tone = 'neutral',
  action,
  hint,
  className,
}) => (
  <div className={cn('rounded-xl border p-4 shadow-sm', metricToneStyles[tone], className)}>
    <div className="flex items-center justify-between gap-2">
      <p className={cn('text-xs font-semibold uppercase tracking-wide', metricLabelStyles[tone])}>{label}</p>
      {icon ? <span className="material-symbols-outlined text-base">{icon}</span> : null}
    </div>
    <p className={cn('mt-2 text-3xl font-bold leading-tight', metricValueStyles[tone])}>{value}</p>
    {hint ? <p className={cn('mt-1 text-xs', metricHintStyles[tone])}>{hint}</p> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);
