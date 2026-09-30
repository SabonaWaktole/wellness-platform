import { AccessContext } from '../../../access/domain/AccessContext';
import { InvalidPricingValueError } from '../../domain/errors';
import { PriceCalculator, PriceOnRequestReason } from '../../domain/PriceCalculator';
import { MAX_EMPLOYEES } from '../../domain/PricingLists';
import { parseWholeNumber } from '../../domain/PricingValues';
import { MANAGE_PRICING } from '../pricingAdmin';
import { LoadPricingConfigUseCase } from './LoadPricingConfigUseCase';

/** Amounts as strings with two decimals (NFR-ACC-02); the frontend only formats them. */
export type TestCalculationResult =
  | {
      kind: 'PRICED';
      baseFee: string;
      riskFee: string;
      visitFee: string;
      locationFee: string;
      listPrice: string;
      pricePerEmployee: string;
      annualValue: string;
    }
  | { kind: 'PRICE_ON_REQUEST'; reason: PriceOnRequestReason };

/**
 * The test calculator on Settings → Pricing (FR-PCF-09): the Slice 1
 * calculator on the current configuration. It creates no offer and writes
 * nothing, not even an audit entry.
 */
export class TestPriceCalculationUseCase {
  constructor(private readonly loadConfig: LoadPricingConfigUseCase) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    employees: unknown;
    riskLevelId: string;
    frequencyId: string;
    zoneId: string;
  }): Promise<TestCalculationResult> {
    input.access.ensure(MANAGE_PRICING);
    const employees = parseWholeNumber(input.employees, 'employees', 1, MAX_EMPLOYEES);
    const config = await this.loadConfig.execute(input.tenantId);
    if (!(input.frequencyId in config.frequencies)) {
      throw new InvalidPricingValueError('INVALID_PRICING_VALUE', 'frequencyId', 'Choose an active visit frequency.');
    }

    const result = PriceCalculator.calculate(
      { employees, riskLevelId: input.riskLevelId, frequencyId: input.frequencyId, zoneId: input.zoneId },
      config
    );
    if (result.kind === 'PRICE_ON_REQUEST') {
      return result;
    }
    return {
      kind: 'PRICED',
      baseFee: result.baseFee.toString(),
      riskFee: result.riskFee.toString(),
      visitFee: result.visitFee.toString(),
      locationFee: result.locationFee.toString(),
      listPrice: result.listPrice.toString(),
      pricePerEmployee: result.pricePerEmployee.toString(),
      annualValue: result.annualValue.toString(),
    };
  }
}
