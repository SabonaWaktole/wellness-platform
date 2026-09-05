import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '../../../ui/Tabs/Tabs';
import { RIBBON_TABS, type AnyRibbonTabId, type ContextualTabId } from './ribbonTypes';
import styles from './Ribbon.module.css';

export interface RibbonProps {
  activeTab: AnyRibbonTabId;
  onChangeTab: (tab: AnyRibbonTabId) => void;
  /** Raised by the current selection, or absent when nothing is selected. */
  contextualTab?: ContextualTabId;
  /** The active tab's groups. */
  children: React.ReactNode;
}

/**
 * The command surface: a tab strip over one panel of grouped controls.
 *
 * What this replaces is a single flat row holding Back, the form name, a
 * status badge, a share chip, undo/redo, four zoom controls, Print, History,
 * Preview, Save and Publish — with no indication of which belonged with
 * which. The tabs answer "what am I doing?" (working with what is here /
 * putting something in / arranging pages) before the user has to read a
 * single button.
 *
 * Only ONE panel is mounted at a time, exactly as Word does it. That is the
 * point: the surface stays small, and controls that do not apply right now
 * are not competing for attention with the document.
 */
export const Ribbon: React.FC<RibbonProps> = ({ activeTab, onChangeTab, contextualTab, children }) => {
  const { t } = useTranslation('settings');

  return (
    <div className={styles.ribbon}>
      <Tabs<AnyRibbonTabId>
        className={styles.tabs}
        label={t('formBuilder.ribbon.label')}
        activeId={activeTab}
        onChange={onChangeTab}
        tabs={[
          ...RIBBON_TABS.map((id) => ({ id: id as AnyRibbonTabId, label: t(`formBuilder.ribbon.${id}`) })),
          ...(contextualTab
            ? [{ id: contextualTab as AnyRibbonTabId, label: t(`formBuilder.ribbon.${contextualTab}`) }]
            : []),
        ]}
      />
      <div className={styles.panel} role="tabpanel" aria-label={t(`formBuilder.ribbon.${activeTab}`)}>
        {children}
      </div>
    </div>
  );
};
