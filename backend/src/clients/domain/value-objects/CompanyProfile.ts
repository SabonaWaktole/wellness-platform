import { BusinessType, Area, City } from '../../../lookups/domain/LookupItem';
import {
  AreaRequiredError,
  BusinessTypeInactiveError,
  BusinessTypeRequiredError,
  CityNotInAreaError,
  CityRequiredError,
  CompanyAreaInactiveError,
  CompanyCityInactiveError,
  EmployeeCountInvalidError,
  WebsiteInvalidError,
} from '../errors';

const WEBSITE_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;

export interface CompanyProfileInput {
  businessTypeId: string;
  employeeCount: number;
  areaId: string;
  cityId: string;
  streetAddress?: string | null;
  taxId?: string | null;
  website?: string | null;
}

export interface CompanyProfileLookups {
  businessType: BusinessType | null;
  area: Area | null;
  city: City | null;
}

/**
 * The shape a company profile has once loaded from persistence, where every
 * field may still be null — either because a legacy company has none yet
 * (Slice 14 backfills them) or because it is being read before ever being
 * validated. `CompanyProfile` (below) is the stricter, validated version of
 * this same shape, produced only by `create`.
 */
export interface CompanyProfileData {
  businessTypeId: string | null;
  employeeCount: number | null;
  areaId: string | null;
  cityId: string | null;
  streetAddress: string | null;
  taxId: string | null;
  website: string | null;
}

/**
 * The Slice 11 company profile (FR-CMP-01, 02, 03): everything about a
 * company beyond its contact details. Risk level is not part of this value
 * object — it is derived from `businessTypeId` on read (see CompanyRisk),
 * never stored.
 */
export class CompanyProfile implements CompanyProfileData {
  private constructor(
    public readonly businessTypeId: string,
    public readonly employeeCount: number,
    public readonly areaId: string,
    public readonly cityId: string,
    public readonly streetAddress: string | null,
    public readonly taxId: string | null,
    public readonly website: string | null
  ) {}

  public static create(input: CompanyProfileInput, lookups: CompanyProfileLookups): CompanyProfile {
    if (!input.businessTypeId) throw new BusinessTypeRequiredError();
    if (!lookups.businessType) throw new BusinessTypeRequiredError();
    if (!lookups.businessType.active) throw new BusinessTypeInactiveError();

    if (!Number.isInteger(input.employeeCount) || input.employeeCount < 1) {
      throw new EmployeeCountInvalidError();
    }

    if (!input.areaId) throw new AreaRequiredError();
    if (!lookups.area) throw new AreaRequiredError();
    if (!lookups.area.active) throw new CompanyAreaInactiveError();

    if (!input.cityId) throw new CityRequiredError();
    if (!lookups.city) throw new CityRequiredError();
    if (lookups.city.areaId !== input.areaId) throw new CityNotInAreaError();
    if (!lookups.city.active) throw new CompanyCityInactiveError();

    const streetAddress = blankToNull(input.streetAddress);
    const taxId = blankToNull(input.taxId);
    const website = blankToNull(input.website);
    if (website && !WEBSITE_PATTERN.test(website)) throw new WebsiteInvalidError();

    return new CompanyProfile(
      input.businessTypeId,
      input.employeeCount,
      input.areaId,
      input.cityId,
      streetAddress,
      taxId,
      website
    );
  }
}

function blankToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
