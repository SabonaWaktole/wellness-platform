import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { SlideOver } from '../ui/SlideOver';
import { Button } from '../ui/Button/Button';
import { SelectInput } from '../ui/SelectInput/SelectInput';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { usePermission } from '../../hooks/usePermission';
import { useDealText } from '../../hooks/useDealText';
import { lookupService, type ActivityResult } from '../../services/lookupService';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { lookupLabel } from '../../utils/lookupLabel';
import { isOpenStage, type DealSummary } from '../../types/deal';
import { ACTIVITY_CHANNELS, type ActivityChannel, type ActivityInput, type ActivityView, type Interaction } from '../../types/client';
import type { FollowUp } from '../../types/followUp';
import { followUpService } from '../../services/followUpService';
import { FollowUpQuickButtons } from '../followUps/FollowUpQuickButtons';
import { activityErrorField, activityErrorMessage } from './activityErrors';
import { channelIcon } from './channelIcon';
import styles from './ActivityDialog.module.css';

export interface ActivityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  /** The company's contacts (FR-ACT-02: the contact person comes from these). */
  contacts: { id: string; name: string }[];
  /** The type selected when the dialog opens for a new activity. */
  initialChannel?: ActivityChannel;
  /** Opened from a deal: that deal is preselected (FR-ACT-01). */
  dealId?: string;
  /** Present to edit this activity instead of recording a new one (FR-ACT-06). */
  activity?: ActivityView | null;
  /**
   * Present to complete this follow-up by recording the activity that
   * happened (FR-FUP-06): the form opens on its type, deal and contact, and
   * saving closes the follow-up with the activity, together.
   */
  completing?: FollowUp | null;
  onSaved: (interaction: Interaction) => void;
}

type Field = 'channel' | 'content' | 'occurredAt' | 'contactPersonId' | 'resultId' | 'dealId';

/** `YYYY-MM-DDTHH:mm` in the browser's time zone, as a datetime-local input reads and writes it. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Records or edits an activity on a company (FR-ACT-01, 02, 06): its type,
 * when it happened, the contact person, the result, the client's feedback,
 * the next action and notes, optionally on one of the company's open deals.
 * A note needs only its text. The server checks everything again; this form
 * only stops an obviously incomplete activity before the round trip.
 */
