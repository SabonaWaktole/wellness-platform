export const ClientStatus = {
  PROSPECT: 'PROSPECT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type ClientStatus = typeof ClientStatus[keyof typeof ClientStatus];

export interface Client {
  id: string;
  name: string;
  contactInfo: {
    email?: string;
    phone?: string;
  };
  status: ClientStatus;
  assignedUserId: string | null;
  customFieldValues: Record<string, any>;
  lastUpdatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  fieldName: string;
  // Mirrors backend src/clients/domain/enums/FieldType.ts. Keep in sync: the
  // settings dropdown previously offered BOOLEAN while the backend enum did not
  // accept it, so every such submission 400'd.
  fieldType: CustomFieldType;
  options?: string[];
  isRequired: boolean;
}

export type CustomFieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'ALPHANUMERIC'
  | 'SINGLE_SELECT';

/** Per-row outcome of a spreadsheet import; `skipped` only applies to fields. */
export interface ImportResult {
  created: number;
  skipped?: number;
  errors: { row: number; message: string }[];
}

export interface OutcomeCategory {
  id: string;
  tenantId: string;
  label: string;
}

export interface Interaction {
  id: string;
  clientId: string;
  type: string;
  channel: string;
  content: string;
  outcomeCategoryId?: string | null;
  authorUserId: string;
  createdAt: string;
}

export interface ClientHistory {
  timeline: Array<{
    id: string;
    timestamp: string;
    type: string;
    description: string;
    actor: string;
    details?: any;
  }>;
}

export interface SearchClientsParams {
  /** Combined term matched against name, email and phone (SRS §6.2). */
  search?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: ClientStatus;
  assignedUserId?: string;
  customFields?: Record<string, any>;
  skip?: number;
  take?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}
