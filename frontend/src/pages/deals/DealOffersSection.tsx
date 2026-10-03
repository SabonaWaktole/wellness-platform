import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Briefcase, Calculator } from 'lucide-react';
import { Badge } from '../../components/ui/Badge/Badge';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { OfferActions } from '../../components/offers/OfferActions';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { dealService } from '../../services/dealService';
import { isOpenStage, type DealDetail } from '../../types/deal';
import type { OfferStatus, OfferView } from '../../types/offer';
import { lookupLabel } from '../../utils/lookupLabel';
import styles from './DealDetailContent.module.css';

/** An offer still being worked on: the pricing screen changes it rather than starting another. */
const IN_PROGRESS: readonly OfferStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'READY', 'SENT'];

const badgeVariant = (status: OfferStatus) =>
  status === 'ACCEPTED' ? 'success' : status === 'REJECTED' || status === 'EXPIRED' ? 'error' : status === 'DRAFT' ? 'outline' : 'secondary';

/** A YYYY-MM-DD day as an instant on that day in any workspace zone. */
const onDay = (day: string) => `${day}T12:00:00.000Z`;

/**
 * The deal page's offers (FR-DEAL-03, M2 Slices 8 and 9): each offer's
 * reference, status, validity, prices, package and note, newest first, with
 * its preview, download and status steps (FR-OFR-05..12). Earlier versions
 * stay listed, read-only (FR-OFR-11). The figures are commercial, so the
 * section reads nothing without `commercial.view` (FR-RBAC-17). Prices are
 * made and changed only on the pricing screen (FR-OFR-03), opened from here
 * on an open deal.
 */
export const DealOffersSection: React.FC<{ deal: DealDetail; onDealChanged?: () => void }> = ({ deal, onDealChanged }) => {
  const { t, i18n } = useTranslation('deals');
  const { t: to } = useTranslation('offers');
  const { t: tc } = useTranslation('common');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const money = useMoneyFormat();
  const canSeeOffers = usePermission('commercial.view');
  const canEditOffers = usePermission('offers.edit');
  const [offers, setOffers] = useState<OfferView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!tenantSlug || !canSeeOffers) return;
    try {
      setOffers(await dealService.offers(tenantSlug, deal.id));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantSlug, deal.id, canSeeOffers]);

  useEffect(() => {
    load();
  }, [load]);

  const canPrice = canEditOffers && isOpenStage(deal.stage);
  const inProgress = offers?.some((offer) => !offer.superseded && IN_PROGRESS.includes(offer.status)) ?? false;
  const openPricing = () => navigate(`/${tenantSlug}/deals/${deal.id}/pricing`);

  const changed = (before: OfferView) => async (after: OfferView) => {
    await load();
    // Marking as sent can move the deal (FR-DEAL-08).
    onDealChanged?.();
    // A new version is priced on the pricing screen (FR-OFR-11).
    if (after.id !== before.id && after.version > before.version) openPricing();
  };

  return (
    <Card padding="lg">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Briefcase size={18} />
          </span>
          {t('detail.offers')}
        </h2>
        {canPrice && canSeeOffers && offers && !inProgress && (
          <Button variant="outline" size="sm" icon={<Calculator size={16} />} onClick={openPricing}>
            {t('offers.calculate')}
          </Button>
        )}
      </div>

      {!canSeeOffers && <p className={styles.muted}>{t('offers.hidden')}</p>}
      {canSeeOffers && loadFailed && <p className={styles.muted}>{t('offers.loadFailed')}</p>}
      {canSeeOffers && !offers && !loadFailed && <p className={styles.muted}>{tc('state.loading')}</p>}
      {offers?.length === 0 && <p className={styles.muted}>{t('offers.none')}</p>}

      {offers && offers.length > 0 && tenantSlug && (
        <ol className={styles.activities} aria-label={t('detail.offers')}>
          {offers.map((offer) => {
            const pkg = offer.pricingInputs?.package;
            return (
              <li key={offer.id} className={styles.activityItem} data-testid={`offer-${offer.id}`}>
                <div className={styles.activityHeader}>
                  <strong>{offer.reference}</strong>
                  <Badge variant={badgeVariant(offer.status)}>{t(`offers.status.${offer.status}`, { defaultValue: offer.status })}</Badge>
                  {offer.superseded && <Badge variant="outline">{to('superseded')}</Badge>}
                  <span className={styles.muted}>
                    {t('offers.updated', { date: dates.dateTime(offer.updatedAt), actor: offer.createdByName })}
                  </span>
                </div>
                {offer.sentAt && (
                  <span className={styles.muted}>
                    {offer.validUntil
                      ? to('sentValid', { sent: dates.date(offer.sentAt), until: dates.date(onDay(offer.validUntil)) })
                      : to('sentOn', { sent: dates.date(offer.sentAt) })}
                  </span>
                )}
                {offer.priceOnRequest ? (
                  <span className={styles.value}>{t('offers.priceOnRequest')}</span>
                ) : (
                  offer.netMonthlyPrice != null && (
                    <>
                      <span className={styles.value}>{t('perMonth', { amount: money.format(Number(offer.netMonthlyPrice)) })}</span>
                      {offer.listPrice != null && (
                        <span className={styles.muted}>
                          {offer.discountPercent && Number(offer.discountPercent) > 0
                            ? t('offers.listWithDiscount', { list: money.format(Number(offer.listPrice)), percent: offer.discountPercent })
                            : t('offers.list', { list: money.format(Number(offer.listPrice)) })}
                        </span>
                      )}
                    </>
                  )
                )}
                {pkg && <span>{lookupLabel(pkg, i18n.language)}</span>}
                {offer.note && <p className={styles.notes}>{offer.note}</p>}
                {offer.statusNote && <p className={styles.notes}>{to('statusNote', { note: offer.statusNote })}</p>}
                <OfferActions tenantSlug={tenantSlug} offer={offer} onChanged={changed(offer)} onEdit={openPricing} />
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};
