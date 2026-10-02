import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Edit3, Mail, MoreVertical, Phone, Settings, PhoneCall, Video, FileText, Calendar } from 'lucide-react';
import { useClientDetail, useClientHistory, useClientSettings } from '../../hooks/useClients';
import { useClientAppointments } from '../../hooks/useAppointments';
import { Card } from '../../components/ui/Card/Card';
import { Badge } from '../../components/ui/Badge/Badge';
import { Avatar } from '../../components/ui/Avatar/Avatar';
import { Button } from '../../components/ui/Button/Button';
import { SalesScriptButton } from '../../components/salesScript/SalesScriptButton';
import { SlideOver } from '../../components/ui/SlideOver';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { Tabs } from '../../components/ui/Tabs';
import { usePermission } from '../../hooks/usePermission';
import { ClientContractsTab } from '../../components/clients/ClientContractsTab';
import { CompanyTimeline } from '../../components/clients/CompanyTimeline';
import { AppointmentDetailPanel } from '../../components/panels/AppointmentDetailPanel/AppointmentDetailPanel';
import { AppointmentForm } from '../../components/forms/AppointmentForm/AppointmentForm';
import { useAddInteraction } from '../../hooks/useClients';
import type { Appointment } from '../../types/appointment';
import { useTeam } from '../../hooks/useTeam';
import { findPersonById, getStaffDisplayName, getStaffInitials } from '../../utils/userUtils';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { RiskBadge } from '../../components/clients/RiskBadge';
import { lookupLabel } from '../../utils/lookupLabel';
import styles from './ClientDetailContent.module.css';
import { useDateFormat } from '../../hooks/useDateFormat';

/**
 * Custom field values are stored as JSONB and can be any JSON scalar, so they
 * cannot be rendered directly.
 *
 * `{value || '-'}` was wrong for booleans in both directions: React renders a
 * bare `true` as nothing at all (so a ticked field looked blank), while `false`
 * is falsy and fell through to the em dash used for "not set" — making "No"
 * indistinguishable from "never filled in".
 */
const formatCustomFieldValue = (
  value: unknown,
  labels: { yes: string; no: string }
): string => {
  if (typeof value === 'boolean') return value ? labels.yes : labels.no;
  if (value === null || value === undefined || value === '') return '-';
  // MULTI_SELECT stores an array. String([...]) would render "a,b" with no
  // spacing, and an empty selection as '' rather than the not-set dash.
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  return String(value);
};

const getAppointmentStatusVariant = (status: Appointment['status']) => {
  switch (status) {
    case 'SCHEDULED':
      return 'primary' as const;
    case 'CONFIRMED':
      return 'success' as const;
    case 'COMPLETED':
      return 'secondary' as const;
    case 'CANCELLED':
      return 'error' as const;
    default:
      return 'warning' as const;
  }
};

