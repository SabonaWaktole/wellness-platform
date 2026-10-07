import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { cardPath, scrubCardTokens } from '../../domain/cardToken';
import type { GetPublicCardUseCase } from '../../application/use-cases/CardUseCases';

/** NFR-SEC-08: requests per hour from one address, unless the deployment sets another number. */
export const DEFAULT_CARD_REQUESTS_PER_HOUR = 60;

const MANIFEST_THEME_COLOUR = '#18988b';
const MANIFEST_BACKGROUND_COLOUR = '#ffffff';

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
export const createPublicCardRouter = (
  getCard: GetPublicCardUseCase,
  requestsPerHour: number = cardRequestsPerHour(),
  link: (path: string) => string = (path) => path
): Router => {
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

  /**
   * The install manifest of one card (M4 Slice 12, FR-CRD-05, D14). It is per
   * card because `start_url` is the card link itself, so the home-screen icon
   * opens this member's card. An unknown or replaced token gets the same
   * neutral not-found as the card (a replaced card must not be installable).
   * The scope is `/m/`, so the worker it goes with can never see the staff app.
   */
  router.get('/:token/manifest.webmanifest', async (req: Request, res: Response) => {
    try {
      const outcome = await getCard.execute(req.params.token);
      if (outcome.kind !== 'card') return res.status(404).json({ error: 'Card not found.', code: 'CARD_NOT_FOUND' });
      res.type('application/manifest+json');
      return res.send(
        JSON.stringify({
          name: 'Wellness+',
          short_name: 'Wellness+',
          description: 'Wellness+ member card',
          start_url: link(cardPath(String(req.params.token))),
          scope: link('/m/'),
          display: 'standalone',
          orientation: 'portrait',
          theme_color: MANIFEST_THEME_COLOUR,
          background_color: MANIFEST_BACKGROUND_COLOUR,
          icons: [
            { src: link('/icons/wellness-plus-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: link('/icons/wellness-plus-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: link('/icons/wellness-plus-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: link('/apple-touch-icon.png'), sizes: '180x180', type: 'image/png', purpose: 'any' },
          ],
        })
      );
    } catch (error) {
      console.error('CARD ERROR:', scrubCardTokens(error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'));
      return res.status(500).json({ error: 'Internal server error' });
    }
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