export const ActivityDialog: React.FC<ActivityDialogProps> = ({
  isOpen,
  onClose,
  clientId,
  contacts,
  initialChannel = 'CALL',
  dealId: presetDealId,
  activity,
  completing,
  onSaved,
}) => {
  const { t, i18n } = useTranslation('clients');
  const { t: tc } = useTranslation('common');
  const { t: tf } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const dealText = useDealText();
  const canAddNotes = usePermission('notes.add');
  const canAddActivities = usePermission('activities.add');
  const canSeeDeals = usePermission('deals.view');
  const canScheduleFollowUps = usePermission('followups.manage');

  const [channel, setChannel] = useState<ActivityChannel>(initialChannel);
  const [occurredAt, setOccurredAt] = useState('');
  const [contactPersonId, setContactPersonId] = useState('');
  const [resultId, setResultId] = useState('');
  const [dealId, setDealId] = useState('');
  const [clientFeedback, setClientFeedback] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [content, setContent] = useState('');
  const [results, setResults] = useState<ActivityResult[]>([]);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** FR-ACT-04: the activity just saved, while the dialog offers the follow-up buttons. */
  const [saved, setSaved] = useState<Interaction | null>(null);

  const isNote = channel === 'NOTE';
  const editing = !!activity;

  // Reset the form each time it opens, from the activity when editing. Not
  // on a new `contacts` array: the parent may rebuild it on every render, and
  // that must not wipe what the user is typing.
  useEffect(() => {
    if (!isOpen) return;
    setChannel(activity?.channel ?? completing?.type ?? initialChannel);
    setOccurredAt(toLocalInput(activity ? new Date(activity.occurredAt) : new Date()));
    setContactPersonId(activity?.contact?.id ?? completing?.contactPersonId ?? (contacts.length === 1 ? contacts[0].id : ''));
    setResultId(activity?.result?.id ?? '');
    setDealId(activity?.dealId ?? completing?.dealId ?? presetDealId ?? '');
    setClientFeedback(activity?.clientFeedback ?? '');
    setNextAction(activity?.nextAction ?? '');
    setContent(activity?.content ?? '');
    setErrors({});
    setFormError(null);
    setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activity, completing, initialChannel, presetDealId]);

  useEffect(() => {
    if (!isOpen || !tenantSlug) return;
    let current = true;
    lookupService
      .list(tenantSlug, 'activity-results')
      .then((items) => current && setResults(items))
      .catch(() => current && setResults([]));
    if (canSeeDeals) {
      dealService
        .list(tenantSlug, { clientId, pageSize: 100 })
        .then((page) => current && setDeals(page.items.filter((deal) => isOpenStage(deal.stage))))
        .catch(() => current && setDeals([]));
    }
    return () => {
      current = false;
    };
  }, [isOpen, tenantSlug, clientId, canSeeDeals]);

  // A note and an activity sit behind different permissions (D3), and an
  // edit cannot turn one into the other. A follow-up is completed by contact
  // with the client, never by a note (FR-FUP-06).
  const channelAllowed = (candidate: ActivityChannel) => {
    const candidateIsNote = candidate === 'NOTE';
    if (completing && candidateIsNote) return false;
    if (editing && candidateIsNote !== (activity!.channel === 'NOTE')) return false;
    return candidateIsNote ? canAddNotes : canAddActivities;
  };

  // A result or deal the activity already has stays selectable even if it
  // has since been deactivated or closed.
  const resultOptions =
    activity?.result && !results.some((result) => result.id === activity.result!.id) ? [...results, { ...activity.result, order: 0, active: false }] : results;

  const check = (): Partial<Record<Field, string>> => {
    const found: Partial<Record<Field, string>> = {};
    if (isNote && !content.trim()) found.content = t('activity.errors.content');
    if (!isNote && !contactPersonId) found.contactPersonId = t('activity.errors.contactPersonId');
    if (!isNote && !resultId) found.resultId = t('activity.errors.resultId');
    if (occurredAt && new Date(occurredAt).getTime() > Date.now() + 60_000) found.occurredAt = t('activity.errors.occurredAt');
    return found;
  };

  const save = async () => {
    if (!tenantSlug) return;
    const found = check();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    const input: ActivityInput = {
      channel,
      content: content.trim(),
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
      contactPersonId: contactPersonId || null,
      resultId: resultId || null,
      dealId: dealId || null,
      clientFeedback: clientFeedback.trim() || null,
      nextAction: nextAction.trim() || null,
    };
    setSaving(true);
    try {
      const recorded = editing
        ? await clientService.updateInteraction(tenantSlug, clientId, activity!.id, input)
        : completing
          ? (await followUpService.complete(tenantSlug, completing.id, input)).activity
          : await clientService.addInteraction(tenantSlug, clientId, input);
      onSaved(recorded);
      // FR-ACT-04: after a new activity, the one-click follow-up buttons, in
      // this same dialog. A note is not contact with the client.
      if (!editing && recorded.channel !== 'NOTE' && canScheduleFollowUps) setSaved(recorded);
      else onClose();
    } catch (error) {
      const field = activityErrorField(error) as Field | null;
      if (field) setErrors({ [field]: activityErrorMessage(error, t) });
      else setFormError(activityErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? t('activity.editTitle') : completing ? t('activity.completeTitle') : t('activity.title')}
      footer={
        saved ? (
          <div className={styles.footer}>
            <Button onClick={onClose}>{tf('quick.done')}</Button>
          </div>
        ) : (
          <div className={styles.footer}>
            <Button variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? tc('state.saving') : t('activity.save')}
            </Button>
          </div>
        )
      }
    >
      {saved ? (
        <div className={styles.form}>
          <p role="status">{t('activity.saved')}</p>
          <h3 className={styles.legend}>{tf('quick.after')}</h3>
          {saved.nextAction && <p className={styles.hint}>{tf('quick.afterHint')}</p>}
          <FollowUpQuickButtons clientId={clientId} dealId={saved.dealId} fromActivityId={saved.id} hideLabel onScheduled={onClose} />
        </div>
      ) : (
        <div className={styles.form}>
          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}

          <fieldset className={styles.types}>
            <legend className={styles.legend}>{t('activity.type')}</legend>
            <div className={styles.typeButtons} role="radiogroup" aria-label={t('activity.type')}>
              {ACTIVITY_CHANNELS.filter(channelAllowed).map((candidate) => {
                const Icon = channelIcon(candidate);
                const selected = candidate === channel;
                return (
                  <button
                    key={candidate}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`${styles.typeButton} ${selected ? styles.typeButtonSelected : ''}`}
                    onClick={() => setChannel(candidate)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {t(`detail.channels.${candidate}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <TextInput
            type="datetime-local"
            label={t('activity.occurredAt')}
            value={occurredAt}
            max={toLocalInput(new Date())}
            onChange={(event) => setOccurredAt(event.target.value)}
            error={errors.occurredAt}
          />

          {!isNote && (
            <>
              <SelectInput
                label={t('activity.contact')}
                required
                value={contactPersonId}
                onChange={(event) => setContactPersonId(event.target.value)}
                error={errors.contactPersonId}
                helperText={contacts.length === 0 ? t('activity.noContacts') : undefined}
              >
                <option value="">{t('activity.chooseContact')}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </SelectInput>

              <SelectInput
                label={t('activity.result')}
                required
                value={resultId}
                onChange={(event) => setResultId(event.target.value)}
                error={errors.resultId}
              >
                <option value="">{t('activity.chooseResult')}</option>
                {resultOptions.map((result) => (
                  <option key={result.id} value={result.id}>
                    {lookupLabel(result, i18n.language)}
                  </option>
                ))}
              </SelectInput>
            </>
          )}

          {canSeeDeals && (deals.length > 0 || dealId) && (
            <SelectInput label={t('activity.deal')} value={dealId} onChange={(event) => setDealId(event.target.value)} error={errors.dealId}>
              <option value="">{t('activity.noDeal')}</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {dealText.title(deal)}
                </option>
              ))}
              {dealId && !deals.some((deal) => deal.id === dealId) && <option value={dealId}>{t('activity.currentDeal')}</option>}
            </SelectInput>
          )}

          {!isNote && (
            <>
              <TextareaInput label={t('activity.clientFeedback')} rows={2} value={clientFeedback} onChange={(event) => setClientFeedback(event.target.value)} />
              <TextareaInput label={t('activity.nextAction')} rows={2} value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
            </>
          )}

          <TextareaInput
            label={isNote ? t('activity.note') : t('activity.notes')}
            required={isNote}
            rows={isNote ? 5 : 3}
            placeholder={t('activity.notesPlaceholder')}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            error={errors.content}
          />
        </div>
      )}
    </SlideOver>
  );
};
