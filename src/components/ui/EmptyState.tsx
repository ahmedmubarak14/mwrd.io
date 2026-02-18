import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileSearch, ShoppingCart, MessageSquare, Package, ClipboardList, Users, CreditCard } from 'lucide-react';

type EmptyStateType = 'rfqs' | 'quotes' | 'orders' | 'products' | 'users' | 'payments' | 'general';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  type = 'general',
  title,
  description,
  action 
}) => {
  const { t } = useTranslation();

  const getIcon = () => {
    switch (type) {
      case 'rfqs':
        return <ClipboardList className="w-12 h-12 text-gray-300" />;
      case 'quotes':
        return <MessageSquare className="w-12 h-12 text-gray-300" />;
      case 'orders':
        return <ShoppingCart className="w-12 h-12 text-gray-300" />;
      case 'products':
        return <Package className="w-12 h-12 text-gray-300" />;
      case 'users':
        return <Users className="w-12 h-12 text-gray-300" />;
      case 'payments':
        return <CreditCard className="w-12 h-12 text-gray-300" />;
      default:
        return <FileSearch className="w-12 h-12 text-gray-300" />;
    }
  };

  const getDefaultContent = () => {
    switch (type) {
      case 'rfqs':
        return {
          title: t('empty.rfqs.title'),
          description: t('empty.rfqs.description')
        };
      case 'quotes':
        return {
          title: t('empty.quotes.title'),
          description: t('empty.quotes.description')
        };
      case 'orders':
        return {
          title: t('empty.orders.title'),
          description: t('empty.orders.description')
        };
      case 'products':
        return {
          title: t('empty.products.title'),
          description: t('empty.products.description')
        };
      case 'users':
        return {
          title: t('empty.users.title'),
          description: t('empty.users.description')
        };
      case 'payments':
        return {
          title: t('empty.payments.title'),
          description: t('empty.payments.description')
        };
      default:
        return {
          title: t('empty.general.title'),
          description: t('empty.general.description')
        };
    }
  };

  const defaults = getDefaultContent();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4 p-4 bg-gray-50 rounded-full">
        {getIcon()}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {title || defaults.title}
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        {description || defaults.description}
      </p>
      {action && (
        <div>{action}</div>
      )}
    </div>
  );
};
