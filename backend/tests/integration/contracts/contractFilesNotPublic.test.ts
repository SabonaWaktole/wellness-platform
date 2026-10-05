import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createApp } from '../../../src/main/app';
import { UPLOADS_DIR } from '../../../src/media/MediaService';

/**
 * NFR-SEC-06, FR-CON-19: a signed contract is read only through the contract's document endpoint,
 * never as a public `/uploads` file, however its name is spelled in the URL. Found in the M3
 * security review: a percent-encoded name (`%63ontract-…`) was served, because the block looked at
 * the undecoded path while the static handler decodes it.
 */
describe('Signed contracts are not public files (NFR-SEC-06)', () => {
  const folder = `t-files-${randomUUID()}`;
  const dir = path.join(UPLOADS_DIR, folder);
  const contract = `contract-${randomUUID()}.pdf`;
  const image = `photo-${randomUUID()}.txt`;

  beforeAll(async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, contract), '%PDF-1.3 signed');
    await fs.writeFile(path.join(dir, image), 'a public file');
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it.each([
    ['plain', (n: string) => n],
    ['percent-encoded first letter', (n: string) => n.replace(/^c/, '%63')],
    ['percent-encoded dot', (n: string) => n.replace('.pdf', '%2Epdf')],
    ['percent-encoded dash', (n: string) => n.replace('contract-', 'contract%2D')],
    ['upper case', (n: string) => n.toUpperCase().replace(/\.PDF$/, '.PDF')],
    ['double slash', (n: string) => `/${n}`],
    ['a dot segment', (n: string) => `x/../${n}`],
  ])('NFR-SEC-06 a contract file is a 404 as %s', async (_label, spell) => {
    const res = await request(createApp()).get(`/uploads/${folder}/${spell(contract)}`);
    expect(res.status).toBe(404);
    expect(res.text ?? '').not.toContain('signed');
  });

  it('NFR-SEC-06 a malformed escape is a 404, not a crash', async () => {
    expect((await request(createApp()).get(`/uploads/${folder}/%E0%A4%A`)).status).toBe(404);
  });

  it('other uploaded files are still served', async () => {
    const res = await request(createApp()).get(`/uploads/${folder}/${image}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
