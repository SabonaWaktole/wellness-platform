import { Response } from 'supertest';

function setCookieLines(res: Response): string[] {
  const header = res.headers['set-cookie'] as unknown;
  if (!header) return [];
  return Array.isArray(header) ? header : [String(header)];
}

/** The raw `Set-Cookie` line for the `jwt` session cookie, if the response set one. */
export function jwtCookieLine(res: Response): string | undefined {
  return setCookieLines(res).find((line) => line.startsWith('jwt='));
}

/** The session token a login response set in the `jwt` cookie (the body no longer carries it). */
export function cookieJwt(res: Response): string | undefined {
  const line = jwtCookieLine(res);
  const value = line?.slice('jwt='.length).split(';')[0];
  return value ? decodeURIComponent(value) : undefined;
}
