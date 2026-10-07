import { assertRequiredEnv, buildPublicLink, readPublicBaseUrl, requireJwtSecret, InvalidPublicBaseUrlError, MissingEnvironmentError } from '@main/config/env';
import { JwtTokenService } from '@auth/infrastructure/JwtTokenService';

/**
 * Env hygiene: JWT_SECRET is process-wide state shared by every suite running in
 * this worker. Snapshot the real value once and restore it after EVERY test
 * (including on failure, via afterEach rather than inline cleanup), so a failing
 * assertion here cannot leave the variable unset and break unrelated suites that
 * run later in the same worker.
 */
describe('required environment validation', () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('has a real JWT_SECRET supplied by the test environment', () => {
    // Guards the assumption the rest of the suite depends on: if this fails,
    // the test bootstrap is not supplying a secret and other failures are noise.
    expect(originalSecret).toBeDefined();
    expect(originalSecret?.trim()).not.toBe('');
  });

  describe('requireJwtSecret', () => {
    it('returns the secret when set', () => {
      process.env.JWT_SECRET = 'a-real-secret';
      expect(requireJwtSecret()).toBe('a-real-secret');
    });

    it('throws when JWT_SECRET is entirely absent', () => {
      delete process.env.JWT_SECRET;
      expect(() => requireJwtSecret()).toThrow(MissingEnvironmentError);
    });

    it('throws when JWT_SECRET is an empty string', () => {
      process.env.JWT_SECRET = '';
      expect(() => requireJwtSecret()).toThrow(MissingEnvironmentError);
    });

    it('throws when JWT_SECRET is only whitespace', () => {
      process.env.JWT_SECRET = '   ';
      expect(() => requireJwtSecret()).toThrow(MissingEnvironmentError);
    });

    it('does not fall back to a default secret', () => {
      delete process.env.JWT_SECRET;
      expect(() => requireJwtSecret()).toThrow(/Refusing to start/);
    });
  });

  describe('assertRequiredEnv (startup guard)', () => {
    it('passes when configuration is complete', () => {
      process.env.JWT_SECRET = 'a-real-secret';
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it('throws when JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      expect(() => assertRequiredEnv()).toThrow(MissingEnvironmentError);
    });

    it('throws regardless of NODE_ENV, so no environment can opt out', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        delete process.env.JWT_SECRET;
        for (const env of ['production', 'development', 'test', 'staging']) {
          process.env.NODE_ENV = env;
          expect(() => assertRequiredEnv()).toThrow(MissingEnvironmentError);
        }
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('JwtTokenService construction', () => {
    it('refuses to construct without a secret, so no token can be signed with a fallback', () => {
      delete process.env.JWT_SECRET;
      expect(() => new JwtTokenService()).toThrow(MissingEnvironmentError);
    });

    it('constructs normally when a secret is present', () => {
      process.env.JWT_SECRET = 'a-real-secret';
      expect(() => new JwtTokenService()).not.toThrow();
    });
  });

  describe('NFR-OPS-05 PUBLIC_BASE_URL', () => {
    const env = (vars: Record<string, string | undefined>) => vars as NodeJS.ProcessEnv;

    it('NFR-OPS-05 is required in production', () => {
      expect(() => readPublicBaseUrl(env({ NODE_ENV: 'production' }))).toThrow(InvalidPublicBaseUrlError);
      expect(() => readPublicBaseUrl(env({ NODE_ENV: 'production', PUBLIC_BASE_URL: '  ' }))).toThrow(/required in production/);
    });

    it('NFR-OPS-05 may be unset outside production', () => {
      expect(readPublicBaseUrl(env({ NODE_ENV: 'development' }))).toBeNull();
      expect(readPublicBaseUrl(env({}))).toBeNull();
    });

    it.each([
      ['http://wellness.example.al', 'must start with https://'],
      ['wellness.example.al', 'not an absolute URL'],
      ['https://wellness.example.al/', 'must not end with a slash'],
      ['https://wellness.example.al/app', 'origin only'],
      ['https://wellness.example.al?x=1', 'origin only'],
    ])('NFR-OPS-05 refuses %s', (value, reason) => {
      expect(() => readPublicBaseUrl(env({ NODE_ENV: 'production', PUBLIC_BASE_URL: value }))).toThrow(reason);
    });

    it('NFR-OPS-05 accepts an https origin, and http://localhost only outside production', () => {
      expect(readPublicBaseUrl(env({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://wellness.example.al' }))).toBe('https://wellness.example.al');
      expect(readPublicBaseUrl(env({ NODE_ENV: 'development', PUBLIC_BASE_URL: 'http://localhost:5173' }))).toBe('http://localhost:5173');
      expect(() => readPublicBaseUrl(env({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://localhost:5173' }))).toThrow(InvalidPublicBaseUrlError);
    });

    it('NFR-OPS-05 builds links from the configured value, and changing it changes new links', () => {
      expect(buildPublicLink('/m/abc', env({ PUBLIC_BASE_URL: 'https://a.example.al' }))).toBe('https://a.example.al/m/abc');
      expect(buildPublicLink('v/abc', env({ PUBLIC_BASE_URL: 'https://b.example.al' }))).toBe('https://b.example.al/v/abc');
    });

    it('NFR-OPS-05 the startup guard fails for an invalid value', () => {
      const original = process.env.PUBLIC_BASE_URL;
      try {
        process.env.JWT_SECRET = 'a-real-secret';
        process.env.PUBLIC_BASE_URL = 'http://not-secure.example.al';
        expect(() => assertRequiredEnv()).toThrow(InvalidPublicBaseUrlError);
      } finally {
        if (original === undefined) delete process.env.PUBLIC_BASE_URL;
        else process.env.PUBLIC_BASE_URL = original;
      }
    });
  });
});