export const ClientDetailContent: React.FC = () => {
  const dates = useDateFormat();
  const { t, i18n } = useTranslation('clients');
  const { t: tc } = useTranslation('common');
  const statusLabel = useStatusLabel();
  const { clientId, tenantSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const showDuplicateNameWarning = !!(location.state as { duplicateNameWarning?: boolean } | null)?.duplicateNameWarning;
  const [searchParams, setSearchParams] = useSearchParams();
  const { client, isLoading: isClientLoading, fetchClient } = useClientDetail(clientId || '');
  const {
    history,
    types: historyTypes,
    setTypes: setHistoryTypes,
    isLoading: isHistoryLoading,
    isLoadingMore: isLoadingMoreHistory,
    error: historyError,
    fetchHistory,
    loadMore: loadMoreHistory,
  } = useClientHistory(clientId || '');
  const { customFields, outcomeCategories, fetchSettings } = useClientSettings();
  const { addInteraction, isLoading: isAddingInteraction } = useAddInteraction();
  const { appointments, isLoading: isAppointmentsLoading, updateAppointmentLocally, fetchClientAppointments } = useClientAppointments(clientId || '');
  // Staff list resolves assignedUserId to a name. Only fetchStaff is called;
  // pending invitations are a Business-Owner-only endpoint.
  const { staff, fetchStaff } = useTeam();

  const [activeTab, setActiveTab] = useState<'timeline' | 'appointments' | 'contracts'>('timeline');
  // FR-RBAC-07: a role without contract validity (Reception, once UAT-3 removes
  // it) gets no tab, rather than one whose request is refused.
  const canSeeContracts = usePermission('contracts.validity.view');
  const shownTab = activeTab === 'contracts' && !canSeeContracts ? 'timeline' : activeTab;
  const [isInteractionSlideOverOpen, setIsInteractionSlideOverOpen] = useState(false);
  const [isAppointmentSlideOverOpen, setIsAppointmentSlideOverOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  
  const [interactionChannel, setInteractionChannel] = useState('NOTE');
  const [interactionContent, setInteractionContent] = useState('');
  const [interactionOutcomeId, setInteractionOutcomeId] = useState('');

  /*
   * `?logInteraction=<channel>` opens the interaction slide-over on arrival —
   * the tail of the staff dashboard's "Log note" quick action, which cannot
   * name a client itself and so routes through the client list. The param is
   * stripped once consumed (replace: true) so a refresh or a Back does not
   * reopen a panel the user already dismissed.
   */
  useEffect(() => {
    const channel = searchParams.get('logInteraction');
    if (!channel) return;
    setInteractionChannel(channel);
    setIsInteractionSlideOverOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('logInteraction');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleAddInteraction = async () => {
    if (!clientId || !interactionContent) return;
    await addInteraction(clientId, {
      channel: interactionChannel,
      content: interactionContent,
      outcomeCategoryId: interactionOutcomeId || undefined
    });
    setInteractionContent('');
    setIsInteractionSlideOverOpen(false);
    fetchHistory();
  };


  const handleAppointmentUpdated = (updated: Appointment) => {
    updateAppointmentLocally(updated);
    setSelectedAppointment(updated);
    fetchHistory(); // Refresh timeline when an appointment status changes
  };

  useEffect(() => {
    fetchClient();
    fetchSettings();
    fetchStaff();
  }, [fetchClient, fetchSettings, fetchStaff]);

  // Separate so a filter change refetches the timeline alone.
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (isClientLoading) return <div className={styles.container}>{t('detail.loading')}</div>;
  if (!client) return <div className={styles.container}>{t('detail.notFound')}</div>;

  // ASSIGNEE / PRIMARY_EMAIL / PRIMARY_PHONE already have specialized
  // rendering in the Key Contact card above (server-resolved onto
  // client.assignedUserId / client.contactInfo); everything else — including
  // PRIMARY_NAME, STATUS, and true custom fields — goes in the About card.
  const aboutFields = customFields.filter(
    (field) => field.role !== 'ASSIGNEE' && field.role !== 'PRIMARY_EMAIL' && field.role !== 'PRIMARY_PHONE'
  );

  return (
    <div className={styles.container}>
      {showDuplicateNameWarning && (
        <div className={styles.duplicateNameNotice} role="status">
          {t('detail.duplicateNameWarning')}
        </div>
      )}

      {/* Header section */}
      <div className={styles.headerArea}>
        <div className={styles.breadcrumbs}>
          <span className={styles.breadcrumbLink}>{t('breadcrumb')}</span>
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          <span className={styles.breadcrumbCurrent}>{client.name}</span>
        </div>

        <div className={styles.headerMain}>
          <div className={styles.headerLeft}>
            <div className={styles.companyLogo}>
              <span className={styles.companyInitials}>{(client.name || 'Client').substring(0, 2).toUpperCase()}</span>
            </div>
            <div className={styles.companyInfo}>
              <div className={styles.companyTitleRow}>
                <h1 className={styles.companyName}>{client.name}</h1>
                <Badge variant="primary">{statusLabel.client(client.status)}</Badge>
              </div>
              <p className={styles.companySubtitle}>
                {client.contactInfo?.email} {client.contactInfo?.phone ? `· ${client.contactInfo.phone}` : ''}
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            {/* FR-SCR-01: the script is at hand on the company page, as in the header. */}
            <SalesScriptButton outline className={styles.iconButton} />
            <Button
              variant="outline"
              className={styles.iconButton}
              aria-label={t('detail.editAria')}
              onClick={() => navigate(`/${tenantSlug}/clients/${clientId}/edit`)}
            >
              <Edit3 size={18} />
            </Button>
            {client.contactInfo?.email && (
              <Button
                variant="outline"
                className={styles.iconButton}
                aria-label={t('detail.emailAria')}
                onClick={() => window.location.assign(`mailto:${client.contactInfo?.email}`)}
              >
                <Mail size={18} />
              </Button>
            )}
            <DropdownMenu
              align="right"
              trigger={
                <Button variant="outline" className={styles.iconButton} aria-label={t('detail.moreAria')}>
                  <MoreVertical size={18} />
                </Button>
              }
              items={[
                {
                  id: 'edit',
                  label: t('detail.editClient'),
                  icon: <Edit3 size={16} />,
                  onClick: () => navigate(`/${tenantSlug}/clients/${clientId}/edit`),
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className={styles.gridContainer}>
        {/* Left Column */}
        <div className={styles.leftColumn}>
          {/* Key Contact Card */}
          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.keyContact')}</h2>
            <div className={styles.contactDetails}>
              <Avatar
                size="lg"
                fallback={getStaffInitials(findPersonById(staff, client.assignedUserId))}
                className={styles.contactAvatar}
              />
              <div className={styles.contactInfo}>
                <h3 className={styles.contactName}>
                  {getStaffDisplayName(findPersonById(staff, client.assignedUserId))}
                </h3>
                <p className={styles.contactTitle}>{t('detail.assignedUser')}</p>
              </div>
            </div>
            <div className={styles.contactActions}>
              {client.contactInfo?.email && (
                <a href={`mailto:${client.contactInfo.email}`} className={styles.contactLink}>
                  <Mail size={16} /> {client.contactInfo.email}
                </a>
              )}
              {client.contactInfo?.phone && (
                <a href={`tel:${client.contactInfo.phone}`} className={styles.contactLink}>
                  <Phone size={16} /> {client.contactInfo.phone}
                </a>
              )}
            </div>
          </Card>

          {/* Company profile (Slice 11: FR-CMP-01, 02, 03) */}
          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.profile.title')}</h2>
            <div className={styles.fieldsList}>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.businessType')}</span>
                <span className={styles.fieldValue}>
                  {client.profile?.businessType ? lookupLabel(client.profile.businessType, i18n.language) : t('detail.profile.none')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.riskLevel')}</span>
                <span className={styles.fieldValue}>
                  <RiskBadge risk={client.profile?.riskLevel ?? null} />
                  {!client.profile?.riskLevel && t('detail.profile.none')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.employeeCount')}</span>
                <span className={styles.fieldValue}>{client.profile?.employeeCount ?? t('detail.profile.none')}</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.area')}</span>
                <span className={styles.fieldValue}>
                  {client.profile?.area ? lookupLabel(client.profile.area, i18n.language) : t('detail.profile.none')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.city')}</span>
                <span className={styles.fieldValue}>
                  {client.profile?.city ? lookupLabel(client.profile.city, i18n.language) : t('detail.profile.none')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.streetAddress')}</span>
                <span className={styles.fieldValue}>{client.profile?.streetAddress ?? t('detail.profile.none')}</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.taxId')}</span>
                <span className={styles.fieldValue}>{client.profile?.taxId ?? t('detail.profile.none')}</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('detail.profile.website')}</span>
                <span className={styles.fieldValue}>
                  {client.profile?.website ? (
                    <a href={client.profile.website} target="_blank" rel="noreferrer">
                      {client.profile.website}
                    </a>
                  ) : (
                    t('detail.profile.none')
                  )}
                </span>
              </div>
            </div>
          </Card>

          {/* Contact persons (Slice 12: FR-CMP-04) */}
          <Card padding="lg">
            <h2 className={styles.cardTitle}>{t('detail.contacts.title')}</h2>
            <div className={styles.contactsList}>
              {(client.contacts ?? []).map((contact) => (
                <div key={contact.id} className={styles.contactCard}>
                  <div className={styles.contactCardHeader}>
                    <span className={styles.contactName}>{contact.name}</span>
                    {contact.isPrimary && <Badge variant="primary">{t('detail.contacts.primary')}</Badge>}
                  </div>
                  {contact.position && <p className={styles.contactTitle}>{contact.position}</p>}
                  <div className={styles.contactActions}>
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className={styles.contactLink}>
                        <Phone size={16} /> {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className={styles.contactLink}>
                        <Mail size={16} /> {contact.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {(client.contacts ?? []).length === 0 && (
                <p className={styles.fieldValue}>{t('detail.contacts.none')}</p>
              )}
            </div>
          </Card>

          {/* About Card — every field not already rendered above via its role */}
          <Card padding="lg" className={styles.customFieldsCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{t('detail.about')}</h2>
              <button
                className={styles.settingsButton}
                onClick={() => navigate(`/${tenantSlug}/settings/client-management`)}
                aria-label={t('detail.customFieldSettingsAria')}
              >
                <Settings size={16} />
              </button>
            </div>
            <div className={styles.fieldsList}>
              {aboutFields.map((field) => (
                <div key={field.id} className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{field.fieldName}</span>
                  <span className={styles.fieldValue}>
                    {formatCustomFieldValue(client.customFieldValues?.[field.fieldName], {
                      yes: t('detail.yes'),
                      no: t('detail.no'),
                    })}
                  </span>
                </div>
              ))}
              {aboutFields.length === 0 && (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldValue}>{t('detail.noCustomFields')}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Internal Notes — workspace-private, never shown to the client on
              quotations, invoices or any customer-facing page. */}
          <Card padding="lg">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{t('detail.internalNotes')}</h2>
            </div>
            {client.notes?.trim() ? (
              <p className={styles.notesBody}>{client.notes}</p>
            ) : (
              <p className={styles.notesEmpty}>{t('detail.noNotesYet')}</p>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <div className={styles.rightColumn}>
          <Tabs
            className={styles.tabsContainer}
            label={t('detail.sectionsLabel')}
            activeId={shownTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'timeline', label: t('detail.tabTimeline'), count: history?.timeline.length },
              { id: 'appointments', label: t('detail.tabAppointments'), count: appointments.length },
              // No count: the contracts tab loads its own data lazily, and a
              // count here would mean fetching every client's contracts on
              // every client page whether or not anyone opens the tab.
              ...(canSeeContracts ? [{ id: 'contracts' as const, label: t('detail.tabContracts') }] : []),
            ]}
          />

          {shownTab === 'contracts' ? (
            <ClientContractsTab clientId={clientId || ''} />
          ) : shownTab === 'timeline' ? (
            <Card padding="lg" className={styles.timelineCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('detail.timeline.title')}</h2>
              </div>

            <div className={styles.logActivityRow}>
              <Button variant="outline" className={styles.logActivityButton} onClick={() => { setInteractionChannel('CALL'); setIsInteractionSlideOverOpen(true); }}>
                <PhoneCall size={16} /> {t('detail.logCall')}
              </Button>
              <Button variant="outline" className={styles.logActivityButton} onClick={() => { setInteractionChannel('EMAIL'); setIsInteractionSlideOverOpen(true); }}>
                <Mail size={16} /> {t('detail.logEmail')}
              </Button>
              <Button variant="outline" className={styles.logActivityButton} onClick={() => { setInteractionChannel('MEETING'); setIsInteractionSlideOverOpen(true); }}>
                <Video size={16} /> {t('detail.logMeeting')}
              </Button>
              <Button variant="outline" className={styles.logActivityButton} onClick={() => { setInteractionChannel('NOTE'); setIsInteractionSlideOverOpen(true); }}>
                <FileText size={16} /> {t('detail.logNote')}
              </Button>
            </div>

            <CompanyTimeline
              history={history}
              types={historyTypes}
              onTypesChange={setHistoryTypes}
              isLoading={isHistoryLoading}
              isLoadingMore={isLoadingMoreHistory}
              error={historyError}
              onLoadMore={loadMoreHistory}
            />
          </Card>
          ) : (
            <Card padding="lg">
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('detail.appointments')}</h2>
                <Button variant="primary" icon={<Calendar size={16} />} onClick={() => setIsAppointmentSlideOverOpen(true)}>
                  {t('detail.newAppointment')}
                </Button>
              </div>
              <div className={styles.appointmentList}>
                {isAppointmentsLoading && (
                  <div className={styles.emptyMessage}>{t('detail.loadingAppointments')}</div>
                )}
                {!isAppointmentsLoading && appointments.length === 0 && (
                  <div className={styles.emptyMessage}>{t('detail.noAppointments')}</div>
                )}
                {!isAppointmentsLoading && appointments.map(app => (
                  <button
                    key={app.id}
                    type="button"
                    className={styles.appointmentRow}
                    onClick={() => setSelectedAppointment(app)}
                  >
                    <div className={styles.appointmentInfo}>
                      <span className={styles.appointmentDate}>
                        {dates.dateTime(app.scheduledAt)}
                      </span>
                      <span className={styles.appointmentNotes}>{app.notes || t('detail.noNotes')}</span>
                    </div>
                    <Badge variant={getAppointmentStatusVariant(app.status)}>{statusLabel.appointment(app.status)}</Badge>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <SlideOver
        isOpen={isInteractionSlideOverOpen}
        onClose={() => setIsInteractionSlideOverOpen(false)}
        title={t('detail.addInteraction')}
        footer={
          <div className={styles.slideOverFooter}>
            <Button variant="outline" onClick={() => setIsInteractionSlideOverOpen(false)}>{tc('actions.cancel')}</Button>
            <Button onClick={handleAddInteraction} disabled={isAddingInteraction || !interactionContent}>
              {isAddingInteraction ? tc('state.saving') : t('detail.saveInteraction')}
            </Button>
          </div>
        }
      >
        <div className={styles.slideOverForm}>
          <SelectInput label={t('detail.channel')} value={interactionChannel} onChange={e => setInteractionChannel(e.target.value)}>
            <option value="CALL">{t('detail.channels.CALL')}</option>
            <option value="EMAIL">{t('detail.channels.EMAIL')}</option>
            <option value="MEETING">{t('detail.channels.MEETING')}</option>
            <option value="NOTE">{t('detail.channels.NOTE')}</option>
          </SelectInput>
          <TextareaInput 
            label={t('detail.notes')}
            placeholder={t('detail.notesPlaceholder')}
            rows={5}
            value={interactionContent}
            onChange={e => setInteractionContent(e.target.value)}
          />
          {outcomeCategories && outcomeCategories.length > 0 && (
            <SelectInput label={t('detail.outcome')} value={interactionOutcomeId} onChange={e => setInteractionOutcomeId(e.target.value)}>
              <option value="">{t('detail.noOutcome')}</option>
              {outcomeCategories.map(oc => (
                <option key={oc.id} value={oc.id}>{oc.label}</option>
              ))}
            </SelectInput>
          )}
        </div>
      </SlideOver>

      <SlideOver
        isOpen={isAppointmentSlideOverOpen}
        onClose={() => setIsAppointmentSlideOverOpen(false)}
        title={t('detail.scheduleAppointment')}
      >
        <div className={styles.slideOverBody}>
          <AppointmentForm
            lockedClientId={clientId}
            onSubmit={() => {
              setIsAppointmentSlideOverOpen(false);
              fetchClientAppointments();
              fetchHistory();
            }}
            onCancel={() => setIsAppointmentSlideOverOpen(false)}
          />
        </div>
      </SlideOver>

      <AppointmentDetailPanel
        isOpen={!!selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        appointment={selectedAppointment}
        onAppointmentUpdated={handleAppointmentUpdated}
      />
    </div>
  );
};
