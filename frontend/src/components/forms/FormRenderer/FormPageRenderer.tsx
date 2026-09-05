import React from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import { componentFor } from '../registry/componentRegistry';
import { isTextHostSection } from '../../../types/form';
import type { RenderMode } from '../registry/types';
import type { Editor } from '@tiptap/react';
import type {
  DocumentPage,
  ElementContent,
  FormElement,
  FormSection,
} from '../../../types/form';
import styles from './FormRenderer.module.css';

export type { RenderMode };

export interface FormPageRendererProps<TValues extends FieldValues = FieldValues> {
  page: DocumentPage;
  /** `edit` and `fill` collect input; `print` renders static text. One
   *  component for all three, so the paper version cannot drift from the
   *  screen version. */
  mode?: RenderMode;
  control?: Control<TValues>;
  errors?: Record<string, string>;
  /** Stored values, used by `print` to show what was filled in. */
  values?: Record<string, unknown>;
  /** Options for USER_SELECT. Supplied at render time and never stored in
   *  the document — who is on the team is not a property of the form. */
  userOptions?: { id: string; label: string }[];
  /** Uploads a data URL (a drawn signature) through the media pipeline. */
  onUploadAsset?: (dataUrl: string) => Promise<string>;
  /** react-hook-form name prefix. Submissions key off `field.key`. */
  namePrefix?: string;
  /**
   * BUILDER ONLY (spec §7). The element the owner currently has a caret
   * inside, so that element renders a live editor in place of its static
   * text. `fill` and `print` never pass it — the paper version has no caret
   * and must keep rendering through the read-only path.
   */
  editingElementId?: string;
  onElementContentChange?: (elementId: string, content: ElementContent) => void;
  onEditorReady?: (editor: Editor | null) => void;
}

/**
 * Renders ONE page of a tenant-authored document: absolutely-positioned
 * sections, each an absolutely-positioned canvas of elements, exactly as the
 * owner built it.
 *
 * Every element is drawn by its entry in the COMPONENT REGISTRY rather than
 * by a switch here — that is what makes a new component type (table, file
 * upload, rating; spec §36) a one-file addition instead of an edit to the
 * renderer, the Add menu and the properties panel at once.
 *
 * Shared deliberately by the builder canvas, the preview, the client-facing
 * fill page and print (brief §6) — a second renderer is how the form an owner
 * designs and the form a client fills start disagreeing about layout.
 *
 * This component does NOT draw the sheet, apply zoom, or scale — those belong
 * to whatever stacks the pages, because the builder manages its own zoom and
 * print needs real mm-sized sheets.
 */
export const FormPageRenderer = <TValues extends FieldValues = FieldValues>({
  page,
  mode = 'edit',
  control,
  errors = {},
  values = {},
  userOptions = [],
  onUploadAsset,
  namePrefix = 'data',
  editingElementId,
  onElementContentChange,
  onEditorReady,
}: FormPageRendererProps<TValues>) => (
  <>
    {page.sections.map((section) => (
      <div
        key={section.id}
        /*
         * A text host is a container the owner never asked for — it holds
         * words they typed straight onto the page. Drawing `.section` around
         * it would put a bordered, filled box on the paper in the builder, in
         * the client's form and in print alike, which is exactly the box they
         * did not want.
         */
        className={isTextHostSection(section) ? undefined : styles.section}
        style={sectionStyle(section)}
        data-section-id={section.id}
      >
        {section.title ? (
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle} style={titleStyle(section)}>
              {section.title}
            </h3>
          </div>
        ) : null}

        <div className={styles.sectionCanvas}>
          {section.elements.map((element) => (
            <div
              key={element.id}
              className={styles.element}
              data-element-id={element.id}
              /*
               * IN THE BUILDER THE CONTROLS ARE A PICTURE OF THE FORM, NOT THE
               * FORM. They are real inputs so the canvas and the filled form
               * can never disagree about how a field looks — but the author
               * cannot fill them (the selection overlay takes the clicks), and
               * they were still in the tab order: 24 dead stops between the
               * page rail and the format pane, each one focusable and none of
               * them doing anything.
               *
               * The element being TYPED INTO is the exception: its editor has
               * to keep both focus and pointer events.
               */
              inert={mode === 'edit' && element.id !== editingElementId}
              style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
              }}
            >
              <ElementRenderer
                element={element}
                mode={mode}
                control={control as Control<FieldValues> | undefined}
                errors={errors}
                values={values}
                userOptions={userOptions}
                onUploadAsset={onUploadAsset}
                namePrefix={namePrefix}
                isEditing={element.id === editingElementId}
                onElementContentChange={onElementContentChange}
                onEditorReady={onEditorReady}
              />
            </div>
          ))}
        </div>
      </div>
    ))}
  </>
);

const ElementRenderer: React.FC<{
  element: FormElement;
  mode: RenderMode;
  control?: Control<FieldValues>;
  errors: Record<string, string>;
  values: Record<string, unknown>;
  userOptions: { id: string; label: string }[];
  onUploadAsset?: (dataUrl: string) => Promise<string>;
  namePrefix: string;
  isEditing: boolean;
  onElementContentChange?: (elementId: string, content: ElementContent) => void;
  onEditorReady?: (editor: Editor | null) => void;
}> = ({
  element,
  mode,
  control,
  errors,
  values,
  userOptions,
  onUploadAsset,
  namePrefix,
  isEditing,
  onElementContentChange,
  onEditorReady,
}) => {
  const definition = componentFor(element.type);

  /*
   * An unknown component type renders nothing rather than throwing. A
   * document is forward-compatible data: a form authored on a newer build
   * could name a type this build has never heard of, and one such element
   * must not take the whole page down with it.
   */
  if (!definition) return null;

  // Submissions key off `field.key`, never off element id or label — that is
  // what keeps a historical submission meaningful after a redesign.
  const key = element.field?.key;

  return (
    <definition.Render
      element={element}
      mode={mode}
      control={control}
      name={key ? `${namePrefix}.${key}` : ''}
      error={key ? errors[key] : undefined}
      value={key ? values[key] : undefined}
      userOptions={userOptions}
      onUploadAsset={onUploadAsset}
      isEditing={isEditing}
      onContentChange={
        isEditing && onElementContentChange
          ? (content) => onElementContentChange(element.id, content)
          : undefined
      }
      onEditorReady={isEditing ? onEditorReady : undefined}
    />
  );
};

const sectionStyle = (section: FormSection): React.CSSProperties => ({
  position: 'absolute',
  left: section.x,
  top: section.y,
  width: section.width,
  height: section.height,
  background: section.styles?.background,
  borderColor: section.styles?.borderColor,
  borderRadius: section.styles?.radius,
  padding: section.padding,
});

const titleStyle = (section: FormSection): React.CSSProperties => ({
  fontSize: section.titleStyles?.fontSize,
  color: section.titleStyles?.color,
  textAlign: section.titleStyles?.align,
});
