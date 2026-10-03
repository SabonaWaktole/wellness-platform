import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Briefcase, Calculator, Pencil } from 'lucide-react';
import { Badge } from '../../components/ui/Badge/Badge';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { dealService } from '../../services/dealService';
import { isOpenStage, type DealDetail } from '../../types/deal';
import type { OfferView } from '../../types/offer';
import { lookupLabel } from '../../utils/lookupLabel';
import styles from './DealDetailContent.module.css';

/**
 * The deal page's offers (FR-DEAL-03, M2 Slice 8): each offer's status, net
 * monthly price, list price and discount, package and note, newest first.
 * The figures are commercial, so the section reads nothing without
 * `commercial.view` (FR-RBAC-17). Prices are made and changed only on the
 * pricing screen (FR-OFR-03), opened from here on an open deal.
 */
export const DealOffersSection: React.FC<{ deal: DealDetail }> = ({ deal }) => {
  const { t, i18n } = useTranslation('deals');
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
  const hasDraft = offers?.some((offer) => offer.status === 'DRAFT') ?? false;
  const openPricing = () => navigate(`/${tenantSlug}/deals/${deal.id}/pricing`);

  return (
    <Card padding="lg">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Briefcase size={18} />
          </span>
          {t('detail.offers')}
        </h2>
        {canPrice && canSeeOffers && offers && !hasDraft && (
          <Button variant="outline" size="sm" icon={<Calculator size={16} />} onClick={openPricing}>
            {t('offers.calculate')}
          </Button>
        )}
      </div>

      {!canSeeOffers && <p className={styles.muted}>{t('offers.hidden')}</p>}
      {canSeeOffers && loadFailed && <p className={styles.muted}>{t('offers.loadFailed')}</p>}
      {canSeeOffers && !offers && !loadFailed && <p className={styles.muted}>{tc('state.loading')}</p>}
      {offers?.length === 0 && <p className={styles.muted}>{t('offers.none')}</p>}

      {offers && offers.length > 0 && (
        <ol className={styles.activities} aria-label={t('detail.offers')}>
          {offers.map((offer) => {
            const pkg = offer.pricingInputs?.package;
            return (
              <li key={offer.id} className={styles.activityItem}>
                <div className={styles.activityHeader}>
                  <Badge variant={offer.status === 'DRAFT' ? 'outline' : 'secondary'}>
                    {t(`offers.status.${offer.status}`, { defaultValue: offer.status })}
                  </Badge>
                  <span className={styles.muted}>
                    {t('offers.updated', { date: dates.dateTime(offer.updatedAt), actor: offer.createdByName })}
                  </span>
                </div>
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
                {canPrice && offer.status === 'DRAFT' && (
                  <div>
                    <Button variant="ghost" size="sm" icon={<Pencil size={16} />} onClick={openPricing}>
                      {t('offers.edit')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};
