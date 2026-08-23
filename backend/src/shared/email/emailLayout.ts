/**
 * Shared HTML skeleton for all outgoing NevaCRM email.
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

const INDIGO = '#4F46E5';
const VIOLET = '#7C3AED';
const GRADIENT = `linear-gradient(135deg, ${INDIGO} 0%, ${VIOLET} 100%)`;
const TEXT_COLOR = '#1a1d29';
const MUTED_COLOR = '#6b7280';
const FAINT_COLOR = '#9ca3af';
const PAGE_BG = '#f0f1f6';
const CARD_BG = '#ffffff';
const BORDER_COLOR = '#eceef3';
const EYEBROW_BG = '#eef0ff';
const EYEBROW_COLOR = '#4338ca';

const DEFAULT_FOOTER_NOTE =
  "This is an automated message from NevaCRM — please don't reply to this email.";

export function renderEmailLayout(params: {
  preheader?: string;
  /** Short uppercase context pill above the heading, e.g. "PASSWORD RESET". */
  eyebrow?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  const { preheader, eyebrow, heading, bodyHtml, cta, footerNote } = params;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
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

          <!-- Brand mark -->
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; margin-bottom: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right: 10px;">
                      <table role="presentation" width="28" height="28" cellpadding="0" cellspacing="0" border="0" style="width:28px; height:28px; border-radius:8px; background-color:${INDIGO}; background:${GRADIENT};">
                        <tr>
                          <td align="center" valign="middle" style="width:28px; height:28px; font-size:14px; font-weight:700; color:#ffffff; line-height:28px;">N</td>
                        </tr>
                      </table>
                    </td>
                    <td valign="middle">
                      <span style="font-size:16px; font-weight:700; color:${TEXT_COLOR}; letter-spacing:-0.01em;">NevaCRM</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Card -->
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; background-color:${CARD_BG}; border:1px solid ${BORDER_COLOR}; border-radius:16px;">
            <tr>
              <td style="background-color:${INDIGO}; background:${GRADIENT}; height:4px; line-height:4px; font-size:0; border-radius:16px 16px 0 0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 36px 40px 4px 40px;">
                ${
                  eyebrow
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;"><tr><td style="background-color:${EYEBROW_BG}; border-radius:999px; padding: 4px 12px;"><span style="font-size:11px; font-weight:700; letter-spacing:0.06em; color:${EYEBROW_COLOR}; text-transform:uppercase;">${eyebrow}</span></td></tr></table>`
                    : ''
                }
                <h1 style="margin:0 0 18px 0; font-size:22px; line-height:30px; font-weight:700; color:${TEXT_COLOR}; letter-spacing:-0.01em;">${heading}</h1>
                <div style="font-size:15px; line-height:24px; color:#3d4152;">
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
                    <td align="center" style="border-radius:8px; background-color:${INDIGO}; background:${GRADIENT};">
                      <a href="${cta.url}" target="_blank" style="display:inline-block; padding: 13px 26px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">${cta.label}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 14px 40px 32px 40px;">
                <p style="margin:0; font-size:12px; line-height:18px; color:${FAINT_COLOR};">
                  Or copy and paste this link into your browser:<br />
                  <a href="${cta.url}" target="_blank" style="color:${INDIGO}; word-break:break-all;">${cta.url}</a>
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
                <p style="margin:0; font-size:12px; line-height:18px; color:${FAINT_COLOR};">NevaCRM &middot; CRM built for service businesses</p>
                <p style="margin:4px 0 0 0; font-size:12px; color:${FAINT_COLOR};">&copy; ${year} NevaCRM. All rights reserved.</p>
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
