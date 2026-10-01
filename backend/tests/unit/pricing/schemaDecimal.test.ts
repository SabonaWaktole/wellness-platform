import { readFileSync } from 'fs';
import * as path from 'path';

const prismaDir = path.resolve(__dirname, '../../../prisma');

/**
 * The Milestone 2 models that hold money or percentages. Every slice that
 * adds such a model adds it here, with the columns that must be Decimal.
 * Milestone 1's Float fields (Product.price, Contract.amount, ...) stay as
 * they are until Milestone 3 (plan D4) and are deliberately not listed.
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
