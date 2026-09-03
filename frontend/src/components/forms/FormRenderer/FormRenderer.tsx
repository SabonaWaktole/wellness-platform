import type { Control, FieldValues } from 'react-hook-form';
import { FormPageRenderer, type RenderMode } from './FormPageRenderer';
import type { FormDocument } from '../../../types/form';
import styles from './FormRenderer.module.css';

export interface FormRendererProps<TValues extends FieldValues = FieldValues> {
  layout: FormDocument;
  mode?: RenderMode;
  control?: Control<TValues>;
  errors?: Record<string, string>;
  values?: Record<string, unknown>;
  userOptions?: { id: string; label: string }[];
  onUploadAsset?: (dataUrl: string) => Promise<string>;
  namePrefix?: string;
}

/**
 * Renders a whole tenant-authored document as a stack of A4 sheets.
 *
 * This is the read-only/fill path — preview, the client-facing form and print
 * all go through here, so they cannot drift from each other. The BUILDER does
 * not use this component: it stacks its own sheets so it can layer selection
 * and drag chrome over each page, but it renders the page CONTENT with the
 * very same `FormPageRenderer`, which is where the shared-definition
 * guarantee (brief §6) actually lives.
 *
 * Zoom and scale-to-fit are deliberately not handled here — `ScaledPage`
 * wraps this for small viewports, and print.css sizes the sheets in mm.
 */
export const FormRenderer = <TValues extends FieldValues = FieldValues>({
  layout,
  mode = 'edit',
  control,
  errors,
  values,
  userOptions,
  onUploadAsset,
  namePrefix,
}: FormRendererProps<TValues>) => (
  <div className={styles.document} data-print-document>
    {layout.pages.map((page) => (
      // The outer div is the SHEET — print.css pins it to exactly 210mm x
      // 297mm. The inner div stays sized in document px (794x1123 @96dpi)
      // and is what print.css scales by the Phase 0.5-measured 0.99962
      // factor to make the px box land on that sheet without drift.
      <div key={page.id} className={styles.page} data-print-page>
        <div
          className={styles.pageContent}
          data-print-page-content
          style={{ width: layout.page.width, height: layout.page.height, background: layout.page.background }}
        >
          <FormPageRenderer
            page={page}
            mode={mode}
            control={control}
            errors={errors}
            values={values}
            userOptions={userOptions}
            onUploadAsset={onUploadAsset}
            namePrefix={namePrefix}
          />
        </div>
      </div>
    ))}
  </div>
);
