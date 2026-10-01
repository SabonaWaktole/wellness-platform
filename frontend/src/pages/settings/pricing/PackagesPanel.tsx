import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ListChecks, Star, X } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import type { Service, ServicePackage } from '../../../services/pricingService';
import { lookupLabel } from '../../../utils/lookupLabel';
import type { PricingPanelProps } from './pricingTabs';
import { descriptionColumns, descriptionValues } from './descriptionColumns';
import { pricingErrorMessage } from './pricingErrorMessage';
import styles from './PricingSettings.module.css';

/** A new package's services travel in the draft as one comma-separated string of ids. */
const idsOf = (value: string) => (value ? value.split(',') : []);

/**
 * Service packages (FR-PCF-06): a label, description and an ordered list of
 * services, one of them the default the pricing screen preselects. A new
 * package is created with its services; afterwards they are changed with the
 * picker, which also orders them as the offer lists them. The package does
 * not change the price (Q11).
 */
export const PackagesPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t, i18n } = useTranslation('settings');
  const [packageId, setPackageId] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const pkg = config.packages.find((candidate) => candidate.id === packageId) ?? null;
  const activeServices = config.services.filter((service) => service.active);

  const makeDefault = async (id: string) => {
    setDefaultError(null);
    try {
      await pricing.setDefaultPackage(id);
    } catch (err) {
      setDefaultError(pricingErrorMessage(err, t));
    }
  };

  const columns: LookupColumn<ServicePackage>[] = [
    ...descriptionColumns<ServicePackage>(t),
    {
      field: 'serviceIds',
      header: t('pricing.columns.services'),
      render: (item) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPackageId(item.id)}
          aria-label={t('pricing.packages.servicesButton', { name: lookupLabel(item, i18n.language) })}
        >
          <ListChecks size={14} aria-hidden="true" />
          {t('pricing.packages.count', { count: item.serviceIds.length })}
        </Button>
      ),
      // A new package is created with its services; an existing one changes them in the picker.
      renderInput: ({ label, value, onChange, isNew }) =>
        isNew ? (
          <fieldset className={styles.checkGroup}>
            <legend className={editorStyles.srOnly}>{label}</legend>
            {activeServices.map((service) => {
              const selected = idsOf(value);
              return (
                <label key={service.id} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={selected.includes(service.id)}
                    onChange={(e) =>
                      onChange(
                        (e.target.checked ? [...selected, service.id] : selected.filter((id) => id !== service.id)).join(',')
                      )
                    }
                  />
                  {lookupLabel(service, i18n.language)}
                </label>
              );
            })}
          </fieldset>
        ) : (
          <span className={editorStyles.muted}>{t('pricing.packages.servicesInPicker')}</span>
        ),
      draftOf: (item) => item?.serviceIds.join(',') ?? '',
    },
    {
      field: 'isDefault',
      header: t('pricing.columns.default'),
      render: (item) =>
        item.isDefault ? (
          <Badge variant="primary">{t('pricing.packages.default')}</Badge>
        ) : item.active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void makeDefault(item.id)}
            aria-label={t('pricing.packages.makeDefaultFor', { name: lookupLabel(item, i18n.language) })}
          >
            <Star size={14} aria-hidden="true" />
            {t('pricing.packages.makeDefault')}
          </Button>
        ) : null,
      renderInput: () => null,
      draftOf: () => '',
    },
  ];

  return (
    <div className={styles.stack}>
      {defaultError && (
        <p className={styles.errorText} role="alert">
          {defaultError}
        </p>
      )}
      <LookupListEditor
        caption={t('pricing.tabs.packages')}
        items={config.packages}
        columns={columns}
        toValues={(draft) => ({ ...descriptionValues(draft), serviceIds: idsOf(draft.serviceIds) })}
        onCreate={(values) => pricing.create('packages', values)}
        // An existing package's services change in the picker, with their own audit entry.
        onUpdate={(id, { serviceIds: _serviceIds, ...values }) => pricing.update('packages', id, values)}
        onReorder={(ids) => pricing.reorder('packages', ids)}
        onSetActive={(id, active) => pricing.setActive('packages', id, active)}
        onDelete={async (id) => {
          await pricing.remove('packages', id);
          if (id === packageId) setPackageId(null);
        }}
        errorMessage={(err) => pricingErrorMessage(err, t)}
      />
      {pkg && (
        <PackageServicesPicker
          key={pkg.id}
          pkg={pkg}
          services={config.services}
          onClose={() => setPackageId(null)}
          onSave={pricing.setPackageServices}
        />
      )}
    </div>
  );
};

/**
 * The services of one package, in the order the offer lists them: move them
 * up and down, remove them, or add an active service. A service the package
 * holds that was deactivated since stays listed, marked, until removed here.
 */
const PackageServicesPicker = ({
  pkg,
  services,
  onClose,
  onSave,
}: {
  pkg: ServicePackage;
  services: Service[];
  onClose: () => void;
  onSave: (packageId: string, serviceIds: string[]) => Promise<void>;
}) => {
  const { t, i18n } = useTranslation('settings');
  const [selected, setSelected] = useState<string[]>(pkg.serviceIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(services.map((service) => [service.id, service]));
  const name = lookupLabel(pkg, i18n.language);
  const addable = services.filter((service) => service.active && !selected.includes(service.id));

  const move = (from: number, to: number) =>
    setSelected((current) => {
      const next = [...current];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(pkg.id, selected);
      onClose();
    } catch (err) {
      setError(pricingErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.cityPicker} aria-labelledby="package-services-title">
      <h3 id="package-services-title" className={styles.cityPickerTitle}>
        {t('pricing.packages.pickerTitle', { name })}
      </h3>

      {selected.length === 0 ? (
        <p className={styles.mutedText}>{t('pricing.packages.empty')}</p>
      ) : (
        <ol className={styles.orderedList} aria-label={t('pricing.packages.inPackage')}>
          {selected.map((id, index) => {
            const service = byId.get(id);
            const label = service ? lookupLabel(service, i18n.language) : id;
            return (
              <li key={id} className={styles.orderedItem}>
                <span className={styles.orderedName}>
                  {label}
                  {service && !service.active && <Badge variant="outline">{t('lists.inactive')}</Badge>}
                </span>
                <span className={styles.orderedActions}>
                  <button
                    type="button"
                    className={editorStyles.iconButton}
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={t('lists.moveUp', { name: label })}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={editorStyles.iconButton}
                    onClick={() => move(index, index + 1)}
                    disabled={index === selected.length - 1}
                    aria-label={t('lists.moveDown', { name: label })}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={editorStyles.iconButton}
                    onClick={() => setSelected((current) => current.filter((other) => other !== id))}
                    aria-label={t('pricing.packages.remove', { name: label })}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {addable.length > 0 && (
        <fieldset className={styles.checkGroup}>
          <legend>{t('pricing.packages.add')}</legend>
          {addable.map((service) => (
            <label key={service.id} className={styles.checkbox}>
              <input type="checkbox" checked={false} onChange={() => setSelected((current) => [...current, service.id])} />
              {lookupLabel(service, i18n.language)}
            </label>
          ))}
        </fieldset>
      )}

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}
      <div className={styles.toolbar}>
        <Button size="sm" onClick={() => void save()} isLoading={saving}>
          {t('pricing.packages.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          {t('pricing.zoneCities.cancel')}
        </Button>
      </div>
    </section>
  );
};
