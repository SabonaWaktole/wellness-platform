import request from 'supertest';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../../src/main/app';
import { SmtpEmailSender } from '../../../src/auth/infrastructure/SmtpEmailSender';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';

interface SentMail {
  from: { name: string; address: string };
  subject: string;
  html: string;
}

/**
 * FR-BR-01 / FR-BR-04: the mail the system sends is Wellness Albania's.
 *
 * Everything is real — route, use case, repositories and the SMTP sender's
 * templates — except the wire: nodemailer's JSON transport composes the
 * message exactly as it would for SMTP and hands it back instead of sending.
 */
describe('system email branding', () => {
  const appUrl = 'https://app.wellness.test';
  const runId = uuidv4().slice(0, 8);
  const slug = `brand-mail-${runId}`;
  const ownerEmail = `owner-${runId}@wellness.test`;

  let prisma: PrismaClient;
  let app: any;
  let sent: SentMail[];
  let tenantId: string;
  let ownerToken: string;

  /** Both flows send after responding, so the message can land a tick later. */
  const nextMail = async (): Promise<SentMail> => {
    for (let attempt = 0; attempt < 100 && sent.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(sent).toHaveLength(1);
    return sent[0];
  };

  const expectWellnessBranding = (mail: SentMail) => {
    expect(mail.from.name).toBe('Wellness Albania');
    expect(mail.html).toContain(`src="${appUrl}/email/wellness-plus-logo.png"`);
    expect(mail.html).toContain('alt="Wellness Albania"');
    expect(JSON.stringify(mail)).not.toMatch(/neva/i);
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const compose = transporter.sendMail.bind(transporter);
    jest.spyOn(transporter, 'sendMail').mockImplementation(async (mail: any) => {
      const info: any = await compose(mail);
      sent.push(JSON.parse(info.message));
      return info;
    });

    app = createApp({ emailSender: new SmtpEmailSender({ transporter, appUrl }) });
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sent = [];
    tenantId = uuidv4();
    const ownerId = uuidv4();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Albania', urlSlug: slug } });
    await prisma.user.create({
      data: { id: ownerId, email: ownerEmail, hashedPassword: 'x', role: 'BUSINESS_OWNER', tenantId },
    });
    ownerToken = new JwtTokenService().sign({
      userId: ownerId,
      role: 'BUSINESS_OWNER',
      tenantId,
      tenantSlug: slug,
      warehouseId: null,
    });
  });

  afterEach(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.invitation.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('FR-BR-04 sends the password reset email as Wellness Albania, never Neva', async () => {
    await request(app)
      .post(`/api/${slug}/auth/password-reset/request`)
      .send({ email: ownerEmail })
      .expect(200);

    const mail = await nextMail();
    expectWellnessBranding(mail);
    expect(mail.subject).toContain('Wellness Albania');
    expect(mail.html).toContain(`${appUrl}/reset-password?token=`);
  });

  it('FR-BR-04 sends the team invitation as Wellness Albania, never Neva', async () => {
    await request(app)
      .post(`/api/${slug}/auth/invitations`)
      .set('Cookie', [`jwt=${ownerToken}`])
      .send({ email: `invitee-${runId}@wellness.test`, role: 'STAFF' })
      .expect(200);

    const mail = await nextMail();
    expectWellnessBranding(mail);
    expect(mail.subject).toContain('Wellness Albania');
    expect(mail.html).toContain(`${appUrl}/invitations/accept?token=`);
  });
});
