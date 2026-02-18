import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Truck,
  Package,
  FileText,
  Send,
  Eye,
  Ban
} from 'lucide-react';
import { cn } from '../../utils/helpers';

export type BadgeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'open'
  | 'quoted'
  | 'closed'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'processing'
  | 'confirmed'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending_payment'
  | 'awaiting_confirmation'
  | 'pending_admin_confirmation'
  | 'payment_confirmed'
  | 'accepted'
  | 'active'
  | 'deactivated'
  | 'requires_attention'
  | 'verified'
  | 'in_review'
  | 'incomplete'
  | 'ready_for_pickup'
  | 'pickup_scheduled'
  | 'out_for_delivery'
  | 'shipped'
  | 'pending_po'
  | 'sent_to_client'
  | 'pending_admin'
  | 'picked_up'
  | 'completed'
  | 'disputed'
  | 'refunded';

interface StatusBadgeProps {
  status: BadgeStatus | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className
}) => {
  const { t } = useTranslation();

  const normalizedStatus = status.toLowerCase().replace(/[\s_]+/g, '_') as BadgeStatus;

  const getConfig = () => {
    switch (normalizedStatus) {
      case 'pending':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: <Clock className="w-3 h-3" />,
          label: t('common.pending')
        };
      case 'approved':
      case 'confirmed':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('common.approved')
        };
      case 'rejected':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: <XCircle className="w-3 h-3" />,
          label: t('common.rejected')
        };
      case 'open':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: <FileText className="w-3 h-3" />,
          label: t('status.open')
        };
      case 'quoted':
        return {
          bg: 'bg-purple-50',
          border: 'border-purple-200',
          text: 'text-purple-700',
          icon: <Send className="w-3 h-3" />,
          label: t('status.quoted')
        };
      case 'closed':
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: <Ban className="w-3 h-3" />,
          label: t('status.closed')
        };
      case 'processing': // This case already exists, but the instruction snippet had it. Keeping the existing one.
        return {
          bg: 'bg-blue-100',
          border: 'border-blue-200',
          text: 'text-blue-800',
          icon: <Clock className="w-3 h-3" />, // Assuming Clock for processing
          label: t('status.processing')
        };
      case 'ready_for_pickup':
        return {
          bg: 'bg-indigo-100',
          border: 'border-indigo-200',
          text: 'text-indigo-800',
          icon: <Package className="w-3 h-3" />, // Assuming Package for ready for pickup
          label: t('status.readyForPickup')
        };
      case 'pickup_scheduled':
        return {
          bg: 'bg-purple-100',
          border: 'border-purple-200',
          text: 'text-purple-800',
          icon: <Clock className="w-3 h-3" />, // Assuming Clock for scheduled
          label: t('status.pickupScheduled')
        };
      case 'shipped':
      case 'in_transit':
      case 'out_for_delivery':
        return {
          bg: 'bg-orange-100',
          border: 'border-orange-200',
          text: 'text-orange-800',
          icon: <Truck className="w-3 h-3" />, // Assuming Truck for transit/delivery
          label: t('status.inTransit')
        };
      case 'picked_up':
        return {
          bg: 'bg-teal-100',
          border: 'border-teal-200',
          text: 'text-teal-800',
          icon: <Package className="w-3 h-3" />,
          label: t('status.picked_up')
        };
      case 'delivered':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <Package className="w-3 h-3" />,
          label: t('status.delivered')
        };
      case 'completed':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('status.completed')
        };
      case 'cancelled':
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: <XCircle className="w-3 h-3" />,
          label: t('status.cancelled')
        };
      case 'disputed':
        return {
          bg: 'bg-red-100',
          border: 'border-red-200',
          text: 'text-red-800',
          icon: <AlertCircle className="w-3 h-3" />,
          label: t('status.disputed')
        };
      case 'refunded':
        return {
          bg: 'bg-violet-50',
          border: 'border-violet-200',
          text: 'text-violet-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('status.refunded')
        };
      case 'draft':
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          text: 'text-slate-600',
          icon: <FileText className="w-3 h-3" />,
          label: t('status.draft')
        };
      case 'submitted':
        return {
          bg: 'bg-indigo-50',
          border: 'border-indigo-200',
          text: 'text-indigo-700',
          icon: <Send className="w-3 h-3" />,
          label: t('status.submitted')
        };
      case 'under_review':
      case 'in_review':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-700',
          icon: <Eye className="w-3 h-3" />,
          label: t('status.underReview')
        };
      case 'pending_payment':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-700',
          icon: <Clock className="w-3 h-3" />,
          label: t('status.pendingpayment')
        };
      case 'awaiting_confirmation':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: <Clock className="w-3 h-3" />,
          label: t('status.awaitingconfirmation')
        };
      case 'pending_po':
        return {
          bg: 'bg-amber-100',
          border: 'border-amber-200',
          text: 'text-amber-800',
          icon: <FileText className="w-3 h-3" />,
          label: t('status.pendingPO')
        };
      case 'pending_admin_confirmation':
      case 'pending_admin':
        return {
          bg: 'bg-orange-100',
          border: 'border-orange-200',
          text: 'text-orange-800',
          icon: <Clock className="w-3 h-3" />,
          label: t('status.pending_admin_confirmation')
        };
      case 'sent_to_client':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: <Send className="w-3 h-3" />,
          label: t('status.sentToClient')
        };
      case 'payment_confirmed':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('status.paymentconfirmed')
        };
      case 'accepted':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('status.accepted')
        };
      case 'active':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('admin.users.active')
        };
      case 'deactivated':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: <Ban className="w-3 h-3" />,
          label: t('admin.users.deactivated')
        };
      case 'requires_attention':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          text: 'text-orange-700',
          icon: <AlertCircle className="w-3 h-3" />,
          label: t('admin.users.requiresAttention')
        };
      case 'verified':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: <CheckCircle className="w-3 h-3" />,
          label: t('admin.users.verified')
        };
      case 'incomplete':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: <AlertCircle className="w-3 h-3" />,
          label: t('admin.users.incomplete')
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: <AlertCircle className="w-3 h-3" />,
          label: status
        };
    }
  };

  const config = getConfig();

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        config.bg,
        config.border,
        config.text,
        sizeStyles[size],
        className
      )}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
};
