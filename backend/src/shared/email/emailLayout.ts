/**
 * Shared HTML skeleton for all outgoing NevaCRM email.
 *
 * Table-based rather than div/flex based: many mail clients (Outlook desktop
 * in particular) strip modern CSS layout and only render tables reliably.
 * Callers pass already-escaped HTML fragments for `heading`/`bodyHtml` — this
 * module does not re-escape them, only `escapeHtml` values before handing
 * them to `bodyHtml`.
 */

const BRAND_COLOR = '#4F46E5';
const TEXT_COLOR = '#1f2430';
const MUTED_COLOR = '#6b7280';
const PAGE_BG = '#f4f4f7';
const CARD_BG = '#ffffff';
const BORDER_COLOR = '#e5e7eb';

const DEFAULT_FOOTER_NOTE =
  "This is an automated message from NevaCRM — please don't reply to this email.";

export function renderEmailLayout(params: {
  preheader?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  const { preheader, heading, bodyHtml, cta, footerNote } = params;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${PAGE_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${
      preheader
        ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${preheader}</div>`
        : ''
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; background-color:${CARD_BG}; border:1px solid ${BORDER_COLOR}; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_COLOR}; height:4px; line-height:4px; font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 28px 40px 0 40px;">
                <span style="font-size:20px; font-weight:700; color:${BRAND_COLOR}; letter-spacing:-0.02em;">NevaCRM</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0; font-size:20px; line-height:28px; color:${TEXT_COLOR};">${heading}</h1>
                <div style="font-size:15px; line-height:24px; color:${TEXT_COLOR};">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            ${
              cta
                ? `<tr>
              <td style="padding: 8px 40px 32px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:6px; background-color:${BRAND_COLOR};">
                      <a href="${cta.url}" target="_blank" style="display:inline-block; padding: 12px 24px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:6px;">${cta.label}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
                : `<tr><td style="padding-bottom: 24px;"></td></tr>`
            }
            <tr>
              <td style="padding: 20px 40px; border-top:1px solid ${BORDER_COLOR}; background-color:${PAGE_BG};">
                <p style="margin:0; font-size:12px; line-height:18px; color:${MUTED_COLOR};">${footerNote || DEFAULT_FOOTER_NOTE}</p>
              </td>
            </tr>
          </table>
          <p style="margin: 20px 0 0 0; font-size:12px; color:${MUTED_COLOR};">&copy; ${new Date().getFullYear()} NevaCRM</p>
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
