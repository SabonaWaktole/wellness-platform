import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';

/**
 * The quotation-level half of `quotations.manage` (FR-RBAC-11): at OWN scope
 * a caller reaches only quotations they created. `access` is `null` for a
 * system actor — the expiry job, or a client answering through the public
 * link — which acts on any quotation.
 */
export const assertReachesQuotation = (
  quotation: { createdByUserId: string },
  access: AccessContext | null
): void => {
  if (access && !access.reaches('quotations.manage', [quotation.createdByUserId])) {
    throw new PermissionDeniedError('quotations.manage', 'Unauthorized: you can only act on your own quotations');
  }
};
