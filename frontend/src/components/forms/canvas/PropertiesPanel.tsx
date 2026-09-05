import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../../ui/TextInput/TextInput';
import { SelectInput } from '../../ui/SelectInput/SelectInput';
import { TagInput } from '../../ui/TagInput/TagInput';
import { ColorPicker } from '../../ui/ColorPicker';
import { componentOptionsFor } from '../FormRenderer/fieldControl';
import {
  isDataBearing,
  type DividerContent,
  type FieldSpec,
  type FormElement,
  type FormFieldType,
  type FormSection,
  type ImageContent,
} from '../../../types/form';
import styles from './PropertiesPanel.module.css';

export interface PropertiesPanelProps {
  selection: { section?: FormSection; element?: FormElement } | null;
  onChangeElement: (elementId: string, changes: Partial<FormElement>) => void;
  onChangeSection: (sectionId: string, changes: Partial<FormSection>) => void;
  /** Puts the caret into this element's text on the page (spec §7). */
  onEditText?: (elementId: string) => void;
}

/**
 * Contextual properties for the current selection (spec §12).
 *
 * In v3 a field is FORM-OWNED: this panel edits `element.field` inside the
 * document, and no longer reaches into the tenant's CustomFieldDefinition
 * dictionary. A field may still be BOUND to a definition
 * (`field.clientFieldId`), but that binding is set deliberately, not implied
 * by editing a label here — which is what lets a standalone document form
 * have forty fields without adding forty columns to every client record.
 *
 * Progressive disclosure (§12, §33): General is always open; Validation,
 * Appearance and Layout are collapsed until asked for, so the ordinary
 * workflow stays simple.
 */
