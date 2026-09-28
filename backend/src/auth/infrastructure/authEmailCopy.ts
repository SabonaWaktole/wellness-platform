import { PRODUCT_NAME } from '../../shared/email/brand';

export type EmailLanguage = 'sq' | 'en';

/** Albanian or English; el and it fall back to English, like the interface does. */
export function emailLanguage(language?: string | null): EmailLanguage {
  return language === 'sq' ? 'sq' : 'en';
}

interface EmailCopy {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  /** Paragraphs of the body. Anything interpolated into them must already be escaped. */
  paragraphs: string[];
  cta: string;
  footerNote: string;
}

/** A workspace invitation (FR-USR-02). `name` is the escaped workspace name for the HTML, `plainName` the raw one for the subject. */
export function invitationCopy(language: EmailLanguage, name: string, plainName: string): EmailCopy {
  if (language === 'sq') {
    return {
      subject: `Jeni ftuar të bashkoheni me ${plainName}`,
      preheader: `Jeni ftuar të bashkoheni me ${plainName}`,
      eyebrow: 'Ftesë në ekip',
      heading: `Jeni ftuar të bashkoheni me ${name}`,
      paragraphs: [
        `Jeni ftuar të bashkoheni me <strong>${name}</strong> si anëtar i ekipit.`,
        'Klikoni butonin më poshtë për të pranuar ftesën dhe për të vendosur fjalëkalimin e llogarisë suaj.',
      ],
      cta: 'Prano ftesën',
      footerNote: 'Nëse nuk e prisnit këtë ftesë, mund ta shpërfillni këtë email.',
    };
  }
  return {
    subject: `You have been invited to join ${plainName}`,
    preheader: `You've been invited to join ${plainName}`,
    eyebrow: 'Team Invitation',
    heading: `You're invited to join ${name}`,
    paragraphs: [
      `You have been invited to join <strong>${name}</strong> as a team member.`,
      'Click the button below to accept the invitation and set up your account password.',
    ],
    cta: 'Accept Invitation',
    footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
  };
}

/** A password reset (FR-USR-01). */
export function passwordResetCopy(language: EmailLanguage): EmailCopy {
  if (language === 'sq') {
    return {
      subject: `Rivendosni fjalëkalimin — ${PRODUCT_NAME}`,
      preheader: `Rivendosni fjalëkalimin tuaj në ${PRODUCT_NAME}`,
      eyebrow: 'Rivendosja e fjalëkalimit',
      heading: 'Rivendosni fjalëkalimin',
      paragraphs: [
        'Morëm një kërkesë për të rivendosur fjalëkalimin tuaj. Nëse nuk e keni bërë ju këtë kërkesë, mund ta shpërfillni këtë email.',
        'Për të rivendosur fjalëkalimin, klikoni butonin më poshtë:',
      ],
      cta: 'Rivendos fjalëkalimin',
      footerNote: 'Kjo lidhje skadon pas 1 ore.',
    };
  }
  return {
    subject: `Reset your password — ${PRODUCT_NAME}`,
    preheader: `Reset your ${PRODUCT_NAME} password`,
    eyebrow: 'Password Reset',
    heading: 'Reset your password',
    paragraphs: [
      "We received a request to reset your password. If you didn't make this request, you can safely ignore this email.",
      'To reset your password, click the button below:',
    ],
    cta: 'Reset Password',
    footerNote: 'This link will expire in 1 hour.',
  };
}
