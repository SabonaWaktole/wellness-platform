import { BusinessType, Area, City } from '../../../lookups/domain/LookupItem';
import { CustomFieldDefinition } from '../entities/CustomFieldDefinition';
import { ClientFieldResolver } from '../services/ClientFieldResolver';
import { CompanyProfileData } from '../value-objects/CompanyProfile';
import { LegacyMappingConfig, firstMappedValue, resolveMappedValue } from './LegacyMappingConfig';
import { matchLookupLabel } from './matchLabel';

// Kept in step with ContactPerson's own patterns (src/clients/domain/entities/ContactPerson.ts):
// this stage only decides whether a candidate contact is worth proposing, the
// actual ContactPerson is built (and re-validated) once an id exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;
// Kept in step with CompanyProfile's own pattern.
const WEBSITE_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;

export type LegacyMissingField = 'business_type' | 'area' | 'city' | 'employee_count' | 'contact';

export interface LegacyClientSnapshot {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customFieldValues: Record<string, unknown>;
  profile: CompanyProfileData;
  hasLiveContact: boolean;
  archived: boolean;
}

export interface LegacyClientLookups {
  businessTypes: BusinessType[];
  areas: Area[];
  cities: City[];
  fieldDefs: CustomFieldDefinition[];
  /** Every taxId already held by another company of this tenant. */
  taxIdsInUse: Set<string>;
}

export interface PlannedContact {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface LegacyClientPlanResult {
  /** Only the columns this plan would newly fill — never a column that already has a value. */
  profilePatch: Partial<CompanyProfileData>;
  contactToCreate: PlannedContact | null;
  missing: LegacyMissingField[];
  issues: string[];
}

/**
 * Plans, without writing anything, what the Slice 14 migration would do for
 * one legacy company (FR-CMP-08). Idempotent by construction: a column that
 * already holds a value is never included in `profilePatch`, so running the
 * plan again after applying it (or after a user has since filled the field
 * by hand) changes nothing further.
 */
export function planLegacyClient(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  lookups: LegacyClientLookups
): LegacyClientPlanResult {
  const profilePatch: Partial<CompanyProfileData> = {};
  const issues: string[] = [];

  planBusinessType(snapshot, config, lookups, profilePatch, issues);
  planEmployeeCount(snapshot, config, profilePatch, issues);
  planAreaAndCity(snapshot, config, lookups, profilePatch, issues);
  planStreetAddress(snapshot, config, profilePatch);
  planTaxId(snapshot, config, lookups, profilePatch, issues);
  planWebsite(snapshot, config, profilePatch, issues);

  const contactToCreate = planContact(snapshot, config, lookups, issues);

  const resultingProfile: CompanyProfileData = { ...snapshot.profile, ...profilePatch };
  const missing: LegacyMissingField[] = [];
  if (!resultingProfile.businessTypeId) missing.push('business_type');
  if (!resultingProfile.areaId) missing.push('area');
  if (!resultingProfile.cityId) missing.push('city');
  if (resultingProfile.employeeCount === null || resultingProfile.employeeCount === undefined) {
    missing.push('employee_count');
  }
  if (!snapshot.hasLiveContact && !contactToCreate) missing.push('contact');

  return { profilePatch, contactToCreate, missing, issues };
}

function planBusinessType(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  lookups: LegacyClientLookups,
  patch: Partial<CompanyProfileData>,
  issues: string[]
): void {
  if (snapshot.profile.businessTypeId) return;
  const raw = firstMappedValue(config.fields.businessType, snapshot.customFieldValues);
  if (!raw) return;
  const resolved = resolveMappedValue(config.fields.businessType, raw);
  const match = matchLookupLabel(resolved, lookups.businessTypes);
  if (match) {
    patch.businessTypeId = match.id;
  } else {
    issues.push(`Business type "${raw}" did not match any active business type.`);
  }
}

function planEmployeeCount(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  patch: Partial<CompanyProfileData>,
  issues: string[]
): void {
  if (snapshot.profile.employeeCount !== null && snapshot.profile.employeeCount !== undefined) return;
  const raw = firstMappedValue(config.fields.employeeCount, snapshot.customFieldValues);
  if (!raw) return;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 1) {
    patch.employeeCount = parsed;
  } else {
    issues.push(`Number of employees "${raw}" is not a whole number of at least 1.`);
  }
}

