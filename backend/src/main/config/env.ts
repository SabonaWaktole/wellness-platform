/**
 * Startup validation for required environment configuration.
 *
 * Deliberately has NO environment conditionals (no `NODE_ENV !== 'production'`
 * escape hatch). A guard that can be switched off by an environment variable is
 * a guard that will be off in the one deployment that needed it. Every
 * environment, including tests, must supply a real JWT_SECRET.
 */

export class MissingEnvironmentError extends Error {
  constructor(name: string) {
    super(
      `${name} is not set. Refusing to start: a missing signing secret would ` +
        `silently fall back to a well-known value and make every issued token forgeable.`
    );
    this.name = 'MissingEnvironmentError';
  }
}

/** True when a variable is absent, empty, or whitespace-only. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

/** Read JWT_SECRET, throwing if it is missing or blank. */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (isBlank(secret)) {
    throw new MissingEnvironmentError('JWT_SECRET');
  }
  return secret as string;
}

/**
 * Validate all required configuration up front. Called from the server entry
 * point before the port is bound, so a misconfigured deploy fails immediately
 * and visibly rather than serving traffic with forgeable tokens.
 */
export function assertRequiredEnv(): void {
  requireJwtSecret();
  readPublicBaseUrl();
}

export class InvalidPublicBaseUrlError extends Error {
  constructor(reason: string) {
    super(`PUBLIC_BASE_URL ${reason}. Card links and QR codes are built from it, so a wrong value would issue cards that cannot be opened.`);
    this.name = 'InvalidPublicBaseUrlError';
  }
}

/**
 * The one public base URL that card links and QR codes are built from
 * (NFR-OPS-05): absolute `https://`, no trailing slash. Required in
 * production, where a card issued with a wrong address cannot be recalled.
 * Elsewhere it may be left unset, and `http://localhost` is accepted for
 * development. Returns null when unset outside production.
 */
export function readPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.PUBLIC_BASE_URL?.trim();
  if (!value) {
    if (env.NODE_ENV === 'production') throw new InvalidPublicBaseUrlError('is required in production');
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidPublicBaseUrlError(`"${value}" is not an absolute URL`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const allowedHttp = url.protocol === 'http:' && local && env.NODE_ENV !== 'production';
  if (url.protocol !== 'https:' && !allowedHttp) throw new InvalidPublicBaseUrlError('must start with https://');
  if (value.endsWith('/')) throw new InvalidPublicBaseUrlError('must not end with a slash');
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new InvalidPublicBaseUrlError('must be an origin only, with no path, query or fragment');
  }
  return value;
}

/** A public link under the configured base URL, for example `/m/<token>` (NFR-OPS-05). */
export function buildPublicLink(path: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = readPublicBaseUrl(env);
  if (base === null) throw new InvalidPublicBaseUrlError('is not set');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
