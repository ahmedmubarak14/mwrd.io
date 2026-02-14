import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';

interface NotificationBellProps {
  onNavigate?: (url: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'rfq':
      return 'request_quote';
    case 'quote':
      return 'receipt_long';
    case 'order':
      return 'local_shipping';
    case 'payment':
      return 'payments';
    default:
      return 'notifications';
  }
};

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onNavigate,
  align = 'right',
  className = '',
}) => {
  const { t } = useTranslation();
  const notifications = useStore((state) => state.notifications);
  const markNotificationRead = useStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useStore((state) => state.markAllNotificationsRead);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  );

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleNotificationClick = (id: string, actionUrl?: string) => {
    markNotificationRead(id);
    if (actionUrl && onNavigate) {
      onNavigate(actionUrl);
      setIsOpen(false);
    }
  };

  const alignmentClass = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        type="button"
        aria-label={t('notifications.openInbox')}
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={`absolute ${alignmentClass} mt-2 z-50 w-[320px] max-w-[90vw] bg-white rounded-xl border border-gray-200 shadow-lg`}>
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">{t('notifications.title')}</h3>
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="text-xs font-semibold text-[#137fec] hover:underline"
            >
              {t('notifications.markAllRead')}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-500">{t('notifications.empty')}</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification.id, notification.actionUrl)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                    notification.isRead ? 'bg-white' : 'bg-blue-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-base text-[#137fec] mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{notification.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notification.message}</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
