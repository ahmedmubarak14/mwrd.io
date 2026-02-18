import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  );

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      if (triggerRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = 340;
      const width = Math.min(preferredWidth, window.innerWidth - (viewportPadding * 2));

      let left = align === 'left' ? rect.left : rect.right - width;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));

      const top = rect.bottom + 8;
      const maxHeight = Math.max(220, window.innerHeight - top - viewportPadding);

      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, isOpen]);

  const handleNotificationClick = (id: string, actionUrl?: string) => {
    markNotificationRead(id);
    if (actionUrl && onNavigate) {
      onNavigate(actionUrl);
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
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

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-[1000] bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden"
        >
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

          <div className="overflow-y-auto" style={{ maxHeight: panelStyle.maxHeight ? `calc(${panelStyle.maxHeight}px - 57px)` : 320 }}>
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
        </div>,
        document.body
      )}
    </div>
  );
};
