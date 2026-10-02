import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import { SettingsLayout } from '../../components/layout/SettingsLayout';
import { SlideOver } from '../../components/ui/SlideOver';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';
import { SelectInput } from '../../components/ui/SelectInput';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ExcelImportButton } from '../../components/clients/ExcelImportButton';
import { clientService } from '../../services/clientService';
import {
  useClientSettings,
  useDefineCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  useReorderCustomFields,
} from '../../hooks/useClients';
import { ClientFormsTab } from './ClientFormsTab';
import type { CustomFieldDefinition, FieldRole } from '../../types/client';
import styles from './ClientSettingsContent.module.css';

const ROLE_OPTIONS: { value: '' | FieldRole; labelKey: string }[] = [
  { value: '', labelKey: 'clientManagement.roleNone' },
  { value: 'PRIMARY_NAME', labelKey: 'clientManagement.rolePrimaryName' },
  { value: 'PRIMARY_EMAIL', labelKey: 'clientManagement.rolePrimaryEmail' },
  { value: 'PRIMARY_PHONE', labelKey: 'clientManagement.rolePrimaryPhone' },
  { value: 'STATUS', labelKey: 'clientManagement.roleStatus' },
  { value: 'ASSIGNEE', labelKey: 'clientManagement.roleAssignee' },
];

/**
 * The two select types are the ones that carry an options list; the backend
 * rejects either without at least one option (see defineCustomFieldSchema).
 */
const needsOptions = (fieldType: string) =>
  fieldType === 'SINGLE_SELECT' || fieldType === 'MULTI_SELECT';

