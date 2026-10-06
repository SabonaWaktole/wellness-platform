import { PerformanceResult } from './GetPerformanceUseCase';

export type ExportLocale = 'sq' | 'en';

/** One column of the exported table: the key in a row's figures and its heading. */
interface Column {
  key: string;
  sq: string;
  en: string;
  /** Money: only exported with `commercial.view`. */
  value?: boolean;
}

export const EXPORT_COLUMNS: readonly Column[] = [
  { key: 'calls', sq: 'Thirrje', en: 'Calls' },
  { key: 'emails', sq: 'Email', en: 'Emails' },
  { key: 'visits', sq: 'Vizita', en: 'Visits' },
  { key: 'meetings', sq: 'Takime', en: 'Meetings' },
  { key: 'companiesContacted', sq: 'Kompani të kontaktuara', en: 'Companies contacted' },
  { key: 'offersCreated', sq: 'Oferta të krijuara', en: 'Offers created' },
  { key: 'offersSent', sq: 'Oferta të dërguara', en: 'Offers sent' },
  { key: 'dealsWon', sq: 'Marrëveshje të fituara', en: 'Deals won' },
  { key: 'dealsLost', sq: 'Marrëveshje të humbura', en: 'Deals lost' },
  { key: 'totalValue', sq: 'Vlera totale (€)', en: 'Total value (€)', value: true },
  { key: 'conversionRate', sq: 'Shkalla e konvertimit (%)', en: 'Conversion rate (%)' },
  { key: 'followUpsCompleted', sq: 'Ndjekje të kryera', en: 'Follow-ups completed' },
  { key: 'followUpsOverdue', sq: 'Ndjekje të vonuara', en: 'Overdue follow-ups' },
  { key: 'averageTimeToClose', sq: 'Koha mesatare e mbylljes (ditë)', en: 'Average time to close (days)' },
];

export const EXPORT_TEXT = {
  sq: { title: 'Performanca e shitjeve', salesperson: 'Shitësi', total: 'Totali', period: 'Periudha', none: '—' },
  en: { title: 'Sales performance', salesperson: 'Salesperson', total: 'Total', period: 'Period', none: '—' },
} as const;

/** The columns a viewer's export carries: the value column only with `commercial.view` (FR-PRF-10). */
export const columnsFor = (canSeeValue: boolean) => EXPORT_COLUMNS.filter((column) => canSeeValue || !column.value);

/** The table of an export as text cells: the same rows, in the same order, as the screen (FR-PRF-09). */
export function exportTable(result: PerformanceResult, locale: ExportLocale, canSeeValue: boolean): { header: string[]; body: string[][] } {
  const text = EXPORT_TEXT[locale];
  const columns = columnsFor(canSeeValue);
  const cells = (figures: Record<string, unknown>) =>
    columns.map((column) => {
      const value = figures[column.key];
      return value === null || value === undefined ? text.none : String(value);
    });
  return {
    header: [text.salesperson, ...columns.map((column) => column[locale])],
    body: [
      ...result.rows.map((row) => [row.salesperson.name, ...cells(row.figures)]),
      ...(result.total ? [[text.total, ...cells(result.total.figures)]] : []),
    ],
  };
}
