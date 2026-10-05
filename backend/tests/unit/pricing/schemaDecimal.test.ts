import { readFileSync } from 'fs';
import * as path from 'path';

const prismaDir = path.resolve(__dirname, '../../../prisma');

/**
 * The Milestone 2 models that hold money or percentages. Every slice that
 * adds such a model adds it here, with the columns that must be Decimal.
 * Milestone 1's other Float fields (Product.price, ...) stay as they are
 * (plan D4); the contract and payment tables were converted in Milestone 3
 * Slice 4 and are listed in M3_DECIMAL_COLUMNS below.
 */
const M2_DECIMAL_COLUMNS: Record<string, string[]> = {
  PricingSettings: ['discountCapPercent'],
  EmployeeBand: ['baseFee', 'perEmployeeFee'],
  RiskSurcharge: ['percent'],
  VisitFrequency: ['value'],
  PriceZone: ['surchargePercent'],
  PriceZoneCity: [],
  // Slice 4: services and packages carry no price (Q11).
  Service: [],
  ServicePackage: [],
  PackageService: [],
  // Slice 5: the sales script holds no money.
  SalesScript: [],
  // Slice 6: the agreed values Slice 13 fills when a deal is won.
  // Slice 8: the current offer's value, copied for the board and the list.
  Deal: ['agreedMonthlyPrice', 'agreedAnnualValue', 'offerNetMonthlyPrice', 'offerAnnualValue'],
  DealStageHistory: [],
  // Slice 8: an offer is a Quotation with a deal. Quotation had no Float
  // field in Milestone 1, so the whole model is listed; the legacy product
  // lines (QuotationLineItem.unitPrice) stay Float (D4).
  Quotation: [
    'baseFee',
    'riskFee',
    'visitFee',
    'locationFee',
    'listPrice',
    'discountPercent',
    'discountAmount',
    'netMonthlyPrice',
    'pricePerEmployee',
    'annualValue',
  ],
  QuotationService: [],
  // Slice 9: the yearly document counter holds no money.
  DocumentSequence: [],
};

/**
 * The Milestone 3 models that hold money or percentages (NFR-ACC-03). Slice 4
 * converted Contract and ContractPayment from Float, so no Float is left in
 * the contract and payment tables. Every slice that adds such a model or
 * column adds it here.
 */
const M3_DECIMAL_COLUMNS: Record<string, string[]> = {
  Contract: ['amount', 'agreedAnnualValue', 'discountPercent'],
  ContractPayment: ['amount', 'paidAmount'],
  ContractStatusHistory: [],
  ContractSettings: [],
};

/** Field name → type, for one model block of a Prisma schema. */
function fieldsOf(schema: string, model: string): Map<string, string> {
  const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
  if (!block) throw new Error(`model ${model} not found`);
  const fields = new Map<string, string>();
  for (const line of block[1].split('\n')) {
    const match = /^\s+(\w+)\s+(\w+)/.exec(line);
    if (match && !line.trim().startsWith('//') && !line.trim().startsWith('@@')) fields.set(match[1], match[2]);
  }
  return fields;
}

describe('Milestone 2 money columns (NFR-ACC-02)', () => {
  for (const file of ['schema.prisma', 'schema.mysql.prisma']) {
    const schema = readFileSync(path.join(prismaDir, file), 'utf8');

    it.each(Object.keys(M2_DECIMAL_COLUMNS))(`NFR-ACC-02 ${file}: %s has no Float field`, (model) => {
      const floats = [...fieldsOf(schema, model)].filter(([, type]) => type === 'Float').map(([name]) => name);
      expect(floats).toEqual([]);
    });

    it.each(Object.entries(M2_DECIMAL_COLUMNS).filter(([, columns]) => columns.length > 0))(
      `NFR-ACC-02 ${file}: %s stores its money and percentages as Decimal`,
      (model, columns) => {
        const fields = fieldsOf(schema, model);
        for (const column of columns) expect([column, fields.get(column)]).toEqual([column, 'Decimal']);
      }
    );
  }
});

describe('Milestone 3 money columns (NFR-ACC-03)', () => {
  for (const file of ['schema.prisma', 'schema.mysql.prisma']) {
    const schema = readFileSync(path.join(prismaDir, file), 'utf8');

    it.each(Object.keys(M3_DECIMAL_COLUMNS))(`NFR-ACC-03 ${file}: %s has no Float field`, (model) => {
      const floats = [...fieldsOf(schema, model)].filter(([, type]) => type === 'Float').map(([name]) => name);
      expect(floats).toEqual([]);
    });

    it.each(Object.entries(M3_DECIMAL_COLUMNS).filter(([, columns]) => columns.length > 0))(
      `NFR-ACC-03 ${file}: %s stores its money and percentages as Decimal`,
      (model, columns) => {
        const fields = fieldsOf(schema, model);
        for (const column of columns) expect([column, fields.get(column)]).toEqual([column, 'Decimal']);
      }
    );
  }
});
