import type { TFunction } from 'i18next';

const KNOWN_CODES = [
  'BUSINESS_TYPE_REQUIRED',
  'BUSINESS_TYPE_INACTIVE',
  'EMPLOYEE_COUNT_INVALID',
  'AREA_REQUIRED',
  'CITY_REQUIRED',
  'CITY_NOT_IN_AREA',
  'AREA_INACTIVE',
  'CITY_INACTIVE',
  'TAX_ID_TAKEN',
  'EMAIL_INVALID',
  'PHONE_INVALID',
  'WEBSITE_INVALID',
];

/** The company create/update API's refusals (Slice 11), in the user's language; anything else is the generic message. */
export function clientErrorMessage(err: any, t: TFunction): string {
  const code = err?.response?.data?.code;
  if (KNOWN_CODES.includes(code)) return t(`form.errors.${code}`);
  return err?.response?.data?.error || t('form.errors.generic');
}

/** The field name a coded error points at, if any — for showing the message next to the right input. */
export function clientErrorField(err: any): string | undefined {
  return err?.response?.data?.field;
}
