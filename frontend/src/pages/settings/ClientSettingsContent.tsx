import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2 } from 'lucide-react';
import { SettingsLayout } from '../../components/layout/SettingsLayout';
import { SlideOver } from '../../components/ui/SlideOver';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';
import { SelectInput } from '../../components/ui/SelectInput';
import { ExcelImportButton } from '../../components/clients/ExcelImportButton';
import { clientService } from '../../services/clientService';
import { useClientSettings, useDefineCustomField, useDefineOutcomeCategory } from '../../hooks/useClients';
import styles from './ClientSettingsContent.module.css';

export const ClientSettingsContent: React.FC = () => {
  const { t } = useTranslation('settings');
  const { tenantSlug = '' } = useParams();
  const { t: tc } = useTranslation('common');
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'fields' | 'outcomes'>('fields');

  // Form state for the slide-over
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');
  const [newOutcomeLabel, setNewOutcomeLabel] = useState('');

  const { customFields, outcomeCategories, isLoading, fetchSettings } = useClientSettings();
  const { defineCustomField, isLoading: isDefiningField, error: fieldError } = useDefineCustomField();
  const { defineOutcomeCategory, isLoading: isDefiningCategory, error: outcomeError } = useDefineOutcomeCategory();

  const saveError = activeTab === 'fields' ? fieldError : outcomeError;

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveField = async () => {
    if (!newFieldName) return;
    try {
      await defineCustomField({ fieldName: newFieldName, fieldType: newFieldType });
      setNewFieldName('');
      setNewFieldType('TEXT');
      setIsSlideOverOpen(false);
      fetchSettings(); // refresh
    } catch {
      // Swallowed on purpose: the hook records the message in its `error`
      // state, which is rendered above the form as `saveError`. The slide-over
      // deliberately stays open so the user can correct the input.
    }
  };

  const handleSaveOutcome = async () => {
    if (!newOutcomeLabel) return;
    try {
      await defineOutcomeCategory({ label: newOutcomeLabel });
      setNewOutcomeLabel('');
      setIsSlideOverOpen(false);
      fetchSettings(); // refresh
    } catch {
      // Swallowed on purpose: the hook records the message in its `error`
      // state, which is rendered above the form as `saveError`. The slide-over
      // deliberately stays open so the user can correct the input.
    }
  };

  return (
    <SettingsLayout activeNavId="client-management">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.breadcrumbs}>
            <a href="#settings" className={styles.breadcrumbLink}>{t('breadcrumb')}</a>
            {' > '}
            {t('clientManagement.breadcrumb')}
          </div>
          <h1 className={styles.title}>{t('clientManagement.title')}</h1>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'fields' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('fields')}
            >
              {t('clientManagement.tabCustomFields')}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'outcomes' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('outcomes')}
            >
              {t('clientManagement.tabOutcomeCategories')}
            </button>
          </div>
        </div>

        {/* Custom Fields Tab */}
        {activeTab === 'fields' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('clientManagement.customFields')}</h2>
              <div className={styles.sectionActions}>
                <ExcelImportButton
                  label={t('clientManagement.importFields')}
                  templateFileName="custom-fields-template.xlsx"
                  onImport={(file) => clientService.importCustomFields(tenantSlug, file)}
                  onDownloadTemplate={() => clientService.downloadCustomFieldTemplate(tenantSlug)}
                  onImported={fetchSettings}
                />
                <Button icon={<Plus size={16} />} onClick={() => setIsSlideOverOpen(true)}>
                  {t('clientManagement.addField')}
                </Button>
              </div>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>{t('clientManagement.fieldName')}</th>
                    <th className={styles.th}>{t('clientManagement.type')}</th>
                    <th className={styles.th}>{t('clientManagement.required')}</th>
                    <th className={styles.th}>{tc('labels.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>{tc('state.loading')}</td></tr>
                  )}
                  {!isLoading && customFields.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-on-surface-variant)' }}>{t('clientManagement.noCustomFields')}</td></tr>
                  )}
                  {!isLoading && customFields.map((field) => (
                    <tr key={field.id} className={styles.tr}>
                      <td className={styles.td}>{field.fieldName}</td>
                      <td className={styles.td}>
                        {/* The raw enum value used to render here, so a user saw
                            SINGLE_SELECT rather than a readable type name. */}
                        <span className={styles.typeBadge}>
                          {t(`clientManagement.fieldTypes.${field.fieldType}`, { defaultValue: field.fieldType })}
                        </span>
                      </td>
                      <td className={styles.td}>{field.isRequired ? t('clientManagement.yes') : t('clientManagement.no')}</td>
                      <td className={styles.td}>
                        <button className={styles.actionButton} aria-label={t('clientManagement.editFieldAria')} disabled title={t('clientManagement.editFieldSoon')}>
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Outcome Categories Tab */}
        {activeTab === 'outcomes' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('clientManagement.outcomeCategories')}</h2>
              <Button icon={<Plus size={16} />} onClick={() => setIsSlideOverOpen(true)}>
                {t('clientManagement.addCategory')}
              </Button>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>{t('clientManagement.label')}</th>
                    <th className={styles.th}>{tc('labels.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={2} style={{ textAlign: 'center', padding: '20px' }}>{tc('state.loading')}</td></tr>
                  )}
                  {!isLoading && outcomeCategories.length === 0 && (
                    <tr><td colSpan={2} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-on-surface-variant)' }}>{t('clientManagement.noOutcomeCategories')}</td></tr>
                  )}
                  {!isLoading && outcomeCategories.map((cat) => (
                    <tr key={cat.id} className={styles.tr}>
                      <td className={styles.td}>{cat.label}</td>
                      <td className={styles.td}>
                        <button className={styles.actionButton} aria-label={t('clientManagement.editCategoryAria')} disabled title={t('clientManagement.editCategorySoon')}>
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Over for Adding */}
      <SlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        title={activeTab === 'fields' ? t('clientManagement.addFieldTitle') : t('clientManagement.addCategoryTitle')}
        footer={
          <div className={styles.slideOverFooter}>
            <Button variant="outline" onClick={() => setIsSlideOverOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button
              onClick={activeTab === 'fields' ? handleSaveField : handleSaveOutcome}
              disabled={activeTab === 'fields' ? isDefiningField || !newFieldName : isDefiningCategory || !newOutcomeLabel}
            >
              {(isDefiningField || isDefiningCategory) ? tc('state.saving') : tc('actions.save')}
            </Button>
          </div>
        }
      >
        <div className={styles.slideOverForm}>
          {saveError && (
            <p className={styles.saveError} role="alert">
              {saveError}
            </p>
          )}
          {activeTab === 'fields' ? (
            <>
              <TextInput
                label={t('clientManagement.fieldName')}
                placeholder={t('clientManagement.fieldNamePlaceholder')}
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
              />
              <SelectInput label={t('clientManagement.fieldType')} value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}>
                <option value="TEXT">{t('clientManagement.fieldTypes.TEXT')}</option>
                <option value="NUMBER">{t('clientManagement.fieldTypes.NUMBER')}</option>
                <option value="DATE">{t('clientManagement.fieldTypes.DATE')}</option>
                <option value="BOOLEAN">{t('clientManagement.fieldTypes.BOOLEAN')}</option>
                <option value="ALPHANUMERIC">{t('clientManagement.fieldTypes.ALPHANUMERIC')}</option>
              </SelectInput>
            </>
          ) : (
            <TextInput
              label={t('clientManagement.categoryLabel')}
              placeholder={t('clientManagement.categoryPlaceholder')}
              value={newOutcomeLabel}
              onChange={(e) => setNewOutcomeLabel(e.target.value)}
            />
          )}
        </div>
      </SlideOver>
    </SettingsLayout>
  );
};
