import { z } from 'zod';
import { DECISION_COMMENT_MAX } from '../../../application/offers/DecideDiscountApprovalUseCase';

const percentInput = z.union([z.string().min(1).max(12), z.number()]);

export const discountApprovalSchemas = {
  /** FR-DSC-06: the approver's pending list. */
  pending: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
  /** FR-DSC-06: an optional lower percent than requested, with an optional comment. */
  approve: z
    .object({
      approvedPercent: percentInput.optional(),
      comment: z.string().max(DECISION_COMMENT_MAX).nullable().optional(),
    })
    .strict(),
  /** FR-DSC-06: rejection needs a comment (FR-DSC-07 shows it). */
  reject: z.object({ comment: z.string().min(1).max(DECISION_COMMENT_MAX) }).strict(),
  empty: z.object({}).strict(),
};