function planAreaAndCity(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  lookups: LegacyClientLookups,
  patch: Partial<CompanyProfileData>,
  issues: string[]
): void {
  let areaId = snapshot.profile.areaId;

  if (!areaId) {
    const raw = firstMappedValue(config.fields.area, snapshot.customFieldValues);
    if (raw) {
      const resolved = resolveMappedValue(config.fields.area, raw);
      const match = matchLookupLabel(resolved, lookups.areas);
      if (match) {
        areaId = match.id;
        patch.areaId = match.id;
      } else {
        issues.push(`Area "${raw}" did not match any active area.`);
      }
    }
  }

  if (snapshot.profile.cityId) return;
  const rawCity = firstMappedValue(config.fields.city, snapshot.customFieldValues);
  if (!rawCity) return;
  const resolvedCity = resolveMappedValue(config.fields.city, rawCity);

  if (areaId) {
    const citiesInArea = lookups.cities.filter((city) => city.areaId === areaId);
    const match = matchLookupLabel(resolvedCity, citiesInArea);
    if (match) {
      patch.cityId = match.id;
    } else {
      issues.push(`City "${rawCity}" did not match any active city in the resolved area.`);
    }
    return;
  }

  // No area resolved yet: fall back to a citywide match, and infer the area
  // from it when exactly one active city anywhere carries this name.
  const candidates = lookups.cities.filter(
    (city) => matchLookupLabel(resolvedCity, [city]) !== undefined
  );
  if (candidates.length === 1) {
    const [match] = candidates;
    patch.cityId = match.id;
    patch.areaId = match.areaId;
    issues.push(`Area inferred from city "${rawCity}"; please confirm it.`);
  } else if (candidates.length > 1) {
    issues.push(`City "${rawCity}" matches more than one area; add an area mapping to disambiguate.`);
  } else {
    issues.push(`City "${rawCity}" did not match any active city.`);
  }
}

function planStreetAddress(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  patch: Partial<CompanyProfileData>
): void {
  if (snapshot.profile.streetAddress) return;
  const raw = firstMappedValue(config.fields.streetAddress, snapshot.customFieldValues);
  if (raw) patch.streetAddress = raw;
}

function planTaxId(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  lookups: LegacyClientLookups,
  patch: Partial<CompanyProfileData>,
  issues: string[]
): void {
  if (snapshot.profile.taxId) return;
  const raw = firstMappedValue(config.fields.taxId, snapshot.customFieldValues);
  if (!raw) return;
  if (lookups.taxIdsInUse.has(raw)) {
    issues.push(`NIPT "${raw}" is already used by another company; left unset.`);
    return;
  }
  patch.taxId = raw;
}

function planWebsite(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  patch: Partial<CompanyProfileData>,
  issues: string[]
): void {
  if (snapshot.profile.website) return;
  const raw = firstMappedValue(config.fields.website, snapshot.customFieldValues);
  if (!raw) return;
  if (WEBSITE_PATTERN.test(raw)) {
    patch.website = raw;
  } else {
    issues.push(`Website "${raw}" is not a valid address; left unset.`);
  }
}

function planContact(
  snapshot: LegacyClientSnapshot,
  config: LegacyMappingConfig,
  lookups: LegacyClientLookups,
  issues: string[]
): PlannedContact | null {
  if (snapshot.hasLiveContact) return null;

  const resolvedEmail = ClientFieldResolver.resolveEmail(snapshot.customFieldValues, lookups.fieldDefs);
  const resolvedPhone = ClientFieldResolver.resolvePhone(snapshot.customFieldValues, lookups.fieldDefs);
  const email = validOrNull(resolvedEmail ?? snapshot.email ?? undefined, EMAIL_PATTERN, issues, 'email');
  const phone = validOrNull(resolvedPhone ?? snapshot.phone ?? undefined, PHONE_PATTERN, issues, 'phone');

  if (!email && !phone) return null;

  const name = firstMappedValue(config.fields.contactName, snapshot.customFieldValues) ?? snapshot.name;
  if (!config.fields.contactName || !firstMappedValue(config.fields.contactName, snapshot.customFieldValues)) {
    issues.push(`No contact name mapped; the new contact is named after the company ("${name}") — rename it.`);
  }

  return { name, phone, email };
}

function validOrNull(
  value: string | undefined,
  pattern: RegExp,
  issues: string[],
  label: 'email' | 'phone'
): string | null {
  if (!value) return null;
  if (pattern.test(value)) return value;
  issues.push(`Legacy ${label} "${value}" is not valid; dropped from the new contact.`);
  return null;
}
