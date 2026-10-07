import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';
import { memberVipService, vipRefusalOf } from '../../services/memberVipService';
import type { MemberDetail, VipRequest } from '../../services/memberService';
import { VipDecisionDialog } from './VipDecisionDialog';
import styles from './Members.module.css';

interface Props {
  tenantSlug: string;
  member: MemberDetail;
  canManage: boolean;
  canApprove: boolean;
  onChanged: () => void;
}

type ReasonDialog = 'request' | 'end';

/**
 * The VIP section of the member page (FR-VIP-01, 02, 05): the requests with their decisions and endings, "Request
 * VIP" for a user who may manage members, and Approve, Reject and End VIP for an approver. An approver cannot decide
 * a request they made themselves, so those buttons are not offered (the server refuses it as well).
 */
export const VipTab: React.FC<Props> = ({ tenantSlug, member, canManage, canApprove, onChanged }) => {
  const { t } = useTranslation('members');
  const dates = useDateFormat();
  const userId = useAuthStore((s) => s.user?.userId);
  const [dialog, setDialog] = useState<ReasonDialog | null>(null);
  const [deciding, setDeciding] = useState<{ request: VipRequest; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stamp = (iso: string) => dates.date(new Date(iso));
  const open = member.vip.requests.find((r) => r.status === 'PENDING') ?? null;
  const isVip = member.vip.reviewDate !== null;

  const close = () => {
    setDialog(null);
    setReason('');
    setError(null);
  };

  const save = async () => {
    if (!dialog) return;
    if (reason.trim() === '') return setError('reason');
    setSaving(true);
    try {
      if (dialog === 'request') await memberVipService.request(tenantSlug, member.id, reason.trim());
      else await memberVipService.end(tenantSlug, member.id, reason.trim());
      close();
      onChanged();
    } catch (err) {
      const refusal = vipRefusalOf(err);
      setError(refusal ? `refused.${refusal}` : 'failed');
    } finally {
      setSaving(false);
    }
  };

  const errorText = (key: string) => (key === 'reason' ? t('vip.reasonRequired') : key.startsWith('refused.') ? t(`vip.${key}`) : t('vip.failed'));

  return (
    <>
      <h2 className={styles.sectionTitle}>{t('vip.title')}</h2>

      {isVip && (
        <p>
          <Crown size={14} aria-hidden /> {t('vip.reviewDate', { date: dates.date(dayAsDate(member.vip.reviewDate!)) })}
        </p>
      )}

      <div className={styles.headerActions}>
        {canManage && member.status !== 'CLOSED' && !open && <Button onClick={() => setDialog('request')}>{t('vip.request')}</Button>}
        {canApprove && isVip && <Button variant="outline" onClick={() => setDialog('end')}>{t('vip.end')}</Button>}
      </div>

      {member.vip.requests.length === 0 ? (
        <p>{t('vip.empty')}</p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('vip.columns.date')}</th>
                <th scope="col">{t('vip.columns.status')}</th>
                <th scope="col">{t('vip.columns.reason')}</th>
                <th scope="col">{t('vip.columns.requestedBy')}</th>
                <th scope="col">{t('vip.columns.decision')}</th>
                {canApprove && <th scope="col" />}
              </tr>
            </thead>
            <tbody>
              {member.vip.requests.map((r) => {
                const own = r.requestedBy.id === userId;
                return (
                  <tr key={r.id}>
                    <td>{stamp(r.createdAt)}</td>
                    <td>
                      <span className={styles.chip}>{t(`vip.status.${r.status}`)}</span>
                      {r.endedAt && <div className={styles.muted}>{t('vip.endedOn', { date: stamp(r.endedAt), name: r.endedBy?.name ?? '—' })}</div>}
                    </td>
                    <td>
                      {r.reason}
                      {r.endReason && <div className={styles.muted}>{t('vip.endReason', { reason: r.endReason })}</div>}
                    </td>
                    <td>{r.requestedBy.name ?? <span className={styles.muted}>—</span>}</td>
                    <td>
                      {r.decidedAt ? (
                        <>
                          {t('vip.decidedBy', { name: r.decidedBy?.name ?? '—', date: stamp(r.decidedAt) })}
                          {r.decisionNote && <div className={styles.muted}>{r.decisionNote}</div>}
                        </>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    {canApprove && (
                      <td>
                        {r.status === 'PENDING' &&
                          (own ? (
                            <span className={styles.muted}>{t('vip.ownRequest')}</span>
                          ) : (
                            <div className={styles.rowActions}>
                              <Button onClick={() => setDeciding({ request: r, decision: 'APPROVE' })}>{t('vip.decide.approve')}</Button>
                              <Button variant="outline" onClick={() => setDeciding({ request: r, decision: 'REJECT' })}>{t('vip.decide.reject')}</Button>
                            </div>
                          ))}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={dialog !== null} onClose={close} title={dialog === 'end' ? t('vip.endDialog.title') : t('vip.requestDialog.title')}>
        <div className={styles.modalBody}>
          <p>{dialog === 'end' ? t('vip.endDialog.help') : t('vip.requestDialog.help')}</p>
          <TextareaInput
            label={t('vip.reason')}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={3}
            error={error === 'reason' ? errorText('reason') : undefined}
          />
          {error && error !== 'reason' && <p className={styles.formError} role="alert">{errorText(error)}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={close}>{t('vip.cancel')}</Button>
            <Button variant={dialog === 'end' ? 'danger' : 'primary'} isLoading={saving} onClick={() => void save()}>
              {dialog === 'end' ? t('vip.endDialog.confirm') : t('vip.requestDialog.confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {deciding && (
        <VipDecisionDialog
          tenantSlug={tenantSlug}
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            onChanged();
          }}
        />
      )}
    </>
  );
};
