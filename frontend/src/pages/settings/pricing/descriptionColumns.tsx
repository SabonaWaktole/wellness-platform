import type { TFunction } from 'i18next';
import type { LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import type { Service, ServicePackage } from '../../../services/pricingService';

/** The longest description the server takes (PricingLists.MAX_DESCRIPTION_LENGTH). */
const MAX_DESCRIPTION_LENGTH = 2000;

/** The optional sq/en descriptions of a service or package, as the offer prints them (FR-PCF-06). */
export function descriptionColumns<T extends Service | ServicePackage>(t: TFunction): LookupColumn<T>[] {
  return (['descriptionSq', 'descriptionEn'] as const).map((field) => ({
    field,
    header: t(`pricing.columns.${field}`),
    render: (item: T) => item[field] ?? <span className={editorStyles.muted}>—</span>,
    renderInput: ({ id, label, value, onChange }) => (
      <textarea
        id={id}
        className={editorStyles.input}
        aria-label={label}
        rows={2}
        maxLength={MAX_DESCRIPTION_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('lists.optional')}
      />
    ),
    draftOf: (item?: T) => item?.[field] ?? '',
  }));
}

/** The descriptions of a draft as the API takes them: trimmed, an empty one cleared. */
export const descriptionValues = (draft: Record<string, string>) => ({
  descriptionSq: draft.descriptionSq.trim() || null,
  descriptionEn: draft.descriptionEn.trim() || null,
});
