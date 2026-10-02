import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { InvalidPricingInputError, PricingSubjectNotFoundError } from '../../domain/errors';
import { PriceOnRequestReason } from '../../domain/PriceCalculator';
import { CompanyField, PricingChoices, PricingInputName, PricingScreen, PricingScreenState } from '../PricingScreen';
import { IPricingSubjectReader, PricingLabel, PricingSubject } from '../ports/IPricingSubjectReader';
import { ActivePackage, EDIT_OFFERS } from './ListActivePackagesUseCase';

/** Amounts as strings with two decimals (NFR-ACC-02); the frontend only shows them. */
export type PricingScreenResult =
  | {
      kind: 'PRICED';
      baseFee: string;
      riskFee: string;
      visitFee: string;
      locationFee: string;
      listPrice: string;
      discountPercent: string;
      discountAmount: string;
      netMonthlyPrice: string;
      /** List price ÷ employees (D8, FR-PRC-10). */
      pricePerEmployee: string;
      /** Net monthly price × contract months (FR-PRC-10). */
      annualValue: string;
    }
  | { kind: 'PRICE_ON_REQUEST'; reason: PriceOnRequestReason }
  | { kind: 'COMPANY_INCOMPLETE'; missing: CompanyField[] }
  | { kind: 'INPUT_REQUIRED'; missing: PricingInputName[] };

export interface PricingScreenView {
  subject: {
    clientId: string;
    companyName: string;
    dealId: string | null;
    dealOpen: boolean | null;
    employeeCount: number | null;
    businessTypeId: string | null;
    city: PricingLabel | null;
    area: PricingLabel | null;
  };
  /** The inputs as resolved: the choices made, else the company's values. */
  inputs: {
    employees: number | null;
    businessTypeId: string | null;
    riskLevel: (PricingLabel & { level: number }) | null;
    zoneId: string | null;
    frequencyId: string | null;
    packageId: string | null;
    discountPercent: string;
  };
  options: {
    /** Only the zones of the company's city; a choice is needed when there are two or more (FR-PRC-06). */
    zones: Array<PricingLabel & { surchargePercent: string }>;
    /** Active, in the configured order (FR-PRC-05). */
    frequencies: PricingLabel[];
    packages: ActivePackage[];
    discountCapPercent: string;
  };
  result: PricingScreenResult;
  /** FR-DSC-04: shown, but not saveable until Slice 10's approval. */
  discountAboveCap: boolean;
}

/**
 * The pricing screen's calculation (FR-PRC-01, 12): on a company or one of
 * its deals inside the caller's `offers.edit` scope, it returns the inputs,
 * the choices and the server-calculated price. It stores nothing.
 */
export class CalculatePriceUseCase {
  constructor(
    private readonly subjects: IPricingSubjectReader,
    private readonly screen: PricingScreen,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    dealId?: string;
    clientId?: string;
    choices: PricingChoices;
  }): Promise<PricingScreenView> {
    input.access.ensure(EDIT_OFFERS);
    if (!input.dealId === !input.clientId) {
      throw new InvalidPricingInputError('dealId', 'Name either a deal or a company.');
    }
    const subject = await pricingSubjectInScope(this.subjects, this.scopes, input.access, input.tenantId, {
      dealId: input.dealId,
      clientId: input.clientId,
    });
    return pricingScreenView(await this.screen.resolve(input.tenantId, subject, input.choices));
  }
}

/**
 * The company or deal, if the caller's `offers.edit` scope reaches it: a
 * deal through its salesperson, a company through its own. Outside the
 * scope it is "not found" (FR-DEAL-04).
 */
export async function pricingSubjectInScope(
  subjects: IPricingSubjectReader,
  scopes: RecordScopeResolver,
  access: AccessContext,
  tenantId: string,
  target: { dealId?: string; clientId?: string }
): Promise<PricingSubject> {
  const subject = target.dealId
    ? await subjects.forDeal(tenantId, target.dealId)
    : await subjects.forCompany(tenantId, target.clientId ?? '');
  const owner = subject?.deal ? subject.deal.ownerUserId : subject?.companyAssigneeId;
  if (!subject || !admits(await scopes.resolve(access, EDIT_OFFERS), owner)) {
    throw new PricingSubjectNotFoundError();
  }
  return subject;
}

const label = (item: PricingLabel): PricingLabel => ({ id: item.id, nameSq: item.nameSq, nameEn: item.nameEn });

export function pricingScreenView(state: PricingScreenState): PricingScreenView {
  const { subject, outcome } = state;
  return {
    subject: {
      clientId: subject.clientId,
      companyName: subject.companyName,
      dealId: subject.deal?.id ?? null,
      dealOpen: subject.deal?.open ?? null,
      employeeCount: subject.employeeCount,
      businessTypeId: subject.businessTypeId,
      city: subject.city,
      area: subject.area,
    },
    inputs: {
      employees: state.employees,
      businessTypeId: state.businessType?.id ?? null,
      riskLevel: state.riskLevel ? { ...label(state.riskLevel), level: state.riskLevel.level } : null,
      zoneId: state.zone?.id ?? null,
      frequencyId: state.frequency?.id ?? null,
      packageId: state.package?.id ?? null,
      discountPercent: state.discountPercent.toString(),
    },
    options: {
      zones: state.zones.map((zone) => ({ ...label(zone), surchargePercent: zone.surchargePercent })),
      frequencies: state.frequencies.map(label),
      packages: state.packages,
      discountCapPercent: state.config.discountCap.toString(),
    },
    result:
      outcome.kind === 'PRICED'
        ? {
            kind: 'PRICED',
            baseFee: outcome.breakdown.baseFee.toString(),
            riskFee: outcome.breakdown.riskFee.toString(),
            visitFee: outcome.breakdown.visitFee.toString(),
            locationFee: outcome.breakdown.locationFee.toString(),
            listPrice: outcome.breakdown.listPrice.toString(),
            discountPercent: state.discountPercent.toString(),
            discountAmount: outcome.discount.discountAmount.toString(),
            netMonthlyPrice: outcome.discount.netMonthlyPrice.toString(),
            pricePerEmployee: outcome.breakdown.pricePerEmployee.toString(),
            annualValue: outcome.netAnnualValue.toString(),
          }
        : outcome,
    discountAboveCap: state.discountAboveCap,
  };
}
