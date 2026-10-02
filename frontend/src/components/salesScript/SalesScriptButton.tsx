import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Can } from '../auth/Can';
import { Button } from '../ui/Button/Button';
import { useSalesScriptStore } from '../../store/useSalesScriptStore';

export interface SalesScriptButtonProps {
  className?: string;
  /** The outlined page-action style (company page) instead of the header's bare icon. */
  outline?: boolean;
}

/**
 * Opens and closes the sales script panel (FR-SCR-01): in the header on every
 * page, and among the actions of the company page, for users with "Sales
 * script: view". Reception does not see it.
 */
export const SalesScriptButton = ({ className, outline = false }: SalesScriptButtonProps) => {
  const { t } = useTranslation('common');
  const isOpen = useSalesScriptStore((state) => state.isOpen);
  const toggle = useSalesScriptStore((state) => state.toggle);
  const props = {
    className,
    onClick: toggle,
    'aria-pressed': isOpen,
    'aria-label': t('salesScript.button'),
    title: t('salesScript.button'),
  };

  return (
    <Can permission="script.view">
      {outline ? (
        <Button variant="outline" {...props}>
          <ScrollText size={18} aria-hidden="true" />
        </Button>
      ) : (
        <button type="button" {...props}>
          <ScrollText size={20} aria-hidden="true" />
        </button>
      )}
    </Can>
  );
};
