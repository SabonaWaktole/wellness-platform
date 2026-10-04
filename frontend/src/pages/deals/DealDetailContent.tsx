import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MoreVertical, Pencil, Phone, RotateCcw, ThumbsDown, Trophy, Trash2, UserRound } from 'lucide-react';
import { Badge } from '../../components/ui/Badge/Badge';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog/ConfirmDialog';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { Modal } from '../../components/ui/Modal/Modal';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { StatusBadge } from '../../components/ui/StatusBadge/StatusBadge';
import { useToast } from '../../components/ui/Toast/toastContext';
import { Can } from '../../components/auth/Can';
import { SalesScriptButton } from '../../components/salesScript/SalesScriptButton';
import { useDealText } from '../../hooks/useDealText';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useTeam } from '../../hooks/useTeam';
import { dealService } from '../../services/dealService';
import { getStaffDisplayName } from '../../utils/userUtils';
import { isOpenStage, OPEN_DEAL_STAGES } from '../../types/deal';
import type { DealDetail, DealStage } from '../../types/deal';
import { dealErrorMessage } from './dealErrors';
import { DealActivitiesSection } from './DealActivitiesSection';
import { DealOffersSection } from './DealOffersSection';
import { LoseDealModal, ReopenDealModal, WinDealModal } from './DealClosingModals';
import { lookupLabel } from '../../utils/lookupLabel';
import { FollowUpsPanel } from '../../components/followUps/FollowUpsPanel';
import styles from './DealDetailContent.module.css';

/**
 * The deal page (FR-DEAL-03): company, contact persons, stage, value,
 * salesperson, expected close, notes and the stage history (FR-DEAL-09) on
 * one page, with the sales script button, the deal's offers (Slice 8), its
 * activities (Slice 7) and its follow-ups (Slice 11).
 */
