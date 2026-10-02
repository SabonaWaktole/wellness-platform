/** The fixed client status set (Slice 11, Q9). */
export const ClientStatus = {
  LEAD: 'LEAD',
  PROSPECT: 'PROSPECT',
  CLIENT: 'CLIENT',
  FORMER_CLIENT: 'FORMER_CLIENT',
} as const;

export type ClientStatus = typeof ClientStatus[keyof typeof ClientStatus];

/** A lookup value as it appears embedded in a company's profile — its label in both languages. */
export interface EnrichedLookup {
  id: string;
  nameSq: string;
  nameEn: string | null;
}

export interface EnrichedRisk extends EnrichedLookup {
  level: number;
}

/**
 * The Slice 11 company profile (FR-CMP-01, 02, 03). Every field is nullable:
 * a legacy company may have none of them yet (Slice 14 backfills them), and
 * `riskLevel` is never stored — it is always derived from `businessType`.
 */
export interface CompanyProfile {
  businessTypeId: string | null;
  employeeCount: number | null;
  areaId: string | null;
  cityId: string | null;
  streetAddress: string | null;
  taxId: string | null;
  website: string | null;
  businessType: EnrichedLookup | null;
  riskLevel: EnrichedRisk | null;
  area: EnrichedLookup | null;
  city: EnrichedLookup | null;
}

/** The company profile fields as the form submits them, before enrichment. */
export interface CompanyProfileInput {
  businessTypeId: string;
  employeeCount: number;
  areaId: string;
  cityId: string;
  streetAddress?: string | null;
  taxId?: string | null;
  website?: string | null;
}

/** A named person at a company (FR-CMP-04, Slice 12). */
export interface ContactPerson {
  id: string;
  clientId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A contact as the company form submits it, before it has an id. */
export interface ContactPersonInput {
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

export interface Client {
  id: string;
  name: string;
  contactInfo: {
    email?: string;
    phone?: string;
  };
  status: string;
  assignedUserId: string | null;
  customFieldValues: Record<string, any>;
  /** Free-text internal notes, private to the workspace. */
  notes?: string | null;
  profile?: CompanyProfile;
  /** The company's contacts (FR-CMP-04), primary first. Present on a single-client read. */
  contacts?: ContactPerson[];
  /** The primary contact only — what the company list carries, to stay light. */
  primaryContact?: ContactPerson | null;
  lastUpdatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the client is archived; absent/null means active. */
  deletedAt?: string | null;
}

/** Records that survive archiving a client — shown in the confirmation. */
export interface ClientRelatedCounts {
  interactions: number;
  appointments: number;
  quotations: number;
  invoices: number;
}

export type FieldRole =
  | 'PRIMARY_NAME'
  | 'PRIMARY_EMAIL'
  | 'PRIMARY_PHONE'
  | 'STATUS'
  | 'ASSIGNEE';

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  fieldName: string;
  // Mirrors backend src/clients/domain/enums/FieldType.ts. Keep in sync: the
  // settings dropdown previously offered BOOLEAN while the backend enum did not
  // accept it, so every such submission 400'd.
  fieldType: CustomFieldType;
  options?: string[];
  order: number;
  role: FieldRole | null;
  required: boolean;
}

export type CustomFieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'ALPHANUMERIC'
  | 'LONG_TEXT'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'EMAIL'
  | 'USER_REFERENCE';

/** Per-row outcome of a spreadsheet import; `skipped` only applies to fields. */
export interface ImportResult {
  created: number;
  skipped?: number;
  errors: { row: number; message: string }[];
}

/** An activity's type (FR-ACT-01). VISIT and ONLINE_MEETING are M2 Slice 7's. */
export const ACTIVITY_CHANNELS = ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING', 'NOTE'] as const;
export type ActivityChannel = (typeof ACTIVITY_CHANNELS)[number];

/** What the activity dialog sends, on create and on edit (FR-ACT-02). */
export interface ActivityInput {
  channel: ActivityChannel;
  content?: string;
  /** ISO 8601; the server defaults it to now. */
  occurredAt?: string | null;
  contactPersonId?: string | null;
  dealId?: string | null;
  resultId?: string | null;
  clientFeedback?: string | null;
  nextAction?: string | null;
}

export interface Interaction {
  id: string;
  clientId: string;
  channel: ActivityChannel;
  content: string;
  authorUserId: string;
  createdAt: string;
  occurredAt: string;
  contactPersonId: string | null;
  dealId: string | null;
  resultId: string | null;
  clientFeedback: string | null;
  nextAction: string | null;
  updatedAt: string | null;
}

/**
 * An activity as the company timeline and the deal page show it (FR-ACT-05).
 * `recordedAt` is when it was saved, which the 24-hour edit window counts
 * from (FR-ACT-06).
 */
export interface ActivityView {
  id: string;
  clientId: string;
  dealId: string | null;
  channel: ActivityChannel;
  content: string;
  occurredAt: string;
  recordedAt: string;
  updatedAt: string | null;
  author: { id: string; name: string };
  contact: { id: string; name: string } | null;
  result: { id: string; nameSq: string; nameEn: string | null } | null;
  clientFeedback: string | null;
  nextAction: string | null;
}

/** What the company timeline can be filtered by (FR-CMP-05). DEAL is M2 Slice 6's (FR-DEAL-20). */
export const TIMELINE_CATEGORIES = ['CONTACT', 'NOTE', 'ACTIVITY', 'QUOTATION', 'CONTRACT', 'PAYMENT', 'DEAL'] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export interface TimelineEntry {
  id: string;
  category: TimelineCategory;
  /** The event, e.g. CONTACT_ADDED, INTERACTION_ADDED, APPOINTMENT_COMPLETED. */
  type: string;
  timestamp: string;
  /** `null` for a change no person made (a scheduler) or where none is recorded. */
  actor: { id: string; name: string } | null;
  /** Money fields (`amount`, `total`, `paidAmount`) are absent when the viewer may not see them. */
  details: Record<string, any>;
}

export interface ClientHistory {
  timeline: TimelineEntry[];
  nextCursor: string | null;
}

export interface ClientHistoryParams {
  types?: TimelineCategory[];
  cursor?: string;
  limit?: number;
}

export interface SearchClientsParams {
  /** Combined term matched against name, email and phone (SRS §6.2). */
  search?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  assignedUserId?: string;
  customFields?: Record<string, any>;
  /** Slice 11 filters (FR-CMP-06). `riskLevelId` narrows through the business type. */
  businessTypeId?: string;
  riskLevelId?: string;
  areaId?: string;
  cityId?: string;
  /** Slice 14 (FR-CMP-08): narrows to companies still missing a profile field or a contact. */
  needsCompletion?: boolean;
  /** `true` lists archived clients instead of active ones. */
  archived?: boolean;
  /**
   * The list's "mine / team / all" filter (FR-RBAC-11..13). Narrows the
   * viewer's companies.view scope and never widens it.
   */
  reach?: 'OWN' | 'TEAM' | 'ALL';
  skip?: number;
  take?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}
