import { PrismaClient } from '@prisma/client';
import { UserKey } from './dataset';

/** The HTTP API as one signed-in user. Every call throws on a non-2xx answer, naming the request. */
export class Api {
  constructor(private readonly base: string, private readonly slug: string, private readonly token: string) {}

  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${this.slug}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async form<T = any>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${this.base}/${this.slug}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}` }, body: form });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 600)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async bytes(path: string): Promise<Buffer> {
    const res = await fetch(`${this.base}/${this.slug}${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Seeded random numbers, so a run always produces the same shape of data. */
export class Rng {
  constructor(private state: number) {}
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export type Users = Record<UserKey | 'admin', { id: string; email: string; api: Api }>;

export interface Ctx {
  prisma: PrismaClient;
  tenantId: string;
  tenantSlug: string;
  apiBase: string;
  password: string;
  emailDomain: string;
  users: Users;
  rng: Rng;
  log: (line: string) => void;
  tokenFor: (user: { id: string; role: string; warehouseId: string | null }) => string;
}

/** `YYYY-MM-DD` for today plus an offset in days (UTC calendar day). */
export const day = (offset = 0): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** A moment on a past or future day at a given hour, UTC. */
export const at = (offset: number, hour = 9, minute = 0): Date => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};

/** A one-page signed-contract PDF, drawn with the same library the app uses for offers. */
export async function contractPdf(lines: { number: string; company: string; plan: string; amount: string; period: string; startsAt: string; endsAt: string; signer: string }): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.fontSize(20).text('KONTRATË SHËRBIMI WELLNESS', { align: 'center' }).moveDown(0.5);
  doc.fontSize(11).text(`Nr. ${lines.number}`, { align: 'center' }).moveDown(1.5);
  doc.fontSize(11)
    .text('Ofruesi: Wellness Albania Sh.p.k., NIPT L51407018N, Rruga Ismail Qemali 27, Tiranë.')
    .moveDown(0.4)
    .text(`Klienti: ${lines.company}.`)
    .moveDown(0.4)
    .text(`Paketa: ${lines.plan}. Vlera: ${lines.amount} EUR, e faturuar ${lines.period}.`)
    .moveDown(0.4)
    .text(`Afati: nga ${lines.startsAt} deri më ${lines.endsAt}.`)
    .moveDown(1)
    .text('Kontrata mbulon kontrollin mjekësor vjetor të punonjësve dhe trajnimin për sigurinë dhe shëndetin në punë, sipas ofertës së pranuar nga klienti.')
    .moveDown(3);
  doc.text('Për ofruesin: ______________________', { continued: false }).moveDown(1);
  doc.text(`Për klientin (${lines.signer}): ______________________`);
  doc.end();
  return done;
}
