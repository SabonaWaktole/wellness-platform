import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { lookupService, type City } from '../../services/lookupService';
import {
  duplicatesOf,
  MEMBER_LANGUAGES,
  memberService,
  refusedField,
  type MemberDetailsInput,
  type MemberSummary,
} from '../../services/memberService';
import { lookupLabel } from '../../utils/lookupLabel';
import styles from './Members.module.css';

type Draft = Record<keyof MemberDetailsInput, string>;
const EMPTY: Draft = { firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '', language: 'sq', cityId: '', note: '' };
const FIELDS = ['firstName', 'lastName', 'dateOfBirth', 'phone', 'email', 'language', 'cityId', 'note'] as const;
const ERROR_KEYS = [...FIELDS, 'identifier'] as const;

const toInput = (draft: Draft): MemberDetailsInput => ({
  firstName: draft.firstName.trim(),
  lastName: draft.lastName.trim(),
  dateOfBirth: draft.dateOfBirth || null,
  phone: draft.phone.trim() || null,
  email: draft.email.trim() || null,
  language: draft.language as MemberDetailsInput['language'],
  cityId: draft.cityId || null,
  note: draft.note.trim() || null,
});

/**
 * Register a member (FR-MEM-01) or edit personal details (FR-MEM-09). The form holds the FR-MEM-02 personal fields
 * and nothing else: there is no tier, expiry, member ID or status control, because those change only through the
 * actions of the milestone. The server judges every value; a refusal is shown against the field it names. A
 * possible duplicate opens a dialog with the existing member and "Different person, save" (FR-MEM-04).
 */
export const MemberFormContent: React.FC = () => {
  const { t, i18n } = useTranslation('members');
  const { tenantSlug, memberId } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(memberId);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState<(typeof ERROR_KEYS)[number] | 'generic' | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [duplicates, setDuplicates] = useState<MemberSummary[] | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    lookupService.list(tenantSlug, 'cities').then(setCities, () => setCities([]));
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantSlug || !memberId) return;
    memberService
      .get(tenantSlug, memberId)
      .then((m) =>
        setDraft({
          firstName: m.firstName,
          lastName: m.lastName,
          dateOfBirth: m.dateOfBirth ?? '',
          phone: m.phone ?? '',
          email: m.email ?? '',
          language: m.language,
          cityId: m.cityId ?? '',
          note: m.note ?? '',
        })
      )
      .catch(() => setError('generic'))
      .finally(() => setLoading(false));
  }, [tenantSlug, memberId]);

  const edit = (field: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(null);
  };

  const save = async (confirmDifferentPerson = false) => {
    if (!tenantSlug) return;
    setSaving(true);
    setError(null);
    try {
      const body = toInput(draft);
      const saved = editing
        ? await memberService.update(tenantSlug, memberId!, body, confirmDifferentPerson)
        : await memberService.register(tenantSlug, body, confirmDifferentPerson);
      navigate(`/${tenantSlug}/members/${saved.id}`);
    } catch (err) {
      const existing = duplicatesOf(err);
      if (existing) {
        setDuplicates(existing);
      } else {
        setDuplicates(null);
        const field = refusedField(err);
        setError(field && (ERROR_KEYS as readonly string[]).includes(field) ? (field as (typeof ERROR_KEYS)[number]) : 'generic');
      }
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: (typeof ERROR_KEYS)[number]) => (error === field ? t(`form.errors.${field}`) : undefined);
  const back = () => navigate(editing ? `/${tenantSlug}/members/${memberId}` : `/${tenantSlug}/members`);

  return (
    <div className={`${styles.container} ${styles.narrow}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{editing ? t('form.editTitle') : t('form.newTitle')}</h1>
        </div>
      </div>

      <form
        className={styles.card}
        aria-label={editing ? t('form.editTitle') : t('form.newTitle')}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={styles.form}>
          <p className={`${styles.intro} ${styles.fullWidth}`}>{t('form.intro')}</p>
          <TextInput label={t('form.firstName')} value={draft.firstName} onChange={(e) => edit('firstName', e.target.value)} error={fieldError('firstName')} disabled={loading} required />
          <TextInput label={t('form.lastName')} value={draft.lastName} onChange={(e) => edit('lastName', e.target.value)} error={fieldError('lastName')} disabled={loading} required />
          <TextInput label={t('form.dateOfBirth')} type="date" value={draft.dateOfBirth} onChange={(e) => edit('dateOfBirth', e.target.value)} error={fieldError('dateOfBirth')} disabled={loading} />
          <TextInput label={t('form.phone')} type="tel" value={draft.phone} onChange={(e) => edit('phone', e.target.value)} error={fieldError('phone')} disabled={loading} />
          <TextInput label={t('form.email')} type="email" value={draft.email} onChange={(e) => edit('email', e.target.value)} error={fieldError('email')} disabled={loading} />
          <SelectInput label={t('form.language')} value={draft.language} onChange={(e) => edit('language', e.target.value)} error={fieldError('language')} disabled={loading}>
            {MEMBER_LANGUAGES.map((code) => (
              <option key={code} value={code}>{t(`languages.${code}`)}</option>
            ))}
          </SelectInput>
          <SelectInput label={t('form.city')} value={draft.cityId} onChange={(e) => edit('cityId', e.target.value)} error={fieldError('cityId')} disabled={loading}>
            <option value="">{t('form.cityNone')}</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>{lookupLabel(city, i18n.language)}</option>
            ))}
          </SelectInput>
          {error === 'identifier' && <p className={`${styles.formError} ${styles.fullWidth}`} role="alert">{t('form.errors.identifier')}</p>}
          <div className={styles.fullWidth}>
            <TextareaInput label={t('form.note')} value={draft.note} onChange={(e) => edit('note', e.target.value)} error={fieldError('note')} disabled={loading} rows={4} />
            <p className={styles.warning} id="member-note-warning">{t('form.noteWarning')}</p>
          </div>
          {error === 'generic' && <p className={`${styles.formError} ${styles.fullWidth}`} role="alert">{t('form.errors.generic')}</p>}
          <div className={styles.formActions}>
            <Button type="button" variant="ghost" onClick={back}>{t('form.cancel')}</Button>
            <Button type="submit" isLoading={saving} disabled={loading || saving}>{saving ? t('form.saving') : t('form.save')}</Button>
          </div>
        </div>
      </form>

      <Modal isOpen={duplicates !== null} onClose={() => setDuplicates(null)} title={t('duplicate.title')}>
        <div className={styles.modalBody}>
          <p>{t('duplicate.body')}</p>
          <ul className={styles.duplicateList}>
            {(duplicates ?? []).map((m) => (
              <li key={m.id} className={styles.duplicateItem}>
                <span>
                  <strong>{m.memberNumber}</strong> {m.firstName} {m.lastName}
                  {m.dateOfBirth && <span className={styles.muted}> · {m.dateOfBirth}</span>}
                </span>
                <Button variant="outline" size="sm" onClick={() => navigate(`/${tenantSlug}/members/${m.id}`)}>{t('duplicate.open')}</Button>
              </li>
            ))}
          </ul>
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={() => setDuplicates(null)}>{t('duplicate.cancel')}</Button>
            <Button
              isLoading={saving}
              onClick={() => {
                setDuplicates(null);
                void save(true);
              }}
            >
              {t('duplicate.differentPerson')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
