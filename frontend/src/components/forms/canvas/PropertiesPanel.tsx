import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../../ui/TextInput/TextInput';
import { SelectInput } from '../../ui/SelectInput/SelectInput';
import { TagInput } from '../../ui/TagInput/TagInput';
import { ColorPicker } from '../../ui/ColorPicker';
import { componentOptionsFor } from '../FormRenderer/fieldControl';
import { componentFor } from '../registry/componentRegistry';
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
  /** Dismisses the pane. Reopened from the contextual tab's launcher. */
  onClose?: () => void;
  /**
   * How many objects the selection holds. The pane formats ONE of them — the
   * primary — so with several selected it has to say so rather than let the
   * user believe a change here reached all of them.
   */
  selectionCount?: number;
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
/*
 * A NOTE ON LABELS. `SelectInput` and `TagInput` both render a real
 * <label htmlFor> when given a `label` prop; this panel used to bypass that
 * every time and emit a sibling <span> beside the control instead. It looked
 * identical and named nothing: five controls in the format pane — Field type,
 * Shown as, Options, Orientation — had no accessible name at all, and clicking
 * the word above them did not focus them either. Use the prop.
 */
export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selection,
  onChangeElement,
  onChangeSection,
  onEditText,
  onClose,
  selectionCount = 1,
}) => {
  const { t } = useTranslation('settings');

  /*
   * `ColorPicker` has always measured the chosen colour against BOTH page
   * grounds and offered to report a failure — and no caller ever supplied the
   * message, so the check ran on every render of all five pickers and could
   * never say anything. The tenant picks one colour for both themes and only
   * ever sees the one they are in, so without this a form looks fine to its
   * author and washes out for half its readers.
   */
  const contrastWarning = (theme: 'light' | 'dark', ratio: number) =>
    t(theme === 'light' ? 'formBuilder.contrastWarningLight' : 'formBuilder.contrastWarningDark', {
      ratio: ratio.toFixed(1),
    });
  // Component type names live beside the registry that defines them.
  const { t: tForms } = useTranslation('forms');

  /*
   * Nothing selected, nothing to format. The pane used to render an empty
   * shell explaining that it was empty, permanently occupying a column beside
   * the page — the opposite of letting the document be the focus.
   */
  if (!selection || (!selection.section && !selection.element)) return null;

  if (selection.section && !selection.element) {
    const section = selection.section;
    return (
      <aside className={styles.panel} data-format-pane>
        <PaneHeader
          title={t('formBuilder.sectionSettings')}
          onClose={onClose}
          selectionCount={selectionCount}
        />
        <TextInput
          label={t('formBuilder.sectionTitle')}
          value={section.title ?? ''}
          onChange={(e) => onChangeSection(section.id, { title: e.target.value || undefined })}
        />

        <details className={styles.disclosure} open>
          <summary>{t('formBuilder.fillAndLine')}</summary>
          <ColorPicker
            label={t('formBuilder.backgroundColour')}
            value={section.styles?.background}
            clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
            onChange={(background) =>
              onChangeSection(section.id, { styles: { ...section.styles, background } })
            }
          />
          <ColorPicker
            label={t('formBuilder.borderColour')}
            value={section.styles?.borderColor}
            clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
            onChange={(borderColor) =>
              onChangeSection(section.id, { styles: { ...section.styles, borderColor } })
            }
          />
          <ColorPicker
            label={t('formBuilder.titleBandColour')}
            value={section.titleStyles?.background}
            clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
            onChange={(background) =>
              onChangeSection(section.id, { titleStyles: { ...section.titleStyles, background } })
            }
          />
          <ColorPicker
            label={t('formBuilder.titleTextColour')}
            value={section.titleStyles?.color}
            clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
            onChange={(color) =>
              onChangeSection(section.id, { titleStyles: { ...section.titleStyles, color } })
            }
          />
        </details>

        <SizeFields
          x={section.x}
          y={section.y}
          width={section.width}
          height={section.height}
          origin="page"
          onChange={(box) => onChangeSection(section.id, box)}
        />
      </aside>
    );
  }

  const element = selection.element!;
  const field = element.field;
  const objectName = tForms(componentFor(element.type)?.labelKey ?? '', {
    defaultValue: element.type,
  });

  const patchField = (changes: Partial<FieldSpec>) => {
    if (!field) return;
    onChangeElement(element.id, { field: { ...field, ...changes } });
  };

  return (
    <aside className={styles.panel} data-format-pane>
      <PaneHeader title={objectName} onClose={onClose} selectionCount={selectionCount} />

      {isDataBearing(element.type) && field && (
        <>
          <TextInput
            label={t('formBuilder.label')}
            value={field.label}
            onChange={(e) => patchField({ label: e.target.value })}
          />

          <div className={styles.field}>
            <SelectInput
              label={t('formBuilder.fieldType')}
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
              <SelectInput
                label={t('formBuilder.control')}
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
              <TagInput
                label={t('formBuilder.options')}
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

          {(field.dataType === 'SINGLE_SELECT' || field.dataType === 'MULTI_SELECT') && (
            <div className={styles.field}>
              <SelectInput
                label={t('formBuilder.optionColumns')}
                value={String(element.styles?.optionColumns ?? 1)}
                onChange={(e) =>
                  onChangeElement(element.id, {
                    styles: { ...element.styles, optionColumns: Number(e.target.value) as 1 | 2 | 3 | 4 },
                  })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </SelectInput>
            </div>
          )}

          {/* SIGNATURE draws through its own SignaturePad, not
              CustomFieldInput — a layout switch there would change nothing,
              so it is left off the pane rather than offered and ignored. */}
          {field.dataType !== 'SIGNATURE' && (
            <div className={styles.field}>
              <SelectInput
                label={t('formBuilder.fieldLayout')}
                value={element.styles?.fieldLayout ?? 'stacked'}
                onChange={(e) =>
                  onChangeElement(element.id, {
                    styles: {
                      ...element.styles,
                      fieldLayout: e.target.value as 'stacked' | 'inline',
                    },
                  })
                }
              >
                <option value="stacked">{t('formBuilder.fieldLayoutStacked')}</option>
                <option value="inline">{t('formBuilder.fieldLayoutInline')}</option>
              </SelectInput>
            </div>
          )}

          {/* SIGNATURE is excluded for the same reason as Field layout above
              — its own SignaturePad ignores this. */}
          {field.dataType !== 'SIGNATURE' && (
            <div className={styles.field}>
              <SelectInput
                label={t('formBuilder.density')}
                value={element.styles?.density ?? 'default'}
                onChange={(e) =>
                  onChangeElement(element.id, {
                    styles: {
                      ...element.styles,
                      density: e.target.value as 'default' | 'compact',
                    },
                  })
                }
              >
                <option value="default">{t('formBuilder.densityDefault')}</option>
                <option value="compact">{t('formBuilder.densityCompact')}</option>
              </SelectInput>
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

          {/*
            The stable data identity, kept but demoted. It is read-only —
            renaming a key would orphan every submission already stored under
            the old one (§11) — and it is an implementation concern for
            whoever consumes the submissions, not something the person laying
            out a page should have to read past on the way to the label.
          */}
          <details className={styles.disclosure}>
            <summary>{t('formBuilder.advanced')}</summary>
            <TextInput
              label={t('formBuilder.dataKey')}
              helperText={t('formBuilder.fieldKeyHelp')}
              value={field.key}
              readOnly
              onChange={() => undefined}
            />
          </details>
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
          {/* A group heading rather than a control label: what follows is a
              sentence and a button, neither of which a <label> can name. */}
          <h4 className={styles.label}>{t('formBuilder.text')}</h4>
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
          <SelectInput
            label={t('formBuilder.dividerOrientation')}
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
        <summary>{t('formBuilder.fillAndLine')}</summary>
        <ColorPicker
          label={t('formBuilder.textColour')}
          value={element.styles?.textColor}
          clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
          onChange={(textColor) => onChangeElement(element.id, { styles: { ...element.styles, textColor } })}
        />
        <ColorPicker
          label={t('formBuilder.backgroundColour')}
          value={element.styles?.background}
          clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
          onChange={(background) => onChangeElement(element.id, { styles: { ...element.styles, background } })}
        />
        <ColorPicker
          label={t('formBuilder.borderColour')}
          value={element.styles?.borderColor}
          clearLabel={t('formBuilder.clearColour')}
          contrastWarning={contrastWarning}
          onChange={(borderColor) => onChangeElement(element.id, { styles: { ...element.styles, borderColor } })}
        />
      </details>

      <SizeFields
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        origin="section"
        onChange={(box) => onChangeElement(element.id, box)}
      />
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

/**
 * The pane names what it is formatting and offers a way to dismiss itself —
 * Word's format pane closes, and a panel that cannot be put away is a panel
 * permanently competing with the page for width.
 */
const PaneHeader: React.FC<{ title: string; onClose?: () => void; selectionCount?: number }> = ({
  title,
  onClose,
  selectionCount = 1,
}) => {
  const { t } = useTranslation('settings');
  return (
    <>
      <div className={styles.paneHeader}>
        <h3 className={styles.title}>{title}</h3>
        {onClose && (
          <button type="button" className={styles.paneClose} onClick={onClose} aria-label={t('formBuilder.closePane')}>
            <X size={14} />
          </button>
        )}
      </div>
      {/*
        WHICH OF THEM THIS IS. Every control below edits the primary object,
        so with several selected the pane was quietly formatting one of them
        and looking exactly as it does when that one is all there is. The
        commands that DO act on the whole selection — align, distribute,
        duplicate, delete — are on the contextual tab, and saying the count
        here is what sends the user there instead of leaving them to discover
        that four of their five fields did not change.
      */}
      {selectionCount > 1 && (
        <p className={styles.hint}>{t('formBuilder.formattingOneOf', { count: selectionCount })}</p>
      )}
    </>
  );
};

const SizeFields: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  /** What the position is measured FROM, so the numbers mean something. */
  origin: 'page' | 'section';
  onChange: (box: { x: number; y: number; width: number; height: number }) => void;
}> = ({ x, y, width, height, origin, onChange }) => {
  const { t } = useTranslation('settings');
  const num = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  /*
   * These four numbers used to be presented as "Width (px)", "Height (px)",
   * "X" and "Y" — the last two untranslated, and all four framed as the
   * document's internal coordinates. They are the same numbers, but the owner
   * is positioning something on a page, so they are labelled the way a page
   * layout tool labels them: a size, and a position measured from a stated
   * corner. The unit is stated once per group rather than repeated inside
   * four separate labels.
   */
  return (
    <>
      <details className={styles.disclosure} open>
        <summary>{t('formBuilder.size')}</summary>
        <div className={styles.sizeRow}>
          <TextInput
            type="number"
            label={t('formBuilder.width')}
            value={String(Math.round(width))}
            onChange={(e) => onChange({ x, y, width: num(e.target.value, width), height })}
          />
          <TextInput
            type="number"
            label={t('formBuilder.height')}
            value={String(Math.round(height))}
            onChange={(e) => onChange({ x, y, width, height: num(e.target.value, height) })}
          />
        </div>
        <p className={styles.hint}>{t('formBuilder.measuredInPixels')}</p>
      </details>

      <details className={styles.disclosure}>
        <summary>{t('formBuilder.position')}</summary>
        <div className={styles.sizeRow}>
          <TextInput
            type="number"
            label={t('formBuilder.horizontal')}
            value={String(Math.round(x))}
            onChange={(e) => onChange({ x: num(e.target.value, x), y, width, height })}
          />
          <TextInput
            type="number"
            label={t('formBuilder.vertical')}
            value={String(Math.round(y))}
            onChange={(e) => onChange({ x, y: num(e.target.value, y), width, height })}
          />
        </div>
        <p className={styles.hint}>
          {origin === 'page' ? t('formBuilder.fromPageCorner') : t('formBuilder.fromSectionCorner')}
        </p>
      </details>
    </>
  );
};
