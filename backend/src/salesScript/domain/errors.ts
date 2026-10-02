import { DomainError } from '../../shared/domain/errors/DomainError';

/** No published script, or no version with that number, in this workspace. Mapped to 404. */
export class SalesScriptNotFoundError extends DomainError {
  readonly code = 'SALES_SCRIPT_NOT_FOUND';

  constructor() {
    super('Sales script not found.');
  }
}

/** Publish was asked for with no draft to publish. Mapped to 409. */
export class NoScriptDraftError extends DomainError {
  readonly code = 'NO_SCRIPT_DRAFT';

  constructor() {
    super('There is no draft to publish. Save a draft first.');
  }
}

/** Another write to the script landed first (two drafts, two publishes). Mapped to 409. */
export class SalesScriptConflictError extends DomainError {
  readonly code = 'SALES_SCRIPT_CONFLICT';

  constructor() {
    super('The sales script was changed by someone else. Reload it and try again.');
  }
}

export type InvalidScriptCode = 'SCRIPT_EMPTY' | 'INVALID_RICH_TEXT';

/** The script text is refused: formatting outside the whitelist, or no Albanian text to publish. Mapped to 400. */
export class InvalidScriptError extends DomainError {
  constructor(
    readonly code: InvalidScriptCode,
    readonly field: 'contentSq' | 'contentEn',
    message: string
  ) {
    super(message);
  }
}
