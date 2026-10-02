import { ILookupStore } from '../../lookups/application/ports/ILookupStore';
import { LookupList } from '../../lookups/domain/LookupList';
import { BusinessType, RiskLevel } from '../../lookups/domain/LookupItem';
import { riskFor } from '../../clients/domain/services/CompanyRisk';
import { InvalidPricingInputError } from '../domain/errors';
import { Money } from '../domain/Money';
import { Percent } from '../domain/Percent';
import { DiscountResult, PriceCalculator, PricedBreakdown, PriceOnRequestReason } from '../domain/PriceCalculator';
import { PricingConfig } from '../domain/PricingConfig';
import { MAX_EMPLOYEES, PriceZone, PricingList, VisitFrequency } from '../domain/PricingLists';
import { parsePercent, parseWholeNumber } from '../domain/PricingValues';
import { rulesFor } from './pricingAdmin';
import { IPricingStore, PricingSettingsRecord } from './ports/IPricingStore';
import { PricingSubject } from './ports/IPricingSubjectReader';
import { ActivePackage, activePackages } from './use-cases/ListActivePackagesUseCase';
import { LoadPricingConfigUseCase } from './use-cases/LoadPricingConfigUseCase';

/**
 * What the salesperson chose on the pricing screen. Anything left out takes
 * the company's value (FR-PRC-02) or, for the zone of a one-zone city and the
 * package, the obvious one. There is no risk level and no location: both
 * follow the business type and the company's city (FR-PRC-03), and the body
 * never carries an amount (FR-OFR-03).
 */
export interface PricingChoices {
  employees?: unknown;
  businessTypeId?: string | null;
  zoneId?: string | null;
  frequencyId?: string | null;
  packageId?: string | null;
  discountPercent?: unknown;
}

export type PricingInputName = 'employees' | 'zoneId' | 'frequencyId';
export type CompanyField = 'cityId' | 'businessTypeId';

/** The result of one pass of the screen. Only PRICED carries amounts. */
export type PricingOutcome =
  | {
      kind: 'PRICED';
      breakdown: PricedBreakdown;
      discount: DiscountResult;
      /** Net monthly price × contract months (FR-PRC-10). */
      netAnnualValue: Money;
    }
  | { kind: 'PRICE_ON_REQUEST'; reason: PriceOnRequestReason }
  | { kind: 'COMPANY_INCOMPLETE'; missing: CompanyField[] }
  | { kind: 'INPUT_REQUIRED'; missing: PricingInputName[] };

/** Everything the screen shows and the draft offer stores, resolved on the server. */
export interface PricingScreenState {
  subject: PricingSubject;
  settings: PricingSettingsRecord;
  config: PricingConfig;
  employees: number | null;
  businessType: BusinessType | null;
  riskLevel: RiskLevel | null;
  /** The active zones the company's city is in, in their configured order (FR-PRC-06). */
  zones: PriceZone[];
  zone: PriceZone | null;
  /** The active frequencies, in their configured order (FR-PRC-05). */
  frequencies: VisitFrequency[];
  frequency: VisitFrequency | null;
  packages: ActivePackage[];
  package: ActivePackage | null;
  discountPercent: Percent;
  discountAboveCap: boolean;
  outcome: PricingOutcome;
}

/**
 * The pricing screen's one pass (FR-PRC-01..07, 10, 11; FR-DSC-01): resolves
 * the inputs from the company and the salesperson's choices, then prices
 * them with the Slice 1 calculator on the current configuration. It stores
 * nothing; `CalculatePriceUseCase` shows the result and
 * `SaveDraftOfferUseCase` stores it. No permission check: both callers make
 * their own.
 */
export class PricingScreen {
  constructor(
    private readonly store: IPricingStore,
    private readonly lookups: ILookupStore,
    private readonly loadConfig: LoadPricingConfigUseCase
  ) {}

