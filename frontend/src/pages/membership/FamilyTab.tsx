import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { useDateFormat } from '../../hooks/useDateFormat';
import { lookupLabel } from '../../utils/lookupLabel';
import {
  duplicatesOf,
  familyRefusalOf,
  memberService,
  refusedField,
  type FamilyGroup,
  type MemberSummary,
  type RelationshipLabel,
} from '../../services/memberService';
import { TierBadge } from './MemberBadges';
import { useTierLabels } from './useTierLabels';
import styles from './Members.module.css';

interface Props {
  tenantSlug: string;
  memberId: string;
  family: FamilyGroup;
  canManage: boolean;
  onChanged: () => void;
}

type Mode = 'new' | 'existing';
const EMPTY = { firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '' };

/**
 * The Family tab of the member page (FR-FAM-01, FR-FAM-06, FR-FAM-07). A principal sees the group and can add a
 * family member, either a new person or an existing member; a family member sees the principal, who confirmed the
 * relationship and when, and can have the link removed with a reason. The relationship and the confirmation tick are
 * required, and no price is calculated here: the discount shows on the payment dialog from the server's quote.
 */
export const FamilyTab: React.FC<Props> = ({ tenantSlug, memberId, family, canManage, onChanged }) => {
  const { t, i18n } = useTranslation('members');
  const navigate = useNavigate();
  const dates = useDateFormat();
  const tier = useTierLabels(tenantSlug);

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const day = (iso: string) => dates.date(new Date(iso));
  const relationName = (r: RelationshipLabel | null) => (r ? lookupLabel(r, i18n.language) : t('family.relationshipUnknown'));
  const open = (id: string) => navigate(`/${tenantSlug}/members/${id}`);
  const confirmedText = (by: string | null, at: string | null) =>
    by && at ? t('family.confirmedBy', { name: by, date: day(at) }) : at ? t('family.confirmedOn', { date: day(at) }) : null;

  const [reason, setReason] = useState('');
  const [removeError, setRemoveError] = useState<'reason' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);

  const closeRemove = () => {
    setRemoving(false);
    setReason('');
    setRemoveError(null);
  };

  const confirmRemove = async () => {
    if (reason.trim() === '') return setRemoveError('reason');
    setSaving(true);
    try {
      await memberService.removeFamilyLink(tenantSlug, memberId, reason.trim());
      closeRemove();
      onChanged();
    } catch {
      setRemoveError('failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className={styles.sectionTitle}>{t('family.title')}</h2>

      {family.principal ? (
        <>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>{t('family.principal')}</dt>
              <dd>
                <button type="button" className={styles.memberLink} onClick={() => open(family.principal!.id)}>
                  {family.principal.memberNumber} {family.principal.name}
                </button>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{t('family.relationship')}</dt>
              <dd>{relationName(family.principal.relationship)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>{t('family.confirmation')}</dt>
              <dd>{confirmedText(family.principal.confirmedBy, family.principal.confirmedAt) ?? <span className={styles.muted}>—</span>}</dd>
            </div>
          </dl>
          {canManage && (
            <div>
              <Button variant="outline" onClick={() => setRemoving(true)}>{t('family.remove')}</Button>
            </div>
          )}
        </>
      ) : (
        <>
          {family.dependants.length === 0 ? (
            <p>{t('family.empty')}</p>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('family.columns.member')}</th>
                    <th scope="col">{t('family.columns.relationship')}</th>
                    <th scope="col">{t('family.columns.tier')}</th>
                    <th scope="col">{t('family.columns.validity')}</th>
                    <th scope="col">{t('family.columns.confirmation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {family.dependants.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <button type="button" className={styles.memberLink} onClick={() => open(d.id)}>{d.memberNumber} {d.name}</button>
                      </td>
                      <td>{relationName(d.relationship)}</td>
                      <td><TierBadge tier={d.tier} label={tier(d.tier).label} colour={tier(d.tier).colour} /></td>
                      <td>{d.valid ? t('validity.valid') : t('validity.notValid', { reason: t(`status.${d.status}`) })}</td>
                      <td>{confirmedText(d.confirmedBy, d.confirmedAt) ?? <span className={styles.muted}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canManage && (
            <div>
              <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>{t('family.add')}</Button>
            </div>
          )}
        </>
      )}

      {family.history.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>{t('family.history.title')}</h2>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('detail.history.date')}</th>
                  <th scope="col">{t('family.history.event')}</th>
                  <th scope="col">{t('detail.history.reason')}</th>
                  <th scope="col">{t('detail.history.by')}</th>
                </tr>
              </thead>
              <tbody>
                {family.history.map((h, index) => (
                  <tr key={`${h.at}-${index}`}>
                    <td>{day(h.at)}</td>
                    <td>{t(`family.history.${h.kind}`, { principal: h.principal ?? '—', relationship: relationName(h.relationship) })}</td>
                    <td>{h.reason ?? <span className={styles.muted}>—</span>}</td>
                    <td>{h.by ?? t('detail.history.system')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adding && (
        <AddFamilyDialog
          tenantSlug={tenantSlug}
          principalId={memberId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}

      <Modal isOpen={removing} onClose={closeRemove} title={t('family.removeDialog.title')}>
        <div className={styles.modalBody}>
          <p>{t('family.removeDialog.help')}</p>
          <TextareaInput
            label={t('family.removeDialog.reason')}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setRemoveError(null);
            }}
            rows={3}
            error={removeError === 'reason' ? t('family.removeDialog.reasonRequired') : undefined}
          />
          {removeError === 'failed' && <p className={styles.formError} role="alert">{t('family.removeDialog.failed')}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={closeRemove}>{t('family.removeDialog.cancel')}</Button>
            <Button variant="danger" isLoading={saving} onClick={() => void confirmRemove()}>{t('family.removeDialog.confirm')}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

interface AddProps {
  tenantSlug: string;
  principalId: string;
  onClose: () => void;
  onAdded: () => void;
}

/** Add a family member (FR-FAM-01): new person or existing member, the relationship, and the confirmation tick. */
const AddFamilyDialog: React.FC<AddProps> = ({ tenantSlug, principalId, onClose, onAdded }) => {
  const { t, i18n } = useTranslation('members');
  const [relationships, setRelationships] = useState<RelationshipLabel[]>([]);
  const [mode, setMode] = useState<Mode>('new');
  const [relationshipId, setRelationshipId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<MemberSummary[]>([]);
  const [chosen, setChosen] = useState('');
  const [duplicates, setDuplicates] = useState<MemberSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    memberService.familyRelationships(tenantSlug).then(setRelationships, () => setRelationships([]));
  }, [tenantSlug]);

  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    memberService.search(tenantSlug, { query: query.trim(), limit: 8 }).then(
      (page) => live && setFound(page.data.filter((m) => m.id !== principalId && m.source !== 'FAMILY')),
      () => live && setFound([])
    );
    return () => {
      live = false;
    };
  }, [mode, query, tenantSlug, principalId]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    setError(null);
  };

  const save = async (confirmDifferentPerson = false) => {
    if (!relationshipId) return setError('relationship');
    if (!confirmed) return setError('confirmation');
    if (mode === 'existing' && !chosen) return setError('member');
    setSaving(true);
    setError(null);
    try {
      await memberService.addFamilyMember(
        tenantSlug,
        principalId,
        mode === 'existing'
          ? { relationshipId, confirmed, memberId: chosen }
          : {
              relationshipId,
              confirmed,
              member: {
                firstName: draft.firstName.trim(),
                lastName: draft.lastName.trim(),
                dateOfBirth: draft.dateOfBirth || null,
                phone: draft.phone.trim() || null,
                email: draft.email.trim() || null,
              },
            },
        confirmDifferentPerson
      );
      onAdded();
    } catch (err) {
      const existing = duplicatesOf(err);
      const refusal = familyRefusalOf(err);
      if (existing) setDuplicates(existing);
      else if (refusal) setError(`refused.${refusal}`);
      else setError(refusedField(err) === 'identifier' ? 'identifier' : 'failed');
    } finally {
      setSaving(false);
    }
  };

  const errorText = (key: string) => {
    if (key === 'relationship') return t('family.addDialog.relationshipRequired');
    if (key === 'confirmation') return t('family.addDialog.confirmationRequired');
    if (key === 'member') return t('family.addDialog.memberRequired');
    if (key === 'identifier') return t('form.errors.identifier');
    if (key.startsWith('refused.')) return t(`family.${key}`);
    return t('family.addDialog.failed');
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title={t('family.addDialog.title')}>
        <div className={styles.modalBody}>
          <SelectInput
            label={t('family.addDialog.mode')}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setError(null);
            }}
          >
            <option value="new">{t('family.addDialog.modeNew')}</option>
            <option value="existing">{t('family.addDialog.modeExisting')}</option>
          </SelectInput>

          {mode === 'new' ? (
            <>
              <TextInput label={t('form.firstName')} value={draft.firstName} onChange={set('firstName')} required />
              <TextInput label={t('form.lastName')} value={draft.lastName} onChange={set('lastName')} required />
              <TextInput label={t('form.dateOfBirth')} type="date" value={draft.dateOfBirth} onChange={set('dateOfBirth')} />
              <TextInput label={t('form.phone')} value={draft.phone} onChange={set('phone')} />
              <TextInput label={t('form.email')} type="email" value={draft.email} onChange={set('email')} />
            </>
          ) : (
            <>
              <TextInput label={t('family.addDialog.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
              {found.length > 0 && (
                <SelectInput label={t('family.addDialog.member')} value={chosen} onChange={(e) => setChosen(e.target.value)}>
                  <option value="">{t('family.addDialog.choose')}</option>
                  {found.map((m) => (
                    <option key={m.id} value={m.id}>{m.memberNumber} {m.firstName} {m.lastName}</option>
                  ))}
                </SelectInput>
              )}
            </>
          )}

          <SelectInput
            label={t('family.addDialog.relationship')}
            value={relationshipId}
            onChange={(e) => {
              setRelationshipId(e.target.value);
              setError(null);
            }}
            error={error === 'relationship' ? errorText(error) : undefined}
          >
            <option value="">{t('family.addDialog.choose')}</option>
            {relationships.map((r) => (
              <option key={r.id} value={r.id}>{lookupLabel(r, i18n.language)}</option>
            ))}
          </SelectInput>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setError(null);
              }}
            />
            <span>{t('family.addDialog.confirmed')}</span>
          </label>

          {error && error !== 'relationship' && <p className={styles.formError} role="alert">{errorText(error)}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={onClose}>{t('family.addDialog.cancel')}</Button>
            <Button isLoading={saving} onClick={() => void save()}>{t('family.addDialog.save')}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={duplicates !== null} onClose={() => setDuplicates(null)} title={t('duplicate.title')}>
        <div className={styles.modalBody}>
          <p>{t('duplicate.body')}</p>
          <ul className={styles.duplicateList}>
            {(duplicates ?? []).map((m) => (
              <li key={m.id} className={styles.duplicateItem}>
                <span><strong>{m.memberNumber}</strong> {m.firstName} {m.lastName}</span>
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
    </>
  );
};
