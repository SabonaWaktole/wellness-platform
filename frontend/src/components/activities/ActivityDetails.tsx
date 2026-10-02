import React from 'react';
import { useTranslation } from 'react-i18next';
import { lookupLabel } from '../../utils/lookupLabel';
import type { ActivityView } from '../../types/client';
import styles from './ActivityDetails.module.css';

type Details = Pick<ActivityView, 'content' | 'contact' | 'result' | 'clientFeedback' | 'nextAction' | 'updatedAt'>;

/**
 * What an activity records beyond its type, time and author (FR-ACT-05): the
 * contact, the result in the reader's language, the client's feedback, the
 * next action and the notes. Shared by the company timeline and the deal page.
 */
export const ActivityDetails: React.FC<{ activity: Details; actions?: React.ReactNode }> = ({ activity, actions }) => {
  const { t, i18n } = useTranslation('clients');
  const rows: [string, string][] = [];
  if (activity.contact) rows.push([t('activity.contact'), activity.contact.name]);
  if (activity.result) rows.push([t('activity.result'), lookupLabel(activity.result, i18n.language)]);
  if (activity.clientFeedback) rows.push([t('activity.clientFeedback'), activity.clientFeedback]);
  if (activity.nextAction) rows.push([t('activity.nextAction'), activity.nextAction]);

  return (
    <div className={styles.details}>
      {rows.length > 0 && (
        <dl className={styles.fields}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {activity.content && <p className={styles.content}>{activity.content}</p>}
      {(activity.updatedAt || actions) && (
        <div className={styles.footer}>
          {activity.updatedAt && <span className={styles.edited}>{t('activity.edited')}</span>}
          {actions}
        </div>
      )}
    </div>
  );
};
