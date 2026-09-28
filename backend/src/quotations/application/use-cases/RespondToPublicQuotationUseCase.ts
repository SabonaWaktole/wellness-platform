import { IPublicQuotationReader } from '../GetPublicQuotationUseCase';
import { MarkQuotationAcceptedUseCase } from './MarkQuotationAcceptedUseCase';
import { MarkQuotationRejectedUseCase } from './MarkQuotationRejectedUseCase';

export type PublicQuotationDecision = 'accept' | 'reject';

export type RespondToPublicQuotationResult =
  | { outcome: 'ok' }
  | { outcome: 'not_found' }
  | { outcome: 'invalid_state' }
  | { outcome: 'failed'; message: string };

/**
 * The client's half of Accept / Reject / Re-quote (§6.5).
 *
 * Reuses the same domain transitions and use cases a staff member triggers
 * from the quotation detail page (`MarkQuotationAcceptedUseCase`,
 * `MarkQuotationRejectedUseCase`) — Accept and Reject already mean "the
 * client's decision", however it was recorded, so there is no separate
 * client-facing rule to keep in sync with the staff one. What differs is
 * identity: there is no `actingUserId` here, only a token, so both use cases
 * are called with `actingUserId: null` (see their own docs for what that does
 * downstream). "Re-quote" is not a third domain transition — it is Reject
 * with a note the client is required to leave, so staff sees what to change
 * rather than just a bare decline.
 */
export class RespondToPublicQuotationUseCase {
  constructor(
    private readonly reader: IPublicQuotationReader,
    private readonly acceptUseCase: MarkQuotationAcceptedUseCase,
    private readonly rejectUseCase: MarkQuotationRejectedUseCase
  ) {}

  async execute(input: {
    token: string;
    decision: PublicQuotationDecision;
    note?: string | null;
  }): Promise<RespondToPublicQuotationResult> {
    if (!input.token || input.token.trim() === '') return { outcome: 'not_found' };

    const view = await this.reader.findByShareToken(input.token);
    if (!view) return { outcome: 'not_found' };

    try {
      if (input.decision === 'accept') {
        await this.acceptUseCase.execute({
          tenantId: view.tenantId,
          quotationId: view.quotationId,
          actingUserId: null,
          access: null,
        });
      } else {
        await this.rejectUseCase.execute({
          tenantId: view.tenantId,
          quotationId: view.quotationId,
          actingUserId: null,
          access: null,
          note: input.note ?? null,
        });
      }
      return { outcome: 'ok' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      // The one error both use cases throw for "not Sent any more" — already
      // responded, or (impossibly, given a live token) still a draft. That is
      // a race the client can silently reconcile to: nothing was lost, the
      // quotation just moved on, so the current view is returned as-is.
      if (message.startsWith('Invalid state transition')) {
        return { outcome: 'invalid_state' };
      }

      /*
       * Anything else is a real failure, not a state race — most concretely,
       * Accept's pre-flight stock check throwing "Insufficient stock for
       * product X at warehouse Y" (or "Stock level not found for..."). That
       * must NOT be swallowed into `invalid_state`: doing so previously made
       * the route hand back the unchanged, still-Sent quotation with no
       * explanation, which the client experienced as "I clicked Confirm and
       * nothing happened." The raw message names internal product/warehouse
       * ids, so it is not sent to the client — only used here to choose a
       * message that is.
       */
      const isStockFailure = /stock/i.test(message);
      return {
        outcome: 'failed',
        message: isStockFailure
          ? "This quotation can't be accepted as quoted — one or more items are no longer available in the quoted quantity. Please contact the sender for an updated quote."
          : 'Something went wrong on our end. Please try again, or contact the sender if the problem continues.',
      };
    }
  }
}
