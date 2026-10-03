/** Reading deals, the board and the list (FR-DEAL-04, 10, 11). Scoped. */
export const VIEW_DEALS = 'deals.view';

/** Creating, editing and moving deals between open stages (FR-DEAL-01, 07). Scoped. */
export const EDIT_DEALS = 'deals.edit';

/** Soft-deleting a deal (FR-DEAL-19). Scoped. */
export const DELETE_DEALS = 'deals.delete';

/** Handing a deal to another salesperson: the companies' key, per FR-DEAL-05. Scoped. */
export const REASSIGN_DEALS = 'companies.reassign';

/** Which companies a deal may be created on. Scoped. */
export const VIEW_COMPANIES = 'companies.view';

/** A deal's value and its offers' figures (FR-RBAC-17). Not scoped. */
export const VIEW_COMMERCIAL = 'commercial.view';
