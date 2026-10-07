import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { scrubCardTokens } from '../../domain/cardToken';
import type { GetPublicCardUseCase } from '../../application/use-cases/CardUseCases';

/** NFR-SEC-08: requests per hour from one address, unless the deployment sets another number. */
export const DEFAULT_CARD_REQUESTS_PER_HOUR = 60;

export const cardRequestsPerHour = (env: NodeJS.ProcessEnv = process.env): number => {
  const value = Number(env.CARD_RATE_LIMIT_PER_HOUR);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_CARD_REQUESTS_PER_HOUR;
};

/**
 * `/api/public/cards/:token` (M4 Slice 11, FR-CRD-01, FR-RBAC-30): the member's
 * card, with no login and no tenant in the path. Like the public quotation
 * route, what stands in for authentication is a 256-bit token, a per-address
 * rate limit, `noindex` and no caching anywhere (FR-CRD-08).
 *
 * An unknown or malformed token is 404 "Card not found" with one body; a
 * replaced token is 410 with its own message (FR-CRD-10). A failure is logged
 * without the token: the message is scrubbed and the request URL is never
 * logged here.
 */
export const createPublicCardRouter = (getCard: GetPublicCardUseCase, requestsPerHour: number = cardRequestsPerHour()): Router => {
  const router = Router();

  router.use(
    rateLimit({
      windowMs: 60 * 60_000,
      max: requestsPerHour,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
    })
  );

  router.use((_req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  router.get('/:token', async (req: Request, res: Response) => {
    try {
      const outcome = await getCard.execute(req.params.token);
      if (outcome.kind === 'card') return res.json({ data: outcome.card });
      if (outcome.kind === 'replaced') {
        return res.status(410).json({ error: 'This card was replaced. Ask Wellness Albania for the new link.', code: 'CARD_REPLACED' });
      }
      return res.status(404).json({ error: 'Card not found.', code: 'CARD_NOT_FOUND' });
    } catch (error) {
      console.error('CARD ERROR:', scrubCardTokens(error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'));
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
