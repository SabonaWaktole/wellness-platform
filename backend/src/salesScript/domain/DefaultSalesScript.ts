import type { RichTextDoc, RichTextNode } from '../../shared/domain/richText';

/**
 * The placeholder script every workspace starts with (FR-SCR-03), published
 * as version 1, until Wellness Albania sends the real text (SRS §11.3). Its
 * sections are the ones the SRS names; the Administrator replaces the text
 * from Settings → Sales script.
 *
 * `PrismaSalesScriptSeeder` writes it for new workspaces; the migration
 * `20261001120000_m2_sales_script` and `mysql_migration_m2_sales_script.sql`
 * write the same JSON for workspaces that already exist.
 * `DefaultSalesScript.test.ts` keeps them in step. No value contains an
 * apostrophe, so the JSON is a plain SQL literal.
 */
export const DEFAULT_SCRIPT_SECTIONS: ReadonlyArray<{ sq: string; en: string; pointSq: string; pointEn: string }> = [
  {
    sq: 'Hapja',
    en: 'Opening',
    pointSq: 'Prezantoni veten dhe Wellness Albania, dhe pyesni nëse është një moment i përshtatshëm për të folur.',
    pointEn: 'Introduce yourself and Wellness Albania, and ask whether this is a good moment to talk.',
  },
  {
    sq: 'Zbulimi i nevojave',
    en: 'Needs discovery',
    pointSq: 'Pyesni për aktivitetin e kompanisë, numrin e punonjësve dhe si e menaxhojnë sot sigurinë në punë.',
    pointEn: 'Ask about the company activity, the number of employees and how they handle safety at work today.',
  },
  {
    sq: 'Pyetje për çmimin',
    en: 'Pricing questions',
    pointSq: 'Konfirmoni numrin e punonjësve, llojin e biznesit, frekuencën e vizitave dhe qytetin para se të llogaritni çmimin.',
    pointEn: 'Confirm the number of employees, business type, visit frequency and city before calculating the price.',
  },
  {
    sq: 'Kundërshtimet',
    en: 'Objections',
    pointSq: 'Dëgjoni kundërshtimin deri në fund, pastaj shpjegoni vlerën e shërbimit për kompaninë.',
    pointEn: 'Hear the objection out, then explain the value of the service for the company.',
  },
  {
    sq: 'Mbyllja',
    en: 'Closing',
    pointSq: 'Përmblidhni ofertën dhe bini dakord për hapin e radhës dhe datën e ndjekjes.',
    pointEn: 'Summarise the offer and agree the next step and the follow-up date.',
  },
];

const text = (value: string): RichTextNode => ({ type: 'text', text: value });

function scriptIn(language: 'sq' | 'en'): RichTextDoc {
  return {
    type: 'doc',
    content: DEFAULT_SCRIPT_SECTIONS.flatMap((section) => [
      { type: 'heading', attrs: { level: 2 }, content: [text(language === 'sq' ? section.sq : section.en)] },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [text(language === 'sq' ? section.pointSq : section.pointEn)] }],
          },
        ],
      },
    ]),
  };
}

export const DEFAULT_SALES_SCRIPT: { contentSq: RichTextDoc; contentEn: RichTextDoc } = {
  contentSq: scriptIn('sq'),
  contentEn: scriptIn('en'),
};
