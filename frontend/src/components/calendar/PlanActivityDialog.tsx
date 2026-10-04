import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button/Button';
import { SelectInput } from '../ui/SelectInput/SelectInput';
import { TextInput } from '../ui/TextInput/TextInput';
import { TextareaInput } from '../ui/TextareaInput/TextareaInput';
import { useToast } from '../ui/Toast/toastContext';
import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useDealText } from '../../hooks/useDealText';
import { useDebounce } from '../../hooks/useDebounce';
import { usePermissionScope } from '../../hooks/usePermission';
import { useTeam } from '../../hooks/useTeam';
import { appointmentService } from '../../services/appointmentService';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { instantAtMinutes, minutesIntoDay } from '../../utils/calendarDays';
import { getStaffDisplayName } from '../../utils/userUtils';
import { isOpenStage, type DealSummary } from '../../types/deal';
import { PLANNED_TYPES, type CalendarItem, type PlannedType } from '../../types/calendar';
import styles from './PlanActivityDialog.module.css';

/** The start a new item opens with (a working day's first hour). */
export const DEFAULT_START = '09:00';

const toMinutes = (clock: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const toClock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export interface PlanActivityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The company when opened from its page or its deal; the user picks one otherwise. */
  clientId?: string;
  clientName?: string;
  dealId?: string | null;
  /** The day (`YYYY-MM-DD`, workspace zone) a new item opens on; today by default. */
  day?: string;
  /** Present to change this item instead of planning a new one (FR-CAL-02). */
  item?: CalendarItem | null;
  onSaved: () => void;
}

/**
 * FR-CAL-02: plans a call, visit, meeting or online meeting, or changes a
 * planned one: company, deal, contact person, start and end, place (visits)
 * and a note. Times are the workspace's, never the browser's (FR-CAL-08).
 * A Sales User plans for themselves; a Sales Manager can plan for the team.
 */
