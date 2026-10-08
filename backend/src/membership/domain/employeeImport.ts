import { InvalidMemberError, normalisePersonalDetails, type PersonalDetails } from './Member';

/** FR-EMP-03: the limits of the existing client import. */
export const EMPLOYEE_IMPORT_LIMITS = { bytes: 2 * 1024 * 1024, rows: 1000 } as const;

/** D10: an unconfirmed preview keeps its parsed rows for this long. */
export const PREVIEW_LIFETIME_HOURS = 24;

export type EmployeeColumn = 'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'email' | 'language';

/** FR-EMP-02: the template headers, in Albanian and English. */
export const TEMPLATE_HEADERS: Record<'en' | 'sq', Record<EmployeeColumn, string>> = {
  en: { firstName: 'First name*', lastName: 'Last name*', dateOfBirth: 'Date of birth', phone: 'Phone', email: 'Email', language: 'Language' },
  sq: { firstName: 'Emri*', lastName: 'Mbiemri*', dateOfBirth: 'Data e lindjes', phone: 'Telefoni', email: 'Email', language: 'Gjuha' },
};

const key = (header: string): string =>
  header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*\s_\-.]/g, '');

const HEADER_INDEX: Record<string, EmployeeColumn> = {};
for (const set of Object.values(TEMPLATE_HEADERS)) {
  for (const [column, header] of Object.entries(set)) HEADER_INDEX[key(header)] = column as EmployeeColumn;
}
HEADER_INDEX[key('Birth date')] = 'dateOfBirth';
HEADER_INDEX[key('Telefon')] = 'phone';
HEADER_INDEX[key('Mobile')] = 'phone';
HEADER_INDEX[key('E-mail')] = 'email';

/** Maps each header of the sheet to a column; unknown headers are ignored. */
export const mapHeaders = (headers: readonly string[]): Partial<Record<string, EmployeeColumn>> => {
  const map: Partial<Record<string, EmployeeColumn>> = {};
  for (const header of headers) {
    const column = HEADER_INDEX[key(header)];
    if (column) map[header] = column;
  }
  return map;
};

