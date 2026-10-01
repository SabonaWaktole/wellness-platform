import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, MapPin } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LookupListEditor, type LookupColumn } from '../../../components/settings/LookupListEditor/LookupListEditor';
import editorStyles from '../../../components/settings/LookupListEditor/LookupListEditor.module.css';
import { useActiveLookups } from '../../../hooks/useActiveLookups';
import type { PriceZone } from '../../../services/pricingService';
import { lookupLabel } from '../../../utils/lookupLabel';
import type { PricingPanelProps } from './pricingTabs';
import { pricingErrorMessage } from './pricingErrorMessage';
import styles from './PricingSettings.module.css';

const ALL_AREAS = '';

/**
 * Price zones (FR-PCF-05): a label and location surcharge, plus the
 * predefined M1 cities the zone covers. A city may be in several zones
 * (FR-PRC-06); active cities in no zone are listed as a warning, since a
 * company there gets "Price on request".
 */
export const PriceZonesPanel = ({ config, pricing }: PricingPanelProps) => {
  const { t, i18n } = useTranslation('settings');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const zone = config.zones.find((candidate) => candidate.id === zoneId) ?? null;

  const columns: LookupColumn<PriceZone>[] = [
    {
      field: 'surchargePercent',
      header: t('pricing.columns.surcharge'),
      render: (item) => t('pricing.percent', { value: item.surchargePercent }),
      renderInput: ({ id, label, value, onChange }) => (
        <input id={id} className={editorStyles.input} aria-label={label} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      ),
      draftOf: (item) => item?.surchargePercent ?? '',
    },
    {
      field: 'cities',
      header: t('pricing.columns.cities'),
      render: (item) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setZoneId(item.id)}
          aria-label={t('pricing.zoneCities.button', { name: lookupLabel(item, i18n.language) })}
        >
          <MapPin size={14} aria-hidden="true" />
          {item.cityIds.length > 0 ? t('pricing.zoneCities.count', { count: item.cityIds.length }) : t('pricing.zoneCities.none')}
        </Button>
      ),
      // Cities are edited with the picker below, not in the row.
      renderInput: () => null,
      draftOf: () => '',
    },
  ];

  return (
    <div className={styles.stack}>
      <CitiesWithoutZoneWarning cities={pricing.citiesWithoutZone} />

      <LookupListEditor
        caption={t('pricing.tabs.zones')}
        items={config.zones}
        columns={columns}
        toValues={(draft) => ({ surchargePercent: draft.surchargePercent.trim() })}
        onCreate={(values) => pricing.create('zones', values)}
        onUpdate={(id, values) => pricing.update('zones', id, values)}
        onReorder={(ids) => pricing.reorder('zones', ids)}
        onSetActive={(id, active) => pricing.setActive('zones', id, active)}
        onDelete={async (id) => {
          await pricing.remove('zones', id);
          if (id === zoneId) setZoneId(null);
        }}
        errorMessage={(err) => pricingErrorMessage(err, t)}
      />

      {zone && <ZoneCityPicker key={zone.id} zone={zone} onClose={() => setZoneId(null)} onSave={pricing.setZoneCities} />}
    </div>
  );
};

const CitiesWithoutZoneWarning = ({ cities }: { cities: PricingPanelProps['pricing']['citiesWithoutZone'] }) => {
  const { t, i18n } = useTranslation('settings');
  if (cities.length === 0) {
    return <p className={styles.mutedText}>{t('pricing.citiesWithoutZone.none')}</p>;
  }
  return (
    <section className={styles.warning} aria-labelledby="cities-without-zone-title">
      <h3 id="cities-without-zone-title" className={styles.warningTitle}>
        <AlertTriangle size={16} aria-hidden="true" />
        {t('pricing.citiesWithoutZone.title', { count: cities.length })}
      </h3>
      <p>{t('pricing.citiesWithoutZone.description')}</p>
      <ul className={styles.warningList}>
        {cities.map((city) => (
          <li key={city.id}>
            <Badge variant="warning">
              {t('pricing.citiesWithoutZone.item', {
                city: lookupLabel(city, i18n.language),
                area: lookupLabel({ nameSq: city.areaNameSq, nameEn: city.areaNameEn }, i18n.language),
              })}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * Checkboxes grouped by area, filterable to one area. Only active cities are
 * offered; a city the zone already holds but that was deactivated since stays
 * in the zone unless the Administrator removes it elsewhere, so saving here
 * never drops it silently.
 */
const ZoneCityPicker = ({
  zone,
  onClose,
  onSave,
}: {
  zone: PriceZone;
  onClose: () => void;
  onSave: (zoneId: string, cityIds: string[]) => Promise<void>;
}) => {
  const { t, i18n } = useTranslation('settings');
  const areas = useActiveLookups('areas');
  const cities = useActiveLookups('cities');
  const [selected, setSelected] = useState(() => new Set(zone.cityIds));
  const [areaFilter, setAreaFilter] = useState(ALL_AREAS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = lookupLabel(zone, i18n.language);

  const groups = useMemo(
    () =>
      areas
        .filter((area) => areaFilter === ALL_AREAS || area.id === areaFilter)
        .map((area) => ({ area, cities: cities.filter((city) => city.areaId === area.id) }))
        .filter((group) => group.cities.length > 0),
    [areas, cities, areaFilter]
  );

  const toggle = (cityId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(zone.id, [...selected]);
      onClose();
    } catch (err) {
      setError(pricingErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.cityPicker} aria-labelledby="zone-city-picker-title">
      <h3 id="zone-city-picker-title" className={styles.cityPickerTitle}>
        {t('pricing.zoneCities.title', { name })}
      </h3>

      <label className={styles.field}>
        <span>{t('pricing.zoneCities.area')}</span>
        <select className={editorStyles.select} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value={ALL_AREAS}>{t('pricing.zoneCities.allAreas')}</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {lookupLabel(area, i18n.language)}
            </option>
          ))}
        </select>
      </label>

      {groups.map(({ area, cities: areaCities }) => (
        <fieldset key={area.id} className={styles.cityGroup}>
          <legend>{lookupLabel(area, i18n.language)}</legend>
          <div className={styles.cityOptions}>
            {areaCities.map((city) => (
              <label key={city.id} className={styles.checkbox}>
                <input type="checkbox" checked={selected.has(city.id)} onChange={() => toggle(city.id)} />
                {lookupLabel(city, i18n.language)}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}
      <div className={styles.toolbar}>
        <Button size="sm" onClick={() => void save()} isLoading={saving}>
          {t('pricing.zoneCities.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          {t('pricing.zoneCities.cancel')}
        </Button>
      </div>
    </section>
  );
};