export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selection,
  onChangeElement,
  onChangeSection,
  onEditText,
}) => {
  const { t } = useTranslation('settings');

  if (!selection || (!selection.section && !selection.element)) {
    return (
      <aside className={styles.panel}>
        <h3 className={styles.title}>{t('formBuilder.inspectorTitle')}</h3>
        <p className={styles.hint}>{t('formBuilder.inspectorEmpty')}</p>
      </aside>
    );
  }

  if (selection.section && !selection.element) {
    const section = selection.section;
    return (
      <aside className={styles.panel}>
        <h3 className={styles.title}>{t('formBuilder.sectionSettings')}</h3>
        <TextInput
          label={t('formBuilder.sectionTitle')}
          value={section.title ?? ''}
          onChange={(e) => onChangeSection(section.id, { title: e.target.value || undefined })}
        />
        <SizeFields
          x={section.x}
          y={section.y}
          width={section.width}
          height={section.height}
          onChange={(box) => onChangeSection(section.id, box)}
        />
        <ColorPicker
          label={t('formBuilder.backgroundColour')}
          value={section.styles?.background}
          clearLabel={t('formBuilder.clearColour')}
          onChange={(background) =>
            onChangeSection(section.id, { styles: { ...section.styles, background } })
          }
        />
        <ColorPicker
          label={t('formBuilder.borderColour')}
          value={section.styles?.borderColor}
          clearLabel={t('formBuilder.clearColour')}
          onChange={(borderColor) =>
            onChangeSection(section.id, { styles: { ...section.styles, borderColor } })
          }
        />
      </aside>
    );
  }

  const element = selection.element!;
  const field = element.field;

  const patchField = (changes: Partial<FieldSpec>) => {
    if (!field) return;
    onChangeElement(element.id, { field: { ...field, ...changes } });
  };

  return (
    <aside className={styles.panel}>
      <h3 className={styles.title}>{t('formBuilder.inspectorTitle')}</h3>

      {isDataBearing(element.type) && field && (
        <>
          <TextInput
            label={t('formBuilder.label')}
            value={field.label}
            onChange={(e) => patchField({ label: e.target.value })}
          />

          {/*
            The stable data identity. Shown read-only: renaming a key would
            orphan every submission already stored under the old one (§11),
            so it is minted once and never edited in place.
          */}
          <TextInput
            label={t('formBuilder.fieldKey')}
            helperText={t('formBuilder.fieldKeyHelp')}
            value={field.key}
            readOnly
            disabled
            onChange={() => undefined}
          />

          <div className={styles.field}>
            <span className={styles.label}>{t('formBuilder.fieldType')}</span>
            <SelectInput
              value={field.dataType}
              onChange={(e) => {
                const dataType = e.target.value as FormFieldType;
                // Switching the stored type can invalidate the current
                // component, so move to a compatible one in the same edit
                // rather than saving a pairing the server would refuse.
                const allowed = componentOptionsFor(dataType);
                const nextType = allowed.includes(element.type) ? element.type : allowed[0] ?? element.type;
                onChangeElement(element.id, {
                  type: nextType,
                  field: { ...field, dataType },
                });
              }}
            >
              {FORM_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`clientManagement.fieldTypes.${type}`, { defaultValue: type })}
                </option>
              ))}
            </SelectInput>
          </div>

          {componentOptionsFor(field.dataType).length > 1 && (
            <div className={styles.field}>
              <span className={styles.label}>{t('formBuilder.control')}</span>
              <SelectInput
                value={element.type}
                onChange={(e) => onChangeElement(element.id, { type: e.target.value as FormElement['type'] })}
              >
                {componentOptionsFor(field.dataType).map((option) => (
                  <option key={option} value={option}>
                    {t(`formBuilder.controls.${option}`, { defaultValue: option })}
                  </option>
                ))}
              </SelectInput>
            </div>
          )}

          {(field.dataType === 'SINGLE_SELECT' || field.dataType === 'MULTI_SELECT') && (
            <div className={styles.field}>
              <span className={styles.label}>{t('formBuilder.options')}</span>
              <TagInput
                helperText={t('formBuilder.optionsHelp')}
                value={(field.options ?? []).map((o) => o.label)}
                onChange={(labels) =>
                  patchField({
                    // `value` stays stable when a label is edited (§15): an
                    // existing option keeps the value it was submitted under,
                    // and only genuinely new labels mint a new value.
                    options: labels.map((label) => {
                      const existing = (field.options ?? []).find((o) => o.label === label);
                      return existing ?? { value: slugifyOption(label), label };
                    }),
                  })
                }
              />
            </div>
          )}

          <TextInput
            label={t('formBuilder.placeholder')}
            value={field.placeholder ?? ''}
            onChange={(e) => patchField({ placeholder: e.target.value || undefined })}
          />

          <label className={styles.field}>
            <span className={styles.label}>
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => patchField({ required: e.target.checked })}
              />{' '}
              {t('formBuilder.required')}
            </span>
          </label>

          {field.clientFieldId && (
            <p className={styles.hint}>{t('formBuilder.boundToClientField')}</p>
          )}
        </>
      )}

      {/*
        Text is no longer edited HERE. A document editor puts the caret on the
        page; a copy of the text in a side panel is the thing that made this
        feel like a form for configuring a document rather than the document
        itself. The panel now says where the text lives and offers a way in.
      */}
      {element.type === 'TEXT' && (
        <div className={styles.field}>
          <span className={styles.label}>{t('formBuilder.text')}</span>
          <p className={styles.hint}>{t('formBuilder.textEditsOnPage')}</p>
          {onEditText && (
            <button type="button" className={styles.inlineAction} onClick={() => onEditText(element.id)}>
              {t('formBuilder.editOnPage')}
            </button>
          )}
        </div>
      )}

      {element.type === 'IMAGE' && (
        <TextInput
          label={t('formBuilder.imageAlt')}
          helperText={t('formBuilder.imageAltHelp')}
          value={(element.content as ImageContent | undefined)?.alt ?? ''}
          onChange={(e) =>
            onChangeElement(element.id, {
              content: {
                ...(element.content as ImageContent),
                alt: e.target.value || undefined,
              },
            })
          }
        />
      )}

      {element.type === 'DIVIDER' && (
        <div className={styles.field}>
          <span className={styles.label}>{t('formBuilder.dividerOrientation')}</span>
          <SelectInput
            value={(element.content as DividerContent | undefined)?.orientation ?? 'horizontal'}
            onChange={(e) =>
              onChangeElement(element.id, {
                content: {
                  orientation: e.target.value as DividerContent['orientation'],
                  thickness: (element.content as DividerContent | undefined)?.thickness ?? 2,
                },
              })
            }
          >
            <option value="horizontal">{t('formBuilder.horizontal')}</option>
            <option value="vertical">{t('formBuilder.vertical')}</option>
          </SelectInput>
        </div>
      )}

      <details className={styles.disclosure}>
        <summary>{t('formBuilder.appearance')}</summary>
        <ColorPicker
          label={t('formBuilder.textColour')}
          value={element.styles?.textColor}
          clearLabel={t('formBuilder.clearColour')}
          onChange={(textColor) => onChangeElement(element.id, { styles: { ...element.styles, textColor } })}
        />
        <ColorPicker
          label={t('formBuilder.backgroundColour')}
          value={element.styles?.background}
          clearLabel={t('formBuilder.clearColour')}
          onChange={(background) => onChangeElement(element.id, { styles: { ...element.styles, background } })}
        />
        <ColorPicker
          label={t('formBuilder.borderColour')}
          value={element.styles?.borderColor}
          clearLabel={t('formBuilder.clearColour')}
          onChange={(borderColor) => onChangeElement(element.id, { styles: { ...element.styles, borderColor } })}
        />
      </details>

      <details className={styles.disclosure}>
        <summary>{t('formBuilder.layout')}</summary>
        <SizeFields
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          onChange={(box) => onChangeElement(element.id, box)}
        />
      </details>
    </aside>
  );
};

const FORM_FIELD_TYPES: FormFieldType[] = [
  'TEXT',
  'LONG_TEXT',
  'EMAIL',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'SIGNATURE',
  'USER_REFERENCE',
];

const slugifyOption = (label: string): string =>
  label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'option';

const SizeFields: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  onChange: (box: { x: number; y: number; width: number; height: number }) => void;
}> = ({ x, y, width, height, onChange }) => {
  const { t } = useTranslation('settings');
  const num = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return (
    <div className={styles.sizeRow}>
      <TextInput type="number" label={t('formBuilder.widthPx')} value={String(Math.round(width))} onChange={(e) => onChange({ x, y, width: num(e.target.value, width), height })} />
      <TextInput type="number" label={t('formBuilder.heightPx')} value={String(Math.round(height))} onChange={(e) => onChange({ x, y, width, height: num(e.target.value, height) })} />
      <TextInput type="number" label="X" value={String(Math.round(x))} onChange={(e) => onChange({ x: num(e.target.value, x), y, width, height })} />
      <TextInput type="number" label="Y" value={String(Math.round(y))} onChange={(e) => onChange({ x, y: num(e.target.value, y), width, height })} />
    </div>
  );
};