export const PlanActivityDialog: React.FC<PlanActivityDialogProps> = ({ isOpen, onClose, clientId, clientName, dealId, day, item, onSaved }) => {
  const { t } = useTranslation('appointments');
  const { tenantSlug } = useParams();
  const toast = useToast();
  const dates = useDateFormat();
  const dealText = useDealText();
  const user = useAuthStore((state) => state.user);
  const assignScope = usePermissionScope('activities.add');
  const canAssignOthers = assignScope === 'TEAM' || assignScope === 'ALL';
  const { staff, fetchStaff } = useTeam();

  const [type, setType] = useState<PlannedType>('MEETING');
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [selectedDeal, setSelectedDeal] = useState('');
  const [selectedContact, setSelectedContact] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState('');
  /** Until the end is set by hand it follows the start, an hour later. */
  const [endTouched, setEndTouched] = useState(false);
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const editing = !!item;

  // Open on the item being changed, or on a blank form for the company and day given.
  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormError(null);
    setQuery('');
    setMatches([]);
    if (item) {
      setType(item.type === 'EMAIL' ? 'MEETING' : (item.type as PlannedType));
      setCompany({ id: item.clientId, name: item.companyName });
      setSelectedDeal(item.dealId ?? '');
      setSelectedContact(item.contactPersonId ?? '');
      setAssignedUserId(item.assignedUserId);
      setDate(dates.dayKey(item.scheduledAt));
      setStart(toClock(minutesIntoDay(item.scheduledAt, dates.timeZone)));
      setEnd(item.endAt ? toClock(minutesIntoDay(item.endAt, dates.timeZone)) : '');
      setEndTouched(true);
      setPlace(item.place ?? '');
      setNotes(item.notes ?? '');
    } else {
      setType('MEETING');
      setCompany(clientId ? { id: clientId, name: clientName ?? '' } : null);
      setSelectedDeal(dealId ?? '');
      setSelectedContact('');
      setAssignedUserId(user?.userId ?? '');
      setDate(day ?? dates.dayKey(new Date()));
      setStart(DEFAULT_START);
      setEnd('10:00');
      setEndTouched(false);
      setPlace('');
      setNotes('');
    }
    // Opening is the only trigger: typing must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (isOpen && canAssignOthers) fetchStaff();
  }, [isOpen, canAssignOthers, fetchStaff]);

  const companyId = company?.id ?? null;
  const hasCompanyName = !!company?.name;

  // The company's name, when only its id was given.
  useEffect(() => {
    if (!isOpen || !tenantSlug || !companyId || hasCompanyName) return;
    clientService
      .getClient(tenantSlug, companyId)
      .then((client) => setCompany({ id: client.id, name: client.name ?? '' }))
      .catch(() => undefined);
  }, [isOpen, tenantSlug, companyId, hasCompanyName]);

  // The company's open deals and contacts, to choose from.
  useEffect(() => {
    if (!isOpen || !tenantSlug || !companyId) {
      setDeals([]);
      setContacts([]);
      return;
    }
    let current = true;
    dealService
      .list(tenantSlug, { clientId: companyId })
      .then((page) => current && setDeals(page.items.filter((deal) => isOpenStage(deal.stage))))
      .catch(() => current && setDeals([]));
    clientService
      .getClient(tenantSlug, companyId)
      .then((client) => current && setContacts((client.contacts ?? []).map(({ id, name }) => ({ id, name }))))
      .catch(() => current && setContacts([]));
    return () => {
      current = false;
    };
  }, [isOpen, tenantSlug, companyId]);

  useEffect(() => {
    if (!tenantSlug || companyId || !debouncedQuery.trim()) {
      setMatches([]);
      return;
    }
    let current = true;
    clientService
      .searchClients(tenantSlug, { search: debouncedQuery.trim(), take: 8 })
      .then((page) => current && setMatches(page.items.map((match: any) => ({ id: match.id, name: match.name ?? '' }))))
      .catch(() => current && setMatches([]));
    return () => {
      current = false;
    };
  }, [tenantSlug, companyId, debouncedQuery]);

  const changeStart = (value: string) => {
    setStart(value);
    const minutes = toMinutes(value);
    if (!endTouched && minutes !== null) setEnd(toClock(Math.min(minutes + 60, 23 * 60 + 59)));
  };

  const chooseCompany = (next: { id: string; name: string } | null) => {
    setCompany(next);
    setSelectedDeal('');
    setSelectedContact('');
  };

  const save = async () => {
    if (!tenantSlug) return;
    const problems: Record<string, string> = {};
    const startMinutes = toMinutes(start);
    const endMinutes = end ? toMinutes(end) : null;
    if (!company) problems.clientId = t('plan.errors.company');
    if (!date) problems.date = t('plan.errors.date');
    if (startMinutes === null) problems.start = t('plan.errors.start');
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) problems.end = t('plan.errors.end');
    if (Object.keys(problems).length > 0 || !company || startMinutes === null) {
      setErrors(problems);
      return;
    }

    setSaving(true);
    setErrors({});
    setFormError(null);
    // The workspace's wall time, whatever the browser's zone is.
    const scheduledAt = instantAtMinutes(date, startMinutes, dates.timeZone).toISOString();
    const endAt = endMinutes === null ? null : instantAtMinutes(date, endMinutes, dates.timeZone).toISOString();
    const body = {
      type,
      scheduledAt,
      endAt,
      dealId: selectedDeal || null,
      contactPersonId: selectedContact || null,
      place: type === 'VISIT' ? place.trim() || null : null,
      notes: notes.trim(),
    };
    try {
      if (item) await appointmentService.updateAppointment(tenantSlug, item.id, { ...body, assignedUserId: assignedUserId || undefined });
      else await appointmentService.createAppointment(tenantSlug, { ...body, clientId: company.id, assignedUserId: assignedUserId || (user?.userId ?? '') });
      toast.success(t(editing ? 'plan.updated' : 'plan.created'));
      onSaved();
    } catch (failure: any) {
      setFormError(failure?.response?.data?.error ?? t('plan.errors.failed'));
    } finally {
      setSaving(false);
    }
  };

  const assignable = staff.filter((member) => member.isActive !== false && member.id !== user?.userId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(editing ? 'plan.editTitle' : 'plan.title')} maxWidth="md">
      <div className={styles.form}>
        <SelectInput label={t('plan.type')} value={type} onChange={(event) => setType(event.target.value as PlannedType)}>
          {PLANNED_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`calendar.type.${value}`)}
            </option>
          ))}
        </SelectInput>

        <div>
          <span className={styles.label}>{t('plan.company')}</span>
          {company ? (
            <div className={styles.company}>
              <Building2 size={18} aria-hidden="true" />
              <span className={styles.companyName}>{company.name}</span>
              {!clientId && !editing && (
                <Button variant="ghost" size="sm" type="button" onClick={() => chooseCompany(null)}>
                  {t('plan.companyChange')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <TextInput
                aria-label={t('plan.companySearch')}
                placeholder={t('plan.companySearchPlaceholder')}
                iconLeft={<Search size={16} />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                error={errors.clientId}
              />
              {debouncedQuery.trim() && (
                <ul className={styles.matches}>
                  {matches.length === 0 && <li className={styles.noMatch}>{t('plan.noCompanies')}</li>}
                  {matches.map((match) => (
                    <li key={match.id}>
                      <button type="button" className={styles.match} onClick={() => chooseCompany(match)}>
                        {match.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {company && (
          <div className={styles.row}>
            <SelectInput label={t('plan.deal')} value={selectedDeal} onChange={(event) => setSelectedDeal(event.target.value)}>
              <option value="">{t('plan.noDeal')}</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {dealText.title(deal)}
                </option>
              ))}
              {/* A deal the item already has, now closed, stays selectable. */}
              {selectedDeal && !deals.some((deal) => deal.id === selectedDeal) && item?.dealId === selectedDeal && (
                <option value={selectedDeal}>{dealText.title({ title: item.dealTitle, companyName: item.companyName, type: (item.dealType ?? 'NEW_CONTRACT') as DealSummary['type'] })}</option>
              )}
            </SelectInput>
            <SelectInput label={t('plan.contact')} value={selectedContact} onChange={(event) => setSelectedContact(event.target.value)}>
              <option value="">{t('plan.noContact')}</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </SelectInput>
          </div>
        )}

        <div className={styles.row}>
          <TextInput type="date" label={t('plan.date')} value={date} onChange={(event) => setDate(event.target.value)} error={errors.date} required />
          <TextInput type="time" label={t('plan.start')} value={start} onChange={(event) => changeStart(event.target.value)} error={errors.start} required />
          <TextInput type="time" label={t('plan.end')} value={end} onChange={(event) => {
              setEndTouched(true);
              setEnd(event.target.value);
            }}
            error={errors.end} />
        </div>

        {type === 'VISIT' && (
          <TextInput label={t('plan.place')} value={place} maxLength={200} onChange={(event) => setPlace(event.target.value)} placeholder={t('plan.placePlaceholder')} />
        )}

        {canAssignOthers && (
          <SelectInput label={t('plan.salesperson')} value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
            {user && <option value={user.userId}>{t('plan.myself')}</option>}
            {assignable.map((member) => (
              <option key={member.id} value={member.id}>
                {getStaffDisplayName(member)}
              </option>
            ))}
            {/* The item's own salesperson, when they are not in the list (deactivated since). */}
            {item && item.assignedUserId !== user?.userId && !assignable.some((member) => member.id === item.assignedUserId) && (
              <option value={item.assignedUserId}>{item.assignedUserName}</option>
            )}
          </SelectInput>
        )}

        <TextareaInput label={t('plan.notes')} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />

        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            {t('plan.cancel')}
          </Button>
          <Button onClick={save} isLoading={saving}>
            {t(editing ? 'plan.saveChanges' : 'plan.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
