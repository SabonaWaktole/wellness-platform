import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { scrubCardTokens } from '../../domain/cardToken';
import { DEFAULT_VERIFY_REQUESTS_PER_HOUR } from '../../domain/verification';
import type { PublicVerifyUseCase } from '../../application/use-cases/VerificationUseCases';

export const verifyRequestsPerHour = (env: NodeJS.ProcessEnv = process.env): number => {
  const value = Number(env.VERIFY_RATE_LIMIT_PER_HOUR);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_VERIFY_REQUESTS_PER_HOUR;
};

/**
 * `/api/public/verify/:token` (M4 Slice 13, FR-VER-07..10, FR-RBAC-30): what a
 * partner clinic sees when it opens the card's QR link with an ordinary phone.
 * No login; the 256-bit token, a per-address limit (default 300 an hour, a
 * deployment setting, NFR-SEC-08), `noindex` and no caching stand in for it.
 *
 * Valid gives name, member ID, tier and valid-until. Everything else, a
 * suspended, closed, unknown or replaced card, is the same 200 `{ valid: false }`
 * (FR-VER-09). A failure is logged with any token-shaped text scrubbed.
 */
export const createPublicVerifyRouter = (verify: PublicVerifyUseCase, requestsPerHour: number = verifyRequestsPerHour()): Router => {
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
      res.json({ data: await verify.execute({ token: req.params.token, address: req.ip ?? '' }) });
    } catch (error) {
      console.error('VERIFY ERROR:', scrubCardTokens(error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'));
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
