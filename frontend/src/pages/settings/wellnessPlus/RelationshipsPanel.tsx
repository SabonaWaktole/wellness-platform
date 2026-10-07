import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { membershipSettingsService, refusedField, type Relationship } from '../../../services/membershipSettingsService';
import styles from './WellnessPlusSettings.module.css';

/** FR-FAM-02: the relationship choice list. A deactivated relationship is no longer offered and stays on existing links. */
export const RelationshipsPanel = ({ tenantSlug }: { tenantSlug: string }) => {
  const { t, i18n } = useTranslation('settings');
  const [items, setItems] = useState<Relationship[] | null>(null);
  const [nameSq, setNameSq] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const albanian = i18n.language.startsWith('sq');

  const load = useCallback(() => {
    membershipSettingsService
      .listRelationships(tenantSlug)
      .then(setItems)
      .catch(() => setError(t('wellnessPlus.loadFailed')));
  }, [tenantSlug, t]);
  useEffect(load, [load]);

  const fail = (err: unknown) => {
    const field = refusedField(err);
    setFieldError(field);
    setError(field ? t('wellnessPlus.relationships.invalid') : t('wellnessPlus.saveFailed'));
  };

  const add = async () => {
    setError(null);
    setFieldError(null);
    try {
      await membershipSettingsService.createRelationship(tenantSlug, { nameSq, nameEn });
      setNameSq('');
      setNameEn('');
      load();
    } catch (err) {
      fail(err);
    }
  };

  const toggle = async (item: Relationship) => {
    setError(null);
    try {
      await membershipSettingsService.updateRelationship(tenantSlug, item.id, { active: !item.active });
      load();
    } catch (err) {
      fail(err);
    }
  };

  if (!items) return error ? <p className={styles.error} role="alert">{error}</p> : <p className={styles.status}>{t('wellnessPlus.loading')}</p>;

  return (
    <div className={styles.container}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('wellnessPlus.relationships.name')}</th>
              <th scope="col">{t('wellnessPlus.relationships.status')}</th>
              <th scope="col">
                <span className="sr-only">{t('wellnessPlus.relationships.action')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.active ? '' : styles.inactive}>
                <td>{albanian ? item.nameSq : item.nameEn}</td>
                <td>{item.active ? t('wellnessPlus.active') : t('wellnessPlus.inactive')}</td>
                <td>
                  <Button variant="outline" size="sm" onClick={() => void toggle(item)}>
                    {item.active ? t('wellnessPlus.deactivate') : t('wellnessPlus.activate')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className={styles.addRow}
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="wp-rel-sq">{t('wellnessPlus.nameSq')}</label>
          <input id="wp-rel-sq" className={styles.input} value={nameSq} aria-invalid={fieldError === 'nameSq'} onChange={(e) => setNameSq(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="wp-rel-en">{t('wellnessPlus.nameEn')}</label>
          <input id="wp-rel-en" className={styles.input} value={nameEn} aria-invalid={fieldError === 'nameEn'} onChange={(e) => setNameEn(e.target.value)} />
        </div>
        <Button type="submit" disabled={!nameSq.trim() || !nameEn.trim()}>
          {t('wellnessPlus.relationships.add')}
        </Button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
};
