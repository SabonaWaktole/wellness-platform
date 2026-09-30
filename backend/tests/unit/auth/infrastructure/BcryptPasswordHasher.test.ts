import * as bcrypt from 'bcrypt';
import { BcryptPasswordHasher } from '../../../../src/auth/infrastructure/BcryptPasswordHasher';

describe('BcryptPasswordHasher (NFR-SEC-02)', () => {
  const hasher = new BcryptPasswordHasher();

  it('NFR-SEC-02 hashes with bcrypt at a cost of at least 10', async () => {
    const hash = await hasher.hash('Password1');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(bcrypt.getRounds(hash)).toBeGreaterThanOrEqual(10);
  });

  it('never stores the plain password and verifies it against the hash', async () => {
    const hash = await hasher.hash('Password1');
    expect(hash).not.toContain('Password1');
    await expect(hasher.compare('Password1', hash)).resolves.toBe(true);
    await expect(hasher.compare('Password2', hash)).resolves.toBe(false);
  });
});