export const ClientSettingsContent: React.FC = () => {
  const { t } = useTranslation('settings');
  const { tenantSlug = '' } = useParams();
  const { t: tc } = useTranslation('common');
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'fields' | 'form'>('fields');

  // Form state for the slide-over
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState('');
  const [newFieldRole, setNewFieldRole] = useState<'' | FieldRole>('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [deletingField, setDeletingField] = useState<CustomFieldDefinition | null>(null);

  const { customFields, isLoading, fetchSettings } = useClientSettings();
  const { defineCustomField, isLoading: isDefiningField, error: fieldError } = useDefineCustomField();
  const { updateCustomField, isLoading: isUpdatingField, error: updateFieldError } = useUpdateCustomField();
  const { deleteCustomField } = useDeleteCustomField();
  const { reorderCustomFields } = useReorderCustomFields();

  const sortedFields = [...customFields].sort((a, b) => a.order - b.order);

  const saveError = fieldError || updateFieldError;

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const resetFieldForm = () => {
    setNewFieldName('');
    setNewFieldType('TEXT');
    setNewFieldOptions([]);
    setOptionDraft('');
    setNewFieldRole('');
    setNewFieldRequired(false);
    setEditingField(null);
  };

  const openAddField = () => {
    resetFieldForm();
    setIsSlideOverOpen(true);
  };

  const openEditField = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setNewFieldName(field.fieldName);
    setNewFieldType(field.fieldType);
    setNewFieldOptions(field.options ?? []);
    setOptionDraft('');
    setNewFieldRole(field.role ?? '');
    setNewFieldRequired(field.required);
    setIsSlideOverOpen(true);
  };

  const handleAddOption = () => {
    const value = optionDraft.trim();
    if (!value || newFieldOptions.includes(value)) return;
    setNewFieldOptions([...newFieldOptions, value]);
    setOptionDraft('');
  };

  const handleRemoveOption = (option: string) => {
    setNewFieldOptions(newFieldOptions.filter((o) => o !== option));
  };

  const handleSaveField = async () => {
    if (!newFieldName) return;
    const payload = {
      fieldName: newFieldName,
      fieldType: newFieldType,
      role: newFieldRole || null,
      required: newFieldRequired,
      ...(needsOptions(newFieldType) ? { options: newFieldOptions } : {}),
    };
    try {
      if (editingField) {
        await updateCustomField(editingField.id, payload);
      } else {
        await defineCustomField(payload);
      }
      resetFieldForm();
      setIsSlideOverOpen(false);
      fetchSettings(); // refresh
    } catch {
      // Swallowed on purpose: the hook records the message in its `error`
      // state, which is rendered above the form as `saveError`. The slide-over
      // deliberately stays open so the user can correct the input.
    }
  };

  const handleDeleteField = async () => {
    if (!deletingField) return;
    await deleteCustomField(deletingField.id);
    setDeletingField(null);
    fetchSettings();
  };

  const deleteMessage = (field: CustomFieldDefinition | null): string => {
    if (!field) return '';
    switch (field.role) {
      case 'PRIMARY_EMAIL':
        return t('clientManagement.deleteFieldPrimaryEmail');
      case 'PRIMARY_NAME':
        return t('clientManagement.deleteFieldPrimaryName');
      case 'STATUS':
        return t('clientManagement.deleteFieldStatus');
      case 'ASSIGNEE':
        return t('clientManagement.deleteFieldAssignee');
      default:
        return t('clientManagement.deleteFieldGeneric');
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedFields.length) return;
    const reordered = [...sortedFields];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    try {
      await reorderCustomFields(reordered.map((f) => f.id));
      fetchSettings();
    } catch {
      // reorder failures are silent here; the list simply won't have moved.
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
              className={`${styles.tab} ${activeTab === 'form' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('form')}
            >
              {t('clientManagement.tabForm')}
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
                <Button icon={<Plus size={16} />} onClick={openAddField}>
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
                  {!isLoading && sortedFields.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-on-surface-variant)' }}>{t('clientManagement.noCustomFields')}</td></tr>
                  )}
                  {!isLoading && sortedFields.map((field, index) => (
                    <tr key={field.id} className={styles.tr}>
                      <td className={styles.td}>{field.fieldName}</td>
                      <td className={styles.td}>
                        {/* The raw enum value used to render here, so a user saw
                            SINGLE_SELECT rather than a readable type name. */}
                        <span className={styles.typeBadge}>
                          {t(`clientManagement.fieldTypes.${field.fieldType}`, { defaultValue: field.fieldType })}
                        </span>
                      </td>
                      <td className={styles.td}>{field.required ? t('clientManagement.yes') : t('clientManagement.no')}</td>
                      <td className={styles.td}>
                        <div className={styles.actionButtonGroup}>
                          <button
                            className={styles.actionButton}
                            aria-label={t('clientManagement.moveUpAria')}
                            disabled={index === 0}
                            onClick={() => handleMove(index, -1)}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            className={styles.actionButton}
                            aria-label={t('clientManagement.moveDownAria')}
                            disabled={index === sortedFields.length - 1}
                            onClick={() => handleMove(index, 1)}
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            className={styles.actionButton}
                            aria-label={t('clientManagement.editFieldAria')}
                            onClick={() => openEditField(field)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className={styles.actionButton}
                            aria-label={t('clientManagement.deleteFieldAria')}
                            onClick={() => setDeletingField(field)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/*
          * Form Tab — the drag-and-drop builder.
          *
          * The Fields tab above stays the tenant's data dictionary (what a
          * client record can store, plus the Excel importer); this tab decides
          * only how those fields are grouped and drawn. Keeping them apart is
          * what lets a field be renamed or retyped without touching a layout,
          * and a layout be rearranged without touching stored client data.
          */}
        {activeTab === 'form' && <ClientFormsTab />}
      </div>

      {/* Slide-Over for Adding/Editing */}
      <SlideOver
        isOpen={isSlideOverOpen}
        onClose={() => { setIsSlideOverOpen(false); resetFieldForm(); }}
        title={editingField ? t('clientManagement.editFieldTitle') : t('clientManagement.addFieldTitle')}
        footer={
          <div className={styles.slideOverFooter}>
            <Button variant="outline" onClick={() => { setIsSlideOverOpen(false); resetFieldForm(); }}>
              {tc('actions.cancel')}
            </Button>
            <Button
              onClick={handleSaveField}
              disabled={isDefiningField || isUpdatingField || !newFieldName}
            >
              {(isDefiningField || isUpdatingField) ? tc('state.saving') : tc('actions.save')}
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
            <option value="SINGLE_SELECT">{t('clientManagement.fieldTypes.SINGLE_SELECT')}</option>
            <option value="MULTI_SELECT">{t('clientManagement.fieldTypes.MULTI_SELECT')}</option>
            <option value="EMAIL">{t('clientManagement.fieldTypes.EMAIL')}</option>
            <option value="USER_REFERENCE">{t('clientManagement.fieldTypes.USER_REFERENCE')}</option>
          </SelectInput>

          {needsOptions(newFieldType) && (
            <div className={styles.optionsEditor}>
              <label className={styles.optionsLabel}>{t('clientManagement.options')}</label>
              <div className={styles.optionsChips}>
                {newFieldOptions.map((opt) => (
                  <span key={opt} className={styles.optionChip}>
                    {opt}
                    <button
                      type="button"
                      className={styles.optionChipRemove}
                      aria-label={t('clientManagement.removeOptionAria', { option: opt })}
                      onClick={() => handleRemoveOption(opt)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className={styles.optionsInputRow}>
                <TextInput
                  placeholder={t('clientManagement.optionsPlaceholder')}
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddOption}>
                  {t('clientManagement.addOption')}
                </Button>
              </div>
            </div>
          )}

          <SelectInput
            label={t('clientManagement.role')}
            value={newFieldRole}
            onChange={(e) => setNewFieldRole(e.target.value as '' | FieldRole)}
          >
            {ROLE_OPTIONS.map((opt) => {
              if (opt.value === '') {
                return <option key="none" value="">{t(opt.labelKey)}</option>;
              }
              const holder = customFields.find(
                (f) => f.role === opt.value && f.id !== editingField?.id
              );
              return (
                <option key={opt.value} value={opt.value} disabled={!!holder}>
                  {t(opt.labelKey)}{holder ? ` (${t('clientManagement.roleHeldBy', { fieldName: holder.fieldName })})` : ''}
                </option>
              );
            })}
          </SelectInput>

          <div className={styles.checkboxContainer}>
            <input
              id="new-field-required"
              type="checkbox"
              className={styles.checkbox}
              checked={newFieldRequired}
              onChange={(e) => setNewFieldRequired(e.target.checked)}
            />
            <label htmlFor="new-field-required" className={styles.checkboxLabel}>
              {t('clientManagement.requiredCheckbox')}
            </label>
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        isOpen={!!deletingField}
        onClose={() => setDeletingField(null)}
        onConfirm={handleDeleteField}
        title={t('clientManagement.deleteFieldTitle')}
        message={deleteMessage(deletingField)}
        tone="danger"
      />
    </SettingsLayout>
  );
};
