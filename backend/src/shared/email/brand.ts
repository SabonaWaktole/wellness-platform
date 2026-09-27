/**
 * What system email calls the product (FR-BR-04). A proper name, so it is the
 * same in every language. The frontend holds the same constant in
 * src/constants/brand.ts.
 */
export const PRODUCT_NAME = 'Wellness Albania';

/**
 * Where the email logo lives, relative to the frontend's public URL
 * (FRONTEND_URL). The file ships in frontend/public/email/, so it is served by
 * whatever serves the app and needs no configuration of its own. It is a PNG
 * because most mail clients do not render SVG.
 */
export const EMAIL_LOGO_PATH = '/email/wellness-plus-logo.png';

/** The logo's displayed size in email. The file is twice this, for sharp screens. */
export const EMAIL_LOGO_SIZE = { width: 180, height: 38 };

/** The logo's absolute URL for a given frontend URL, with or without a trailing slash. */
export const emailLogoUrl = (appUrl: string): string =>
  `${appUrl.replace(/\/+$/, '')}${EMAIL_LOGO_PATH}`;