/** True when the sheet has the two required name columns (FR-EMP-02). */
export const hasRequiredColumns = (headers: readonly string[]): boolean => {
  const columns = new Set(Object.values(mapHeaders(headers)));
  return columns.has('firstName') && columns.has('lastName');
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_FIRST = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

/** A date cell arrives as an ISO timestamp, YYYY-MM-DD, or DD.MM.YYYY text. Anything else is left for the validator to refuse. */
export const cellDay = (value: string): string => {
  const text = value.trim();
  if (text === '') return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
  if (DAY.test(text)) return text;
  const match = DAY_FIRST.exec(text);
  if (match) return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  return text;
};

/** A cell that begins with a formula character is never trusted in an output file (NFR-SEC-09). */
export const safeCell = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export type RowClass = 'NEW' | 'EXISTING' | 'SKIPPED' | 'REFUSED' | 'ERROR';

export const SKIP_REASONS = {
  alreadyLinked: 'Already linked to this company',
  repeated: 'Repeated in the file',
  linkedElsewhere: 'Linked to another company',
  closed: 'The member is closed',
  ambiguous: 'Matches more than one member',
} as const;

/** One parsed row, with its classification. `details` and `memberId` are personal data and are cleared with the rows (D10). */
export interface ImportRow {
  /** The row number in the sheet, counting the header as row 1. */
  row: number;
  outcome: RowClass;
  reason: string | null;
  details: PersonalDetails | null;
  memberId: string | null;
}

/** A row with its reason, without any personal value: what survives the clearing of the rows. */
export interface ImportRowResult {
  row: number;
  outcome: Exclude<RowClass, 'NEW' | 'EXISTING'> | 'CREATED' | 'LINKED';
  reason: string | null;
}

export interface RawRow {
  row: number;
  values: Partial<Record<EmployeeColumn, string>>;
}

/** FR-EMP-02: validates a row with the member rules; an empty language is Albanian. */
export const parseRow = (raw: RawRow, today: string): { details: PersonalDetails } | { error: string } => {
  try {
    const { values } = raw;
    const details = normalisePersonalDetails(
      {
        firstName: values.firstName ?? '',
        lastName: values.lastName ?? '',
        dateOfBirth: cellDay(values.dateOfBirth ?? ''),
        phone: values.phone ?? '',
        email: values.email ?? '',
        language: (values.language ?? '').trim().toLowerCase() || 'sq',
      },
      today
    );
    return { details };
  } catch (error) {
    if (error instanceof InvalidMemberError) return { error: error.message };
    throw error;
  }
};

/** The identifiers that make two rows the same person: one shared value is enough (FR-MEM-04). */
export const identityKeys = (details: PersonalDetails): string[] => {
  const keys: string[] = [];
  if (details.email) keys.push(`e:${details.email.toLowerCase()}`);
  if (details.phone) keys.push(`p:${details.phone}`);
  if (details.dateOfBirth) keys.push(`n:${details.firstName.toLowerCase()}|${details.lastName.toLowerCase()}|${details.dateOfBirth}`);
  return keys;
};

/** What the database says about the people a row may be. */
export interface KnownMember {
  id: string;
  employerClientId: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

/**
 * FR-EMP-04, FR-EMP-14: classifies the rows in order. `find` returns every
 * member the FR-MEM-04 finder matches. A row repeating an earlier row of the
 * file is skipped, a match already linked here is skipped, a match linked to
 * another company is refused, and a match with nothing linked is to be linked.
 */
export async function classifyRows(
  raws: readonly RawRow[],
  clientId: string,
  today: string,
  find: (details: PersonalDetails) => Promise<KnownMember[]>
): Promise<ImportRow[]> {
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (const raw of raws) {
    const parsed = parseRow(raw, today);
    if ('error' in parsed) {
      rows.push({ row: raw.row, outcome: 'ERROR', reason: parsed.error, details: null, memberId: null });
      continue;
    }
    const { details } = parsed;
    const keys = identityKeys(details);
    if (keys.some((k) => seen.has(k))) {
      rows.push({ row: raw.row, outcome: 'SKIPPED', reason: SKIP_REASONS.repeated, details: null, memberId: null });
      continue;
    }
    keys.forEach((k) => seen.add(k));
    rows.push({ row: raw.row, ...(await classifyOne(details, clientId, find)) });
  }
  return rows;
}

/** One person against the members already in the workspace. */
export async function classifyOne(
  details: PersonalDetails,
  clientId: string,
  find: (details: PersonalDetails) => Promise<KnownMember[]>
): Promise<Pick<ImportRow, 'outcome' | 'reason' | 'details' | 'memberId'>> {
  const matches = await find(details);
  const skip = (outcome: RowClass, reason: string, memberId: string | null = null) => ({ outcome, reason, details: null, memberId });
  if (matches.length === 0) return { outcome: 'NEW', reason: null, details, memberId: null };
  if (matches.length > 1) return { outcome: 'ERROR', reason: SKIP_REASONS.ambiguous, details: null, memberId: null };
  const [member] = matches as [KnownMember];
  if (member.employerClientId === clientId) return skip('SKIPPED', SKIP_REASONS.alreadyLinked, member.id);
  if (member.employerClientId !== null) return skip('REFUSED', SKIP_REASONS.linkedElsewhere, member.id);
  if (member.status === 'CLOSED') return skip('ERROR', SKIP_REASONS.closed, member.id);
  return { outcome: 'EXISTING', reason: null, details, memberId: member.id };
}

export interface ImportCounts {
  created: number;
  linked: number;
  skipped: number;
  refused: number;
  errors: number;
}

/** The preview's counts: each class once (New, Existing, Skipped, Refused, Error). */
export const previewCounts = (rows: readonly ImportRow[]): ImportCounts => ({
  created: rows.filter((r) => r.outcome === 'NEW').length,
  linked: rows.filter((r) => r.outcome === 'EXISTING').length,
  skipped: rows.filter((r) => r.outcome === 'SKIPPED').length,
  refused: rows.filter((r) => r.outcome === 'REFUSED').length,
  errors: rows.filter((r) => r.outcome === 'ERROR').length,
});