  async resolve(tenantId: string, subject: PricingSubject, choices: PricingChoices): Promise<PricingScreenState> {
    const [settings, config, frequencyRows, zoneRows, packages, businessTypes, riskLevels] = await Promise.all([
      this.store.settings(tenantId),
      this.loadConfig.execute(tenantId),
      this.store.list(tenantId, PricingList.Frequencies),
      this.store.list(tenantId, PricingList.Zones),
      activePackages(this.store, tenantId),
      this.lookups.list(tenantId, LookupList.BusinessTypes) as Promise<BusinessType[]>,
      this.lookups.list(tenantId, LookupList.RiskLevels) as Promise<RiskLevel[]>,
    ]);

    const employees =
      choices.employees === undefined || choices.employees === null
        ? subject.employeeCount
        : parseWholeNumber(choices.employees, 'employees', 1, MAX_EMPLOYEES);

    const businessTypeId = choices.businessTypeId || subject.businessTypeId;
    const businessType = businessTypes.find((bt) => bt.id === businessTypeId) ?? null;
    // An inactive business type stays priceable for the company that has it.
    if (businessTypeId && (!businessType || (!businessType.active && businessType.id !== subject.businessTypeId))) {
      throw new InvalidPricingInputError('businessTypeId', 'Choose an active business type.');
    }
    const riskLevel = riskFor(businessType?.id, businessTypes, riskLevels);

    const zones = (rulesFor(PricingList.Zones).sort(zoneRows) as PriceZone[]).filter(
      (zone) => zone.active && !!subject.city && zone.cityIds.includes(subject.city.id)
    );
    // With no zone to offer (no city, or a city in none) a zone sent is moot, not wrong.
    const zone =
      zones.length === 0
        ? null
        : (pick(zones, choices.zoneId, 'zoneId', "Choose one of the zones of the company's city.") ?? (zones.length === 1 ? zones[0] : null));

    const frequencies = (rulesFor(PricingList.Frequencies).sort(frequencyRows) as VisitFrequency[]).filter((f) => f.active);
    const frequency = pick(frequencies, choices.frequencyId, 'frequencyId', 'Choose an active visit frequency.');

    const pkg = pick(packages, choices.packageId, 'packageId', 'Choose an active package.') ?? packages.find((p) => p.isDefault) ?? null;

    const discountPercent = Percent.of(parsePercent(choices.discountPercent ?? 0, 'discountPercent', 100));

    const state = { subject, settings, config, employees, businessType, riskLevel, zones, zone, frequencies, frequency, packages, package: pkg, discountPercent };
    return {
      ...state,
      discountAboveCap: discountPercent.exceeds(config.discountCap),
      outcome: price(state),
    };
  }
}

/** The item with `id` among those offered, or null when none was chosen. An id not offered is refused. */
function pick<T extends { id: string }>(offered: T[], id: string | null | undefined, field: string, message: string): T | null {
  if (!id) return null;
  const item = offered.find((candidate) => candidate.id === id);
  if (!item) throw new InvalidPricingInputError(field, message);
  return item;
}

type Resolved = Omit<PricingScreenState, 'outcome' | 'discountAboveCap'>;

function price(state: Resolved): PricingOutcome {
  const { subject, config } = state;
  const incomplete: CompanyField[] = [];
  if (!subject.city) incomplete.push('cityId');
  if (!subject.businessTypeId) incomplete.push('businessTypeId');
  if (incomplete.length > 0) return { kind: 'COMPANY_INCOMPLETE', missing: incomplete };

  // A city in no price zone is "Price on request" whatever else is chosen (FR-PRC-07).
  if (state.zones.length === 0) return { kind: 'PRICE_ON_REQUEST', reason: 'NO_ZONE' };

  const missing: PricingInputName[] = [];
  if (state.employees === null) missing.push('employees');
  if (!state.zone) missing.push('zoneId');
  if (!state.frequency) missing.push('frequencyId');
  if (missing.length > 0) return { kind: 'INPUT_REQUIRED', missing };

  const result = PriceCalculator.calculate(
    {
      employees: state.employees!,
      riskLevelId: state.riskLevel?.id ?? '',
      frequencyId: state.frequency!.id,
      zoneId: state.zone!.id,
    },
    config
  );
  if (result.kind === 'PRICE_ON_REQUEST') return result;

  const discount = PriceCalculator.applyDiscount(result.listPrice, state.discountPercent);
  return {
    kind: 'PRICED',
    breakdown: result,
    discount,
    netAnnualValue: discount.netMonthlyPrice.multiplyBy(config.contractMonths),
  };
}
