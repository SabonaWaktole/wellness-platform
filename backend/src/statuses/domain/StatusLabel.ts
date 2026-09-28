import { DomainError } from '../../shared/domain/errors/DomainError';
import { StatusDomain } from './StatusCatalogue';

export interface StatusLabel {
  domain: StatusDomain;
  key: string;
  labelSq: string;
  labelEn: string | null;
  colour: string;
  order: number;
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const MAX_LABEL_LENGTH = 100;

/** No status of that key in this domain. Mapped to 404. */
export class StatusKeyNotFoundError extends DomainError {
  readonly code = 'STATUS_KEY_NOT_FOUND';

  constructor() {
    super('Unknown status key.');
  }
}

/** A field failed a status label rule (blank label, bad colour). Mapped to 400. */
export class InvalidStatusLabelError extends DomainError {
  readonly code = 'INVALID_STATUS_LABEL';

  constructor(
    readonly field: string,
    message: string
  ) {
    super(message);
  }
}

/** A reorder must list every key of the domain exactly once. Mapped to 400. */
export class InvalidStatusOrderError extends DomainError {
  readonly code = 'INVALID_STATUS_ORDER';

  constructor() {
    super('The new order must list every status of this domain exactly once.');
  }
}

export interface StatusLabelEdit {
  labelSq: string;
  labelEn?: string | null;
  colour: string;
}

/** Trims the labels and checks the colour, the same shape lookup labels use. */
export function validateStatusLabelEdit(edit: StatusLabelEdit): { labelSq: string; labelEn: string | null; colour: string } {
  const labelSq = edit.labelSq.trim();
  const labelEn = edit.labelEn?.trim() || null;
  if (!labelSq) {
    throw new InvalidStatusLabelError('labelSq', 'The Albanian label is required.');
  }
  if (labelSq.length > MAX_LABEL_LENGTH || (labelEn?.length ?? 0) > MAX_LABEL_LENGTH) {
    throw new InvalidStatusLabelError(labelSq.length > MAX_LABEL_LENGTH ? 'labelSq' : 'labelEn', 'The label is too long.');
  }
  if (!HEX_COLOUR.test(edit.colour)) {
    throw new InvalidStatusLabelError('colour', 'The colour must be a hex value like #3DAA6C.');
  }
  return { labelSq, labelEn, colour: edit.colour.toUpperCase() };
}
