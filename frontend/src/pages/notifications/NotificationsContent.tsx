import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Card } from '../../components/ui/Card/Card';
import { Button } from '../../components/ui/Button/Button';
import { Badge } from '../../components/ui/Badge/Badge';
import { useNotifications, type NotificationItem } from '../../hooks/useNotifications';
import { useNotificationText } from '../../hooks/useNotificationText';
import { useTeam } from '../../hooks/useTeam';
import { useDateFormat } from '../../hooks/useDateFormat';
import styles from './NotificationsContent.module.css';

const targetPath = (tenantSlug: string, n: NotificationItem): string | null => {
  if (!n.entityId) return null;
  switch (n.entityType) {
    case 'QUOTATION': return `/${tenantSlug}/quotations/${n.entityId}`;
    case 'CLIENT': return `/${tenantSlug}/clients/${n.entityId}`;
    case 'APPOINTMENT': return `/${tenantSlug}/appointments`;
    case 'FORM': return `/${tenantSlug}/settings/client-management/forms/${n.entityId}/submissions`;
    default: return null;
  }
};

export const NotificationsContent: React.FC = () => {
  const { t } = useTranslation('notifications');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const { items, unreadCount, isLoading, markRead, markAllRead } = useNotifications();
  const { staff, fetchStaff } = useTeam();
  const renderText = useNotificationText(staff);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleOpen = (notification: NotificationItem) => {
    if (!notification.readAt) markRead(notification.id);
    const path = tenantSlug ? targetPath(tenantSlug, notification) : null;
    if (path) navigate(path);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead}>
            {t('markAllRead')}
          </Button>
        )}
      </div>

      <Card padding="none">
        {isLoading && items.length === 0 ? (
          <p className={styles.muted}>{t('loading')}</p>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <Bell size={28} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>{t('empty')}</p>
            <p className={styles.muted}>{t('emptyHint')}</p>
          </div>
        ) : (
          <ul className={styles.list}>
            {items.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className={`${styles.item} ${notification.readAt ? '' : styles.itemUnread}`}
                  onClick={() => handleOpen(notification)}
                >
                  <span className={styles.itemBody}>
                    <span className={styles.itemText}>{renderText(notification)}</span>
                    <span className={styles.itemMeta}>
                      {dates.dateTime(notification.createdAt)}
                    </span>
                  </span>
                  {!notification.readAt && (
                    <Badge variant="primary">{t('unreadBadge')}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