export const DealDetailContent: React.FC = () => {
  const { t, i18n } = useTranslation('deals');
  const { t: tc } = useTranslation('common');
  const { tenantSlug, dealId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const statusLabel = useStatusLabel();
  const text = useDealText();
  const dates = useDateFormat();
  const money = useMoneyFormat();
  const canEdit = usePermission('deals.edit');
  const canReassign = usePermission('companies.reassign');
  const canDelete = usePermission('deals.delete');
  const canReopen = usePermission('deals.reopen');
  const { staff, fetchStaff } = useTeam();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loadError, setLoadError] = useState<'notFound' | 'failed' | null>(null);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [closing, setClosing] = useState<'win' | 'lose' | 'reopen' | null>(null);
  const [winOfferId, setWinOfferId] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!tenantSlug || !dealId) return;
    try {
      setDeal(await dealService.get(tenantSlug, dealId));
      setLoadError(null);
    } catch (error) {
      setLoadError((error as { response?: { status?: number } })?.response?.status === 404 ? 'notFound' : 'failed');
    }
  }, [tenantSlug, dealId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (canReassign) fetchStaff();
  }, [canReassign, fetchStaff]);

  if (loadError) {
    return (
      <div className={styles.container}>
        <Link className={styles.back} to={`/${tenantSlug}/pipeline`}>
          <ArrowLeft size={16} aria-hidden="true" /> {t('detail.back')}
        </Link>
        <p className={styles.message}>{loadError === 'notFound' ? t('detail.notFound') : t('detail.loadFailed')}</p>
      </div>
    );
  }
  if (!deal) return <p className={styles.message}>{tc('state.loading')}</p>;

  const open = isOpenStage(deal.stage);
  const closedOn = (deal.stage === 'WON' ? deal.wonAt : deal.lostAt) ?? deal.closedAt;

  const moveTo = async (stage: DealStage) => {
    if (!tenantSlug || stage === deal.stage) return;
    try {
      setDeal(await dealService.changeStage(tenantSlug, deal.id, stage));
      toast.success(t('detail.moved', { stage: statusLabel.deal(stage) }));
    } catch (error) {
      toast.error(dealErrorMessage(error, t));
    }
  };

  const reassign = async () => {
    if (!tenantSlug || !newOwner) return;
    setIsSaving(true);
    try {
      const updated = await dealService.reassign(tenantSlug, deal.id, newOwner);
      setDeal(updated);
      setIsReassignOpen(false);
      toast.success(t('detail.reassigned', { name: updated.ownerName }));
    } catch (error) {
      toast.error(dealErrorMessage(error, t));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!tenantSlug) return;
    try {
      await dealService.remove(tenantSlug, deal.id);
      toast.success(t('detail.deleted'));
      navigate(`/${tenantSlug}/pipeline`);
    } catch (error) {
      toast.error(dealErrorMessage(error, t));
      setIsDeleteOpen(false);
    }
  };

  const title = text.title(deal);

  return (
    <div className={styles.container}>
      <Link className={styles.back} to={`/${tenantSlug}/pipeline`}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('detail.back')}
      </Link>

      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.subtitle}>
            <Link to={`/${tenantSlug}/clients/${deal.clientId}`}>{deal.companyName}</Link>
            <span aria-hidden="true">·</span>
            <span>{statusLabel.dealType(deal.type)}</span>
            <StatusBadge domain="deal" status={deal.stage} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <SalesScriptButton outline />
          {canEdit && open && (
            <>
              <Button variant="success" icon={<Trophy size={16} />} onClick={() => { setWinOfferId(undefined); setClosing('win'); }}>
                {t('win.action')}
              </Button>
              <Button variant="outline" icon={<ThumbsDown size={16} />} onClick={() => setClosing('lose')}>
                {t('lose.action')}
              </Button>
            </>
          )}
          {canReopen && !open && (
            <Button variant="outline" icon={<RotateCcw size={16} />} onClick={() => setClosing('reopen')}>
              {t('reopen.action')}
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" icon={<Pencil size={16} />} onClick={() => navigate(`/${tenantSlug}/deals/${deal.id}/edit`)}>
              {t('detail.edit')}
            </Button>
          )}
          {canDelete && (
            <DropdownMenu
              align="right"
              trigger={
                <Button variant="outline" aria-label={t('detail.actions')}>
                  <MoreVertical size={18} aria-hidden="true" />
                </Button>
              }
              items={[{ id: 'delete', label: t('detail.delete'), icon: <Trash2 size={16} />, danger: true, onClick: () => setIsDeleteOpen(true) }]}
            />
          )}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card padding="lg">
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>{t('detail.stage')}</dt>
                <dd>
                  {canEdit && open ? (
                    <SelectInput aria-label={t('detail.moveTo')} value={deal.stage} onChange={(e) => moveTo(e.target.value as DealStage)}>
                      {OPEN_DEAL_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {statusLabel.deal(stage)}
                        </option>
                      ))}
                    </SelectInput>
                  ) : (
                    <StatusBadge domain="deal" status={deal.stage} />
                  )}
                </dd>
              </div>
              {/* Absent without commercial.view (FR-RBAC-17); null until the deal has a priced offer. */}
              {deal.netMonthlyPrice !== undefined && (
                <div className={styles.fact}>
                  <dt>{t('detail.value')}</dt>
                  <dd>
                    {deal.netMonthlyPrice === null ? (
                      <span className={styles.muted}>{t('detail.valueNone')}</span>
                    ) : (
                      <>
                        <span className={styles.value}>{t('perMonth', { amount: money.format(Number(deal.netMonthlyPrice)) })}</span>
                        {deal.annualValue != null && (
                          <span className={styles.muted}>{t('perYear', { amount: money.format(Number(deal.annualValue)) })}</span>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              )}
              <div className={styles.fact}>
                <dt>{t('detail.salesperson')}</dt>
                <dd className={styles.ownerRow}>
                  <span>{deal.ownerName}</span>
                  {canReassign && canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNewOwner('');
                        setIsReassignOpen(true);
                      }}
                    >
                      {t('detail.reassign')}
                    </Button>
                  )}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>{t('detail.expectedClose')}</dt>
                <dd>{text.calendarDate(deal.expectedCloseDate) ?? <span className={styles.muted}>{t('detail.notSet')}</span>}</dd>
              </div>
            </dl>
          </Card>

          {!open && (
            <Card padding="lg">
              <h2 className={styles.sectionTitle}>{deal.stage === 'WON' ? t('result.wonTitle') : t('result.lostTitle')}</h2>
              <dl className={styles.facts}>
                {closedOn && (
                  <div className={styles.fact}>
                    <dt>{t('result.closingDate')}</dt>
                    <dd>{dates.dateTime(closedOn)}</dd>
                  </div>
                )}
                {deal.stage === 'WON' ? (
                  <>
                    {deal.agreedMonthlyPrice != null && (
                      <div className={styles.fact}>
                        <dt>{t('result.agreedMonthly')}</dt>
                        <dd>{t('perMonth', { amount: money.format(Number(deal.agreedMonthlyPrice)) })}</dd>
                      </div>
                    )}
                    {deal.agreedAnnualValue != null && (
                      <div className={styles.fact}>
                        <dt>{t('result.agreedAnnual')}</dt>
                        <dd>{t('perYear', { amount: money.format(Number(deal.agreedAnnualValue)) })}</dd>
                      </div>
                    )}
                    {deal.packageNameSq && (
                      <div className={styles.fact}>
                        <dt>{t('result.package')}</dt>
                        <dd>{lookupLabel({ nameSq: deal.packageNameSq, nameEn: deal.packageNameEn }, i18n.language)}</dd>
                      </div>
                    )}
                    {deal.wonQuotationReference && (
                      <div className={styles.fact}>
                        <dt>{t('result.offer')}</dt>
                        <dd>{deal.wonQuotationReference}</dd>
                      </div>
                    )}
                    <div className={styles.fact}>
                      <dt>{t('detail.salesperson')}</dt>
                      <dd>{deal.ownerName}</dd>
                    </div>
                  </>
                ) : (
                  <>
                    {deal.lostReasonSq && (
                      <div className={styles.fact}>
                        <dt>{t('result.reason')}</dt>
                        <dd>{lookupLabel({ nameSq: deal.lostReasonSq, nameEn: deal.lostReasonEn }, i18n.language)}</dd>
                      </div>
                    )}
                    {deal.lostNote && (
                      <div className={styles.fact}>
                        <dt>{t('result.note')}</dt>
                        <dd>{deal.lostNote}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </Card>
          )}

          <Card padding="lg">
            <h2 className={styles.sectionTitle}>{t('detail.contacts')}</h2>
            {deal.contacts.length === 0 ? (
              <p className={styles.muted}>{t('detail.noContacts')}</p>
            ) : (
              <ul className={styles.contacts}>
                {deal.contacts.map((contact) => (
                  <li key={contact.id} className={styles.contact}>
                    <UserRound size={18} aria-hidden="true" className={styles.contactIcon} />
                    <div className={styles.contactText}>
                      <span className={styles.contactName}>
                        {contact.name}
                        {contact.isPrimary && <Badge variant="outline">{t('detail.primary')}</Badge>}
                      </span>
                      {contact.position && <span className={styles.muted}>{contact.position}</span>}
                      <span className={styles.contactWays}>
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`}>
                            <Phone size={14} aria-hidden="true" /> {contact.phone}
                          </a>
                        )}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`}>
                            <Mail size={14} aria-hidden="true" /> {contact.email}
                          </a>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="lg">
            <h2 className={styles.sectionTitle}>{t('detail.notes')}</h2>
            {deal.notes ? <p className={styles.notes}>{deal.notes}</p> : <p className={styles.muted}>{t('detail.noNotes')}</p>}
          </Card>
        </div>

        <div className={styles.column}>
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>{t('detail.history')}</h2>
            <ol className={styles.history} aria-label={t('detail.history')}>
              {[...deal.history].reverse().map((change) => (
                <li key={change.id} className={styles.historyItem}>
                  <span className={styles.historyChange}>
                    {change.fromStage
                      ? t('detail.historyChange', { from: statusLabel.deal(change.fromStage), to: statusLabel.deal(change.toStage) })
                      : t('detail.historyOpened', { to: statusLabel.deal(change.toStage) })}
                  </span>
                  <span className={styles.muted}>
                    {t('detail.historyBy', { date: dates.dateTime(change.at), actor: change.changedByName ?? t('detail.automatic') })}
                  </span>
                  {change.note && <span className={styles.muted}>{t('detail.historyNote', { note: change.note })}</span>}
                </li>
              ))}
            </ol>
          </Card>

          <DealOffersSection
            deal={deal}
            onDealChanged={load}
            onCanWin={(offerId) => {
              setWinOfferId(offerId);
              setClosing('win');
            }}
          />
          <DealActivitiesSection deal={deal} onDealChanged={load} />
          {/* FR-DEAL-03, FR-FUP-01: the deal's follow-ups (Slice 11). */}
          <FollowUpsPanel
            clientId={deal.clientId}
            dealId={deal.id}
            canSchedule={open}
            onChanged={load}
            titleClassName={styles.sectionTitle}
            headerClassName={styles.sectionHeader}
          />
        </div>
      </div>

      {tenantSlug && (
        <>
          <WinDealModal tenantSlug={tenantSlug} deal={deal} offerId={winOfferId} isOpen={closing === 'win'} onClose={() => setClosing(null)} onDone={(won) => { setDeal(won); setClosing(null); }} />
          <LoseDealModal tenantSlug={tenantSlug} deal={deal} isOpen={closing === 'lose'} onClose={() => setClosing(null)} onDone={(lost) => { setDeal(lost); setClosing(null); }} />
          <ReopenDealModal tenantSlug={tenantSlug} deal={deal} isOpen={closing === 'reopen'} onClose={() => setClosing(null)} onDone={(reopened) => { setDeal(reopened); setClosing(null); }} />
        </>
      )}

      <Modal isOpen={isReassignOpen} onClose={() => setIsReassignOpen(false)} title={t('detail.reassignTitle')} maxWidth="sm">
        <div className={styles.modalBody}>
          <SelectInput aria-label={t('detail.reassignLabel')} label={t('detail.reassignLabel')} value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
            <option value="" disabled>
              —
            </option>
            {staff
              .filter((member) => member.isActive !== false && member.id !== deal.ownerUserId)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {getStaffDisplayName(member)}
                </option>
              ))}
          </SelectInput>
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={() => setIsReassignOpen(false)}>
              {t('form.cancel')}
            </Button>
            <Button variant="primary" onClick={reassign} disabled={!newOwner} isLoading={isSaving}>
              {t('detail.reassignConfirm')}
            </Button>
          </div>
        </div>
      </Modal>

      <Can permission="deals.delete">
        <ConfirmDialog
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={remove}
          title={t('detail.deleteTitle')}
          message={t('detail.deleteMessage')}
          confirmLabel={t('detail.delete')}
          tone="danger"
        />
      </Can>
    </div>
  );
};
