import { Money } from '../../pricing/domain/Money';
import { DealStage, OPEN_DEAL_STAGES } from '../../deals/domain/DealStage';

/**
 * The dashboard figures of SRS §5.3 that are not salesperson indicators, as pure functions (M3 plan
 * D10, rule 4). The conversion rate, the sales value and the other period figures come from
 * `KpiDefinitions`; the data layer only reads the rows these work on, so each definition is tested
 * on a fixed set of data (NFR-ACC-04).
 */

/** A lead is an open deal still in New Lead or Contacted (Q14). */
export const LEAD_STAGES: readonly string[] = [DealStage.NewLead, DealStage.Contacted];

export const isLead = (stageKey: string): boolean => LEAD_STAGES.includes(stageKey);

/** An open deal and what it is worth: the annual value of its latest offer, `null` when it has none (Q14). */
export interface OpenDeal {
  ownerId: string;
  stageKey: string;
  annualValue: Money | null;
}

export interface StageTotal {
  stage: string;
  count: number;
  /** Zero for a deal with no offer yet: it counts in the number and adds nothing to the value. */
  value: Money;
}

/** Count and value per open stage, every open stage present and in pipeline order (FR-DSH-09, 10). */
export function pipelineByStage(deals: readonly OpenDeal[]): StageTotal[] {
  const totals = new Map<string, StageTotal>(OPEN_DEAL_STAGES.map((stage) => [stage, { stage, count: 0, value: Money.zero() }]));
  for (const deal of deals) {
    const total = totals.get(deal.stageKey);
    if (!total) continue; // Won and Lost are not pipeline.
    total.count += 1;
    if (deal.annualValue) total.value = total.value.add(deal.annualValue);
  }
  return [...totals.values()];
}

export const pipelineTotal = (stages: readonly StageTotal[]): { count: number; value: Money } => ({
  count: stages.reduce((sum, stage) => sum + stage.count, 0),
  value: stages.reduce((sum, stage) => sum.add(stage.value), Money.zero()),
});

export const leadCount = (deals: readonly OpenDeal[]): number => deals.filter((deal) => isLead(deal.stageKey)).length;

/** A deal lost in the period, with its predefined reason and the annual value of its latest offer. */
export interface LostDeal {
  reasonId: string | null;
  annualValue: Money | null;
}

export interface LostReasonTotal {
  reasonId: string | null;
  count: number;
  value: Money;
}

/**
 * Lost deals in the period grouped by lost reason, with count and value (§5.3). A deal with no
 * reason (lost before the list existed) is grouped under `null`, so the counts always add up to the
 * number of lost deals (FR-DSH-10). Largest count first, then the larger value.
 */
export function lostAnalysis(deals: readonly LostDeal[]): LostReasonTotal[] {
  const totals = new Map<string | null, LostReasonTotal>();
  for (const deal of deals) {
    const total = totals.get(deal.reasonId) ?? { reasonId: deal.reasonId, count: 0, value: Money.zero() };
    total.count += 1;
    if (deal.annualValue) total.value = total.value.add(deal.annualValue);
    totals.set(deal.reasonId, total);
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || Number(b.value.toString()) - Number(a.value.toString()));
}
