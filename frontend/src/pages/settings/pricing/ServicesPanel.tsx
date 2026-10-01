import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { LookupListEditor } from '../../../components/settings/LookupListEditor/LookupListEditor';
import type { Service } from '../../../services/pricingService';
import { lookupLabel } from '../../../utils/lookupLabel';
import type { PricingPanelProps } from './pricingTabs';
import { descriptionColumns, descriptionValues } from './descriptionColumns';
import { pricingErrorMessage } from './pricingErrorMessage';

interface PendingDeactivation {
  service: Service;
  packageNames: string[];
}

/**
 * Services (FR-PCF-06): what the offer describes, with a label and
 * description in sq and en. No price: packages describe, the pricing model
 * prices (Q11). Deactivating a service that active packages hold asks first,
 * naming them; a service in a package cannot be deleted.
 */
export const ServicesPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t, i18n } = useTranslation('settings');
  const [pending, setPending] = useState<PendingDeactivation | null>(null);
  // Settles the editor's own deactivate call once the dialog is answered, so
  // a refusal still shows where the editor shows its errors.
  const settle = useRef<{ resolve: () => void; reject: (error: unknown) => void } | null>(null);

  const packagesUsing = (serviceId: string) =>
    config.packages.filter((pkg) => pkg.active && pkg.serviceIds.includes(serviceId)).map((pkg) => lookupLabel(pkg, i18n.language));

  const setActive = (id: string, active: boolean) => {
    const service = config.services.find((candidate) => candidate.id === id);
    const packageNames = active ? [] : packagesUsing(id);
    if (!service || packageNames.length === 0) return pricing.setActive('services', id, active);
    return new Promise<void>((resolve, reject) => {
      settle.current = { resolve, reject };
      setPending({ service, packageNames });
    });
  };

  const close = () => {
    settle.current?.resolve();
    settle.current = null;
    setPending(null);
  };

  const confirm = async () => {
    const current = settle.current;
    settle.current = null;
    setPending(null);
    try {
      await pricing.setActive('services', pending!.service.id, false);
      current?.resolve();
    } catch (err) {
      current?.reject(err);
    }
  };

  return (
    <>
      <LookupListEditor
        caption={t('pricing.tabs.services')}
        items={config.services}
        columns={descriptionColumns<Service>(t)}
        toValues={descriptionValues}
        onCreate={(values) => pricing.create('services', values)}
        onUpdate={(id, values) => pricing.update('services', id, values)}
        onReorder={(ids) => pricing.reorder('services', ids)}
        onSetActive={setActive}
        onDelete={(id) => pricing.remove('services', id)}
        errorMessage={(err) => pricingErrorMessage(err, t)}
      />
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={close}
        onConfirm={confirm}
        title={t('pricing.services.deactivateTitle', { name: pending ? lookupLabel(pending.service, i18n.language) : '' })}
        message={t('pricing.services.deactivateMessage', {
          names: pending?.packageNames.join(', ') ?? '',
          count: pending?.packageNames.length ?? 0,
        })}
        confirmLabel={t('pricing.services.deactivateConfirm')}
      />
    </>
  );
};
