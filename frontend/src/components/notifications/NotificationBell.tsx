import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications, type NotificationItem } from '../../hooks/useNotifications';
import { useNotificationText } from '../../hooks/useNotificationText';
import { useTeam } from '../../hooks/useTeam';
import { useDateFormat } from '../../hooks/useDateFormat';
import styles from './NotificationBell.module.css';

/** Where a notification takes you when clicked. */
const targetPath = (tenantSlug: string, n: NotificationItem): string | null => {
  // FR-FUP-09: the daily summary opens the list it summarises.
  if (n.type === 'FOLLOW_UP_DAILY_SUMMARY') return `/${tenantSlug}/follow-ups`;
  if (!n.entityId) return null;
  switch (n.entityType) {
    case 'QUOTATION': return `/${tenantSlug}/quotations/${n.entityId}`;
    case 'CLIENT': return `/${tenantSlug}/clients/${n.entityId}`;
    case 'APPOINTMENT': return `/${tenantSlug}/appointments`;
    case 'FORM': return `/${tenantSlug}/settings/client-management/forms/${n.entityId}/submissions`;
    // FR-DSC-05: an approval request opens the deal on that offer, where the
    // inline approve / reject steps live. The offer id travels in params.
    case 'OFFER': {
      const offerId = typeof n.params?.offerId === 'string' ? n.params.offerId : null;
      return offerId ? `/${tenantSlug}/deals/${n.entityId}?offer=${offerId}` : `/${tenantSlug}/deals/${n.entityId}`;
    }
    // M2 Slice 11: "My follow-ups", on that follow-up.
    case 'FOLLOW_UP': return `/${tenantSlug}/follow-ups?open=${n.entityId}`;
    default: return null;
  }
};

export const NotificationBell: React.FC = () => {
  const { t } = useTranslation('notifications');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const { items, unreadCount, isLoading, markRead, markAllRead } = useNotifications();
  const { staff, fetchStaff } = useTeam();
  const renderText = useNotificationText(staff);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Actor names are resolved from the live staff list, so it has to be loaded.
  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Close on an outside click or Escape, the same behaviour as the app's other
  // popovers.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const handleOpen = (notification: NotificationItem) => {
    if (!notification.readAt) markRead(notification.id);
    const path = tenantSlug ? targetPath(tenantSlug, notification) : null;
    if (path) {
      setIsOpen(false);
      navigate(path);
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.bellButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={
          unreadCount > 0 ? t('bellAriaUnread', { count: unreadCount }) : t('bellAria')
        }
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          // aria-hidden: the count is already in the button's accessible name,
          // and announcing it twice is noise for a screen reader.
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.panel} role="menu">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('title')}</h2>
            {unreadCount > 0 && (
              <button type="button" className={styles.linkButton} onClick={markAllRead}>
                {t('markAllRead')}
              </button>
            )}
          </div>

          <div className={styles.list}>
            {isLoading && items.length === 0 ? (
              <p className={styles.muted}>{t('loading')}</p>
            ) : items.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>{t('empty')}</p>
                <p className={styles.muted}>{t('emptyHint')}</p>
              </div>
            ) : (
              items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  className={`${styles.item} ${notification.readAt ? '' : styles.itemUnread}`}
                  onClick={() => handleOpen(notification)}
                >
                  <span className={styles.itemText}>{renderText(notification)}</span>
                  <span className={styles.itemMeta}>{dates.dateTime(notification.createdAt)}</span>
                </button>
              ))
            )}
          </div>

          <div className={styles.panelFooter}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setIsOpen(false);
                navigate(`/${tenantSlug}/notifications`);
              }}
            >
              {t('viewAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
