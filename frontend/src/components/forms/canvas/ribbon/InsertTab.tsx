import React from 'react';
import { useTranslation } from 'react-i18next';
import { FilePlus2 } from 'lucide-react';
import { RibbonGroup } from './RibbonGroup';
import { RibbonButton } from './RibbonButton';
import { AddMenu, type AddMenuProps } from '../AddMenu';

export interface InsertTabProps extends AddMenuProps {
  onAddPage: () => void;
}

/**
 * Insert: everything that puts something new into the document.
 *
 * `AddMenu` is reused wholesale rather than reimplemented as ribbon buttons.
 * It generates its items from `ADDABLE_COMPONENTS`, so a component type
 * registered tomorrow appears here with no edit to this file — the open
 * registry the brief asks for only stays open if nothing enumerates the types
 * by hand. Rebuilding those buttons here would have quietly closed it.
 */
export const InsertTab: React.FC<InsertTabProps> = ({ onAddPage, ...addMenu }) => {
  const { t } = useTranslation('settings');

  return (
    <>
      <RibbonGroup label={t('formBuilder.ribbon.pagesGroup')}>
        <RibbonButton
          size="large"
          icon={<FilePlus2 size={20} />}
          label={t('formBuilder.blankPage')}
          onClick={onAddPage}
        />
      </RibbonGroup>

      <RibbonGroup label={t('formBuilder.ribbon.insertGroup')}>
        <AddMenu {...addMenu} />
      </RibbonGroup>
    </>
  );
};
