import { OfferLanguage } from '../../domain/Offer';

/**
 * Every label the offer PDF prints, in Albanian and English (NFR-I18N-02,
 * FR-OFR-06). Server-side, since the PDF is drawn on the server; a test
 * checks both languages carry the same keys. `{name}` placeholders are filled
 * by `label()`.
 */
const LABELS = {
  sq: {
    title: 'Ofertë',
    number: 'Nr. i ofertës',
    date: 'Data',
    validUntil: 'E vlefshme deri më',
    validFor: 'E vlefshme {days} ditë nga data e dërgimit',
    preparedFor: 'Për',
    nipt: 'NIPT',
    address: 'Adresa',
    contact: 'Personi i kontaktit',
    phone: 'Tel.',
    email: 'Email',
    website: 'Web',
    details: 'Të dhënat e ofertës',
    employees: 'Numri i punonjësve',
    businessType: 'Lloji i biznesit',
    riskLevel: 'Niveli i riskut',
    zone: 'Zona',
    frequency: 'Frekuenca e vizitave',
    package: 'Paketa e shërbimit',
    services: 'Shërbimet e përfshira',
    price: 'Çmimi',
    baseFee: 'Tarifa bazë',
    riskFee: 'Shtesa për riskun',
    visitFee: 'Shtesa për vizitat',
    locationFee: 'Shtesa për vendndodhjen',
    listPrice: 'Çmimi i listës në muaj',
    discount: 'Zbritja ({percent}%)',
    netMonthlyPrice: 'Çmimi neto në muaj',
    annualValue: 'Vlera vjetore ({months} muaj)',
    vatNote: 'Çmimet nuk përfshijnë TVSH-në.',
    priceOnRequest: 'Çmimi sipas kërkesës: do t’ju njoftojmë çmimin veçmas.',
    note: 'Shënim',
    salesperson: 'Përfaqësuesi i shitjeve',
    bankDetails: 'Të dhënat bankare',
    page: 'Faqe {page} nga {pages}',
    watermark: 'DRAFT – PROJEKT',
  },
  en: {
    title: 'Offer',
    number: 'Offer no.',
    date: 'Date',
    validUntil: 'Valid until',
    validFor: 'Valid for {days} days from the date sent',
    preparedFor: 'Prepared for',
    nipt: 'NIPT',
    address: 'Address',
    contact: 'Contact person',
    phone: 'Phone',
    email: 'Email',
    website: 'Web',
    details: 'Offer details',
    employees: 'Number of employees',
    businessType: 'Business type',
    riskLevel: 'Risk level',
    zone: 'Zone',
    frequency: 'Visit frequency',
    package: 'Service package',
    services: 'Services included',
    price: 'Price',
    baseFee: 'Base fee',
    riskFee: 'Risk surcharge',
    visitFee: 'Visit surcharge',
    locationFee: 'Location surcharge',
    listPrice: 'List price per month',
    discount: 'Discount ({percent}%)',
    netMonthlyPrice: 'Net monthly price',
    annualValue: 'Annual value ({months} months)',
    vatNote: 'Prices do not include VAT.',
    priceOnRequest: 'Price on request: we will let you know the price separately.',
    note: 'Note',
    salesperson: 'Sales representative',
    bankDetails: 'Bank details',
    page: 'Page {page} of {pages}',
    watermark: 'DRAFT',
  },
} as const satisfies Record<OfferLanguage, Record<string, string>>;

export type OfferPdfLabel = keyof (typeof LABELS)['sq'];

export const OFFER_PDF_LABELS: Record<OfferLanguage, Record<OfferPdfLabel, string>> = LABELS;

export function label(language: OfferLanguage, key: OfferPdfLabel, params: Record<string, string | number> = {}): string {
  return OFFER_PDF_LABELS[language][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
