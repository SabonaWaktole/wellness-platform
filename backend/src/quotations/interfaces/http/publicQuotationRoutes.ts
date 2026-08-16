import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { GetPublicQuotationUseCase, PublicQuotationView } from '../../application/GetPublicQuotationUseCase';
import { QuotationPdfRenderer } from '../../infrastructure/QuotationPdfRenderer';
import {
  RespondToPublicQuotationUseCase,
  RespondToPublicQuotationResult,
} from '../../application/use-cases/RespondToPublicQuotationUseCase';

const respondSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

/** The same shape the GET route returns — keeps the two in one place. */
const toPublicJson = (view: PublicQuotationView) => ({
  reference: view.reference,
  status: view.status,
  issuedAt: view.issuedAt,
  sentAt: view.sentAt,
  respondedAt: view.respondedAt,
  clientName: view.clientName,
  company: {
    name: view.companyName,
    logoUrl: view.companyLogoUrl,
    address: view.companyAddress,
    contactEmail: view.companyContactEmail,
    contactPhone: view.companyContactPhone,
  },
  currency: view.currency,
  locale: view.locale,
  dateFormat: view.dateFormat,
  lines: view.lines,
  subtotal: view.subtotal,
});

/**
 * The customer-facing quotation view (§6.5).
 *
 * Mounted at `/api/public/quotations` — outside `/api/:tenantSlug` and
 * therefore outside `authenticate` and `resolveTenant`. That is the point:
 * the recipient of a quotation is not a user of the system and has no account
 * to log into, so the previous design ("Sent" flips a status and nothing
 * reaches anyone) had no way to actually deliver.
 *
 * What replaces authentication:
 *
 *  - a 256-bit token that only exists once a quotation is Sent
 *    (`generateShareToken`, `Quotation.issueShareToken`);
 *  - a use case that refuses to serve Draft or Pending Approval even when the
 *    token is valid;
 *  - the rate limit below, which is what makes brute force pointless rather
 *    than merely expensive;
 *  - `noindex`, so a link pasted somewhere public does not end up in a search
 *    engine.
 */
export const createPublicQuotationRouter = (
  getPublicQuotation: GetPublicQuotationUseCase,
  pdfRenderer: QuotationPdfRenderer,
  respondToQuotation: RespondToPublicQuotationUseCase
): Router => {
  const router = Router();

  /*
   * Tighter than the auth limiter and keyed by IP, because there is no account
   * to lock. 60/hour is generous for a customer refreshing a quotation and
   * useless for enumerating a 43-character token space.
   */
  const limiter = rateLimit({
    windowMs: 60 * 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

  router.use(limiter);

  router.use((_req: Request, res: Response, next: NextFunction) => {
    // Customer pricing must never be indexed or cached by an intermediary.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const view = await getPublicQuotation.execute(String(req.params.token));
      // 404 for every failure mode — unknown token, still a draft, wrong
      // shape. Distinguishing them would tell a probing caller which tokens
      // are real, which is exactly the signal the token length exists to deny.
      if (!view) return res.status(404).json({ error: 'Quotation not found' });

      res.json(toPublicJson(view));
    } catch (error) {
      next(error);
    }
  });

  /*
   * Accept / Reject / Re-quote — the client's response to a Sent quotation.
   *
   * "Re-quote" is not a separate endpoint: it is `/reject` with a `note`,
   * enforced client-side (the button opens a required comment box). Both
   * routes return the freshly-read view so the page updates from the response
   * instead of firing a second GET.
   */
  router.post('/:token/accept', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await respondToQuotation.execute({
        token: String(req.params.token),
        decision: 'accept',
      });
      await sendRespondResult(res, getPublicQuotation, String(req.params.token), result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:token/reject', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = respondSchema.parse(req.body ?? {});
      const result = await respondToQuotation.execute({
        token: String(req.params.token),
        decision: 'reject',
        note: body.note,
      });
      await sendRespondResult(res, getPublicQuotation, String(req.params.token), result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      next(error);
    }
  });

  router.get('/:token/pdf', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const view = await getPublicQuotation.execute(String(req.params.token));
      if (!view) return res.status(404).json({ error: 'Quotation not found' });

      const pdf = await pdfRenderer.render(view);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdf.length);
      // `inline` so a customer clicking the link reads it in the browser
      // rather than being handed a download they then have to find.
      res.setHeader(
        'Content-Disposition',
        `inline; filename="quotation-${view.reference}.pdf"`
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

/**
 * Turns a `RespondToPublicQuotationUseCase` outcome into a response.
 *
 * On success, re-reads the view rather than reusing the pre-mutation one —
 * cheap (one indexed lookup) and it guarantees the JSON the client renders
 * next is the actual committed state, not a hand-assembled guess at it.
 */
async function sendRespondResult(
  res: Response,
  getPublicQuotation: GetPublicQuotationUseCase,
  token: string,
  result: RespondToPublicQuotationResult
): Promise<void> {
  if (result.outcome === 'not_found') {
    res.status(404).json({ error: 'Quotation not found' });
    return;
  }

  if (result.outcome === 'invalid_state') {
    // The client already responded (or raced another tab into doing so).
    // Not a token problem, so the current, real state is returned rather than
    // a bare error — the page reconciles to it instead of getting stuck.
    const view = await getPublicQuotation.execute(token);
    if (!view) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    res.status(409).json(toPublicJson(view));
    return;
  }

  if (result.outcome === 'failed') {
    // A real failure (e.g. Accept's stock check), not a state race — the
    // quotation is unchanged. Returned as a bare error, deliberately NOT
    // shaped like the quotation view, so the page shows the message instead
    // of quietly re-rendering the same buttons as if nothing had happened.
    res.status(422).json({ error: result.message });
    return;
  }

  const view = await getPublicQuotation.execute(token);
  if (!view) {
    res.status(404).json({ error: 'Quotation not found' });
    return;
  }
  res.json(toPublicJson(view));
}
