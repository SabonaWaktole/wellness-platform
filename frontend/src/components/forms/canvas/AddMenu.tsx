import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutTemplate } from 'lucide-react';
import { validateImage } from '../../../services/mediaService';
import { ADDABLE_COMPONENTS } from '../registry/componentRegistry';
import type { ComponentType } from '../../../types/form';
import styles from './AddMenu.module.css';

export interface AddMenuProps {
  /** `ribbon` drops the heading and hint, which the ribbon group supplies. */
  layout?: 'sidebar' | 'ribbon';
  onAddSection: () => void;
  /** Null when no section is selected — a component needs somewhere to land. */
  targetSectionId: string | null;
  onAddComponent: (type: ComponentType) => void;
  onAddImage: (file: File) => void;
  imageError?: string | null;
  isUploadingImage?: boolean;
}

/**
 * The `[+ Add]` menu (spec §8), built entirely from the COMPONENT REGISTRY.
 *
 * Nothing here enumerates component types: adding a future one (table, file
 * upload, rating — §36) makes it appear in this menu automatically, which is
 * the whole point of the registry being open rather than a switch.
 *
 * IMAGE is the one special case — it cannot exist until an upload has
 * succeeded, so it opens a file picker instead of dropping a placeholder that
 * would be invalid the moment it was saved.
 */
export const AddMenu: React.FC<AddMenuProps> = ({
  layout = 'sidebar',
  onAddSection,
  targetSectionId,
  onAddComponent,
  onAddImage,
  imageError,
  isUploadingImage,
}) => {
  const { t } = useTranslation('forms');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (validateImage(file)) return; // surfaced via imageError
    onAddImage(file);
  };

  const disabled = !targetSectionId;

  /*
   * Two hosts, one component. In the ribbon the surrounding group already
   * carries the caption, so repeating "Add" above the buttons would be noise;
   * everything else — the registry-driven grid, the image upload path, the
   * accessible names — is identical, which is the point of not rebuilding
   * these buttons as ribbon-specific ones.
   */
  const ribbon = layout === 'ribbon';

  return (
    <div className={ribbon ? styles.ribbonMenu : styles.menu}>
      {!ribbon && <h3 className={styles.title}>{t('addMenu.title')}</h3>}

      {/* Explicit aria-labels: the visible text is just the noun ("Section",
          "Date"), which is ambiguous read on its own by a screen reader
          outside the menu's visual context. */}
      <button
        type="button"
        className={styles.primaryItem}
        onClick={onAddSection}
        aria-label={t('addMenu.addItem', { item: t('addMenu.section') })}
        title={t('addMenu.addItem', { item: t('addMenu.section') })}
      >
        <LayoutTemplate size={16} />
        <span>{t('addMenu.section')}</span>
      </button>

      {!ribbon && (
        <p className={styles.hint}>
          {disabled ? t('addMenu.selectSectionFirst') : t('addMenu.addingTo')}
        </p>
      )}

      <div className={ribbon ? styles.ribbonGrid : styles.grid}>
        {ADDABLE_COMPONENTS.map((component) => {
          const Icon = component.icon;
          const isImage = component.type === 'IMAGE';
          const label = t(component.labelKey);
          return (
            <button
              key={component.type}
              type="button"
              className={styles.item}
              disabled={disabled || (isImage && isUploadingImage)}
              aria-label={t('addMenu.addItem', { item: label })}
              /*
               * The sidebar explains a disabled state with the hint line below;
               * the ribbon has no room for it, so the reason travels on the
               * control itself. A row of grey buttons with nothing saying why
               * is the exact failure §44 names — the UI has to communicate why
               * a control is unavailable, wherever it is hosted.
               */
              title={
                disabled
                  ? t('addMenu.selectSectionFirst')
                  : isImage && isUploadingImage
                    ? t('addMenu.uploading')
                    : t('addMenu.addItem', { item: label })
              }
              onClick={() => (isImage ? fileInputRef.current?.click() : onAddComponent(component.type))}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={handleFileChange}
        aria-label={t('addMenu.uploadImage')}
      />
      {isUploadingImage && <p className={styles.hint}>{t('addMenu.uploading')}</p>}
      {imageError && (
        <p className={styles.error} role="alert">
          {imageError}
        </p>
      )}
    </div>
  );
};
