import { z } from 'zod';
import { MAX_LABEL_LENGTH } from '../../../lookups/domain/LookupItem';
import { MAX_DESCRIPTION_LENGTH, PricingList } from '../../domain/PricingLists';

// Shape only. The rules (fees ≥ 0 with two decimals, percentages 0–1000,
// bands that do not overlap) live in the domain, so they hold for any caller
// and a refused value gets its own error code (FR-PCF-03).
const amount = z.union([z.string().max(32), z.number()]);
const labels = {
  nameSq: z.string().max(MAX_LABEL_LENGTH),
  nameEn: z.string().max(MAX_LABEL_LENGTH).nullable().optional(),
};

const descriptions = {
  descriptionSq: z.string().max(MAX_DESCRIPTION_LENGTH + 100).nullable().optional(),
  descriptionEn: z.string().max(MAX_DESCRIPTION_LENGTH + 100).nullable().optional(),
};

const listFields: Record<PricingList, z.ZodRawShape> = {
  [PricingList.Bands]: {
    minEmployees: z.number(),
    maxEmployees: z.number(),
    baseFee: amount,
    perEmployeeFee: amount,
  },
  [PricingList.Frequencies]: {
    ...labels,
    visitsPerYear: z.number().nullable().optional(),
    pricingType: z.string().max(20),
    frequencyValue: amount,
  },
  [PricingList.Zones]: {
    ...labels,
    surchargePercent: amount,
  },
  [PricingList.Services]: {
    ...labels,
    ...descriptions,
  },
  [PricingList.Packages]: {
    ...labels,
    ...descriptions,
  },
};

// Rich text is a TipTap document or pasted text; the sanitiser decides what
// survives (NFR-SEC-05), so the edge only bounds its size.
const richText = z.union([z.string().max(20000), z.record(z.unknown())]).nullable();
const detail = z.string().max(4000).nullable();

export const pricingSchemas = {
  create: (list: PricingList) => z.object(listFields[list]),
  update: (list: PricingList) => z.object(listFields[list]).partial(),
  reorder: z.object({ ids: z.array(z.string().min(1)).max(1000) }),
  zoneCities: z.object({ cityIds: z.array(z.string().min(1)).max(1000) }),
  riskSurcharge: z.object({ riskSurchargePercent: amount }),
  discountCap: z.object({ discountCapPercent: amount }),
  createPackage: z.object({ ...listFields[PricingList.Packages], serviceIds: z.array(z.string().min(1)).max(200) }),
  packageServices: z.object({ serviceIds: z.array(z.string().min(1)).max(200) }),
  offerSettings: z
    .object({
      offerValidityDays: z.number().optional(),
      contractMonthsDefault: z.number().optional(),
      offerNumberPrefix: z.string().max(20).optional(),
      companyName: detail.optional(),
      nipt: detail.optional(),
      address: detail.optional(),
      phone: detail.optional(),
      email: detail.optional(),
      website: detail.optional(),
      bankDetails: detail.optional(),
      introSq: richText.optional(),
      introEn: richText.optional(),
      termsSq: richText.optional(),
      termsEn: richText.optional(),
      closingSq: richText.optional(),
      closingEn: richText.optional(),
    })
    .strict(),
  testCalculation: z.object({
    employees: z.number(),
    riskLevelId: z.string().min(1),
    frequencyId: z.string().min(1),
    zoneId: z.string().min(1),
  }),
};
