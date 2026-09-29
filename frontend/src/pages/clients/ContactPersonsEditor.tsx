import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Badge } from '../../components/ui/Badge/Badge';
import { useContactPersons } from '../../hooks/useClients';
import { clientErrorMessage } from './clientErrorMessage';
import type { ContactPerson, ContactPersonInput } from '../../types/client';
import styles from './ContactPersonsEditor.module.css';

const emptyRow = (): ContactPersonInput => ({ name: '', position: '', phone: '', email: '' });

interface CreateModeProps {
  mode: 'create';
  contacts: ContactPersonInput[];
  onChange: (contacts: ContactPersonInput[]) => void;
  /** Set on the row(s) missing a name or a phone/email, keyed by index, after a failed submit. */
  rowErrors?: Record<number, string>;
}

interface EditModeProps {
  mode: 'edit';
  clientId: string;
  contacts: ContactPerson[];
  /** Called after any successful write, so the caller refetches the client. */
  onChanged: () => void;
}

type Props = CreateModeProps | EditModeProps;

/**
 * The contacts section on the company form (FR-CMP-04). In create mode, rows
 * are local state submitted together with the rest of the form. In edit
 * mode, each row saves and removes itself immediately through the
 * per-contact endpoints — see the Slice 12 plan's decision to keep the
 * company form's own submit atomic (create) while an edit stays granular.
 */
export const ContactPersonsEditor: React.FC<Props> = (props) => {
  if (props.mode === 'create') return <CreateModeEditor {...props} />;
  return <EditModeEditor {...props} />;
};

const CreateModeEditor: React.FC<CreateModeProps> = ({ contacts, onChange, rowErrors }) => {
  const { t } = useTranslation('clients');

  const update = (index: number, patch: Partial<ContactPersonInput>) => {
    onChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const remove = (index: number) => {
    onChange(contacts.filter((_, i) => i !== index));
  };

  const add = () => onChange([...contacts, emptyRow()]);

  return (
    <div className={styles.list}>
      {contacts.map((contact, index) => (
        <div key={index} className={styles.row}>
          <div className={styles.rowHeader}>
            {index === 0 ? (
              <Badge variant="primary">{t('form.contacts.primary')}</Badge>
            ) : (
              <span className={styles.rowIndex}>{t('form.contacts.rowLabel', { number: index + 1 })}</span>
            )}
            {contacts.length > 1 && (
              <button
                type="button"
                className={styles.removeButton}
                aria-label={t('form.contacts.remove')}
                onClick={() => remove(index)}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className={styles.rowGrid}>
            <TextInput
              label={t('form.contacts.name')}
              required
              value={contact.name}
              error={rowErrors?.[index]}
              onChange={(e) => update(index, { name: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.position')}
              value={contact.position ?? ''}
              onChange={(e) => update(index, { position: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.phone')}
              value={contact.phone ?? ''}
              onChange={(e) => update(index, { phone: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.email')}
              value={contact.email ?? ''}
              onChange={(e) => update(index, { email: e.target.value })}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" icon={<Plus size={16} />} onClick={add}>
        {t('form.contacts.add')}
      </Button>
    </div>
  );
};

const EditModeEditor: React.FC<EditModeProps> = ({ clientId, contacts, onChanged }) => {
  const { t } = useTranslation('clients');
  const { addContact, updateContact, removeContact, setPrimaryContact, isLoading } = useContactPersons();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactPersonInput | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ContactPerson | null>(null);
  const [replacementId, setReplacementId] = useState('');

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      onChanged();
    } catch (err: any) {
      setError(clientErrorMessage(err, t));
    }
  };

  const saveField = (contact: ContactPerson, patch: Partial<Omit<ContactPersonInput, 'isPrimary'>>) =>
    run(() => updateContact(clientId, contact.id, patch));

  const startRemove = (contact: ContactPerson) => {
    if (contacts.length === 1) {
      setError(t('form.errors.PRIMARY_CONTACT_REQUIRED'));
      return;
    }
    if (contact.isPrimary) {
      setPendingRemoval(contact);
      setReplacementId('');
      return;
    }
    run(() => removeContact(clientId, contact.id));
  };

  const confirmRemovePrimary = () => {
    if (!pendingRemoval || !replacementId) return;
    run(() => removeContact(clientId, pendingRemoval.id, replacementId)).then(() => {
      setPendingRemoval(null);
    });
  };

  const addDraft = () => {
    if (!draft?.name) return;
    run(() => addContact(clientId, draft)).then(() => setDraft(null));
  };

  return (
    <div className={styles.list}>
      {error && <div className={styles.errorBanner}>{error}</div>}
      {contacts.map((contact) => (
        <div key={contact.id} className={styles.row}>
          <div className={styles.rowHeader}>
            <label className={styles.primaryRadio}>
              <input
                type="radio"
                name="primaryContact"
                checked={contact.isPrimary}
                disabled={contact.isPrimary || isLoading}
                onChange={() => run(() => setPrimaryContact(clientId, contact.id))}
              />
              {contact.isPrimary ? (
                <Badge variant="primary">{t('form.contacts.primary')}</Badge>
              ) : (
                <span className={styles.setPrimaryLabel}>
                  <Star size={14} /> {t('form.contacts.makePrimary')}
                </span>
              )}
            </label>
            <button
              type="button"
              className={styles.removeButton}
              aria-label={t('form.contacts.remove')}
              onClick={() => startRemove(contact)}
              disabled={isLoading}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className={styles.rowGrid}>
            <TextInput
              label={t('form.contacts.name')}
              defaultValue={contact.name}
              onBlur={(e) => e.target.value !== contact.name && saveField(contact, { name: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.position')}
              defaultValue={contact.position ?? ''}
              onBlur={(e) => e.target.value !== (contact.position ?? '') && saveField(contact, { position: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.phone')}
              defaultValue={contact.phone ?? ''}
              onBlur={(e) => e.target.value !== (contact.phone ?? '') && saveField(contact, { phone: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.email')}
              defaultValue={contact.email ?? ''}
              onBlur={(e) => e.target.value !== (contact.email ?? '') && saveField(contact, { email: e.target.value })}
            />
          </div>

          {pendingRemoval?.id === contact.id && (
            <div className={styles.replacePrompt}>
              <p>{t('form.contacts.chooseReplacement')}</p>
              <select value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
                <option value="">{t('form.profile.choose')}</option>
                {contacts
                  .filter((c) => c.id !== contact.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <Button type="button" size="sm" disabled={!replacementId} onClick={confirmRemovePrimary}>
                {t('form.contacts.remove')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPendingRemoval(null)}>
                {t('form.contacts.cancel')}
              </Button>
            </div>
          )}
        </div>
      ))}

      {draft ? (
        <div className={styles.row}>
          <div className={styles.rowGrid}>
            <TextInput
              label={t('form.contacts.name')}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.position')}
              value={draft.position ?? ''}
              onChange={(e) => setDraft({ ...draft, position: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.phone')}
              value={draft.phone ?? ''}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <TextInput
              label={t('form.contacts.email')}
              value={draft.email ?? ''}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          <div className={styles.rowActions}>
            <Button type="button" size="sm" disabled={!draft.name || isLoading} onClick={addDraft}>
              {t('form.contacts.save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t('form.contacts.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" icon={<Plus size={16} />} onClick={() => setDraft(emptyRow())}>
          {t('form.contacts.add')}
        </Button>
      )}
    </div>
  );
};
