import { useTranslation } from 'react-i18next';
import { useDateFormat } from './useDateFormat';
import { useStatusLabel } from './useStatusLabel';
import type { DealSummary } from '../types/deal';

/**
 * How a deal reads on screen (M2 Slice 6). A deal with no title of its own
 * shows the default "<company> – <type>" (FR-DEAL-01), in the reader's
 * language, which is why the server stores no title for it.
 */
export function useDealText() {
  const { t } = useTranslation('deals');
  const statusLabel = useStatusLabel();
  const dates = useDateFormat();

  return {
    title: (deal: Pick<DealSummary, 'title' | 'companyName' | 'type'>) =>
      deal.title ?? t('defaultTitle', { company: deal.companyName, type: statusLabel.dealType(deal.type) }),
    /**
     * A calendar date (`YYYY-MM-DD`) in the workspace's format. Read at noon
     * UTC so no time zone between UTC−11 and UTC+11 moves it to another day.
     */
    calendarDate: (value: string | null) => (value ? dates.date(`${value}T12:00:00Z`) : null),
  };
}
