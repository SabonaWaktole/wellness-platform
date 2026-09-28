import { PRODUCT_NAME, EMAIL_LOGO_SIZE, emailLogoUrl } from './brand';

/**
 * Shared HTML skeleton for all outgoing Wellness Albania email (FR-BR-01).
 *
 * Table-based rather than div/flex based: many mail clients (Outlook desktop
 * in particular) strip modern CSS layout and only render tables reliably.
 * Gradients are used where clients support them and degrade to the solid
 * `background-color` fallback declared alongside each one (Outlook ignores
 * the `background` shorthand and falls back to `background-color`).
 *
 * Callers pass already-escaped HTML fragments for `heading`/`bodyHtml` — this
 * module does not re-escape them, only `escapeHtml` values before handing
 * them to `bodyHtml`.
 */

/*
 * The Wellness Plus palette, as in the frontend's tokens.css. The button is the
 * darker teal step because white text on the logo teal itself is 3.1:1, under
 * WCAG AA; the logo teal and green only appear in the decorative accent bar.
 */
const TEAL = '#047a68';
const ACCENT_GRADIENT = 'linear-gradient(90deg, #04a68c 0%, #3daa6c 100%)';
const HEADING_COLOR = '#0b2b42';
const TEXT_COLOR = '#3d4152';
const MUTED_COLOR = '#5f6873';
const PAGE_BG = '#f1f4f6';
const CARD_BG = '#ffffff';
const BORDER_COLOR = '#e6ebee';
const EYEBROW_BG = '#e3f4f0';
const EYEBROW_COLOR = '#035e50';

const DEFAULT_FOOTER_NOTE = `This is an automated message from ${PRODUCT_NAME} — please don't reply to this email.`;

export function renderEmailLayout(params: {
  /**
   * The frontend's public URL (FRONTEND_URL). The logo is served from there,
   * so every caller passes the URL it already builds its links from.
   */
  appUrl: string;
  preheader?: string;
  /** Short uppercase context pill above the heading, e.g. "PASSWORD RESET". */
  eyebrow?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
  /** The email's language, 'sq' or 'en'. Defaults to English. */
  language?: 'sq' | 'en';
}): string {
  const { appUrl, preheader, eyebrow, heading, bodyHtml, cta, footerNote, language = 'en' } = params;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${heading}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${PAGE_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${
      preheader
        ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
        : ''
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};">
      <tr>
        <td align="center" style="padding: 40px 16px;">

          <!-- Logo. Clients that block images show the alt text in the style set here. -->
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; margin-bottom: 20px;">
            <tr>
              <td align="center">
                <img src="${emailLogoUrl(appUrl)}" width="${EMAIL_LOGO_SIZE.width}" height="${EMAIL_LOGO_SIZE.height}" alt="${PRODUCT_NAME}" style="display:block; width:${EMAIL_LOGO_SIZE.width}px; height:${EMAIL_LOGO_SIZE.height}px; border:0; outline:none; text-decoration:none; font-size:18px; font-weight:700; color:${HEADING_COLOR};" />
              </td>
            </tr>
          </table>

          <!-- Card -->
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; background-color:${CARD_BG}; border:1px solid ${BORDER_COLOR}; border-radius:16px;">
            <tr>
              <td style="background-color:${TEAL}; background:${ACCENT_GRADIENT}; height:4px; line-height:4px; font-size:0; border-radius:16px 16px 0 0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 36px 40px 4px 40px;">
                ${
                  eyebrow
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;"><tr><td style="background-color:${EYEBROW_BG}; border-radius:999px; padding: 4px 12px;"><span style="font-size:11px; font-weight:700; letter-spacing:0.06em; color:${EYEBROW_COLOR}; text-transform:uppercase;">${eyebrow}</span></td></tr></table>`
                    : ''
                }
                <h1 style="margin:0 0 18px 0; font-size:22px; line-height:30px; font-weight:700; color:${HEADING_COLOR}; letter-spacing:-0.01em;">${heading}</h1>
                <div style="font-size:15px; line-height:24px; color:${TEXT_COLOR};">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            ${
              cta
                ? `<tr>
              <td style="padding: 12px 40px 8px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:8px; background-color:${TEAL};">
                      <a href="${cta.url}" target="_blank" style="display:inline-block; padding: 13px 26px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">${cta.label}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 14px 40px 32px 40px;">
                <p style="margin:0; font-size:12px; line-height:18px; color:${MUTED_COLOR};">
                  Or copy and paste this link into your browser:<br />
                  <a href="${cta.url}" target="_blank" style="color:${TEAL}; word-break:break-all;">${cta.url}</a>
                </p>
              </td>
            </tr>`
                : `<tr><td style="padding-bottom: 28px;"></td></tr>`
            }
            <tr>
              <td style="padding: 22px 40px; border-top:1px solid ${BORDER_COLOR};">
                <p style="margin:0; font-size:12.5px; line-height:19px; color:${MUTED_COLOR};">${footerNote || DEFAULT_FOOTER_NOTE}</p>
              </td>
            </tr>
          </table>

          <!-- Sub-footer -->
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; margin-top: 24px;">
            <tr>
              <td align="center">
                <p style="margin:0; font-size:12px; line-height:18px; color:${MUTED_COLOR};">&copy; ${year} ${PRODUCT_NAME}. ${language === 'sq' ? 'Të gjitha të drejtat e rezervuara.' : 'All rights reserved.'}</p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Escapes interpolated values before they are placed into `bodyHtml`/`heading`.
 * Every value reaching an email template is potentially tenant- or
 * user-authored (company names, client names, references) and therefore
 * untrusted input landing in someone's inbox.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
