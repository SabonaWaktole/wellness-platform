import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Edit2, Trash2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card/Card';
import { Badge } from '../../../components/ui/Badge/Badge';
import { Button } from '../../../components/ui/Button/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import {
  useRoleAdmin,
  type CatalogueEntry,
  type GrantMap,
  type PermissionScope,
  type RoleDetail,
} from '../../../hooks/useRoleAdmin';
import { roleLabel } from '../../../utils/roleLabel';
import { RoleNameModal } from './RoleNameModal';
import { rolesErrorMessage } from './rolesErrorMessage';
import styles from './RolesSettingsContent.module.css';

const SCOPES: PermissionScope[] = ['OWN', 'TEAM', 'ALL'];

/** Permission keys contain dots, which i18next reads as nesting. */
const permissionLabelKey = (key: string) => `roles.permissions.${key.replace(/\./g, '_')}`;

function sameGrants(a: GrantMap, b: GrantMap): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** The catalogue's groups, in the order the catalogue first lists them. */
function groupCatalogue(catalogue: CatalogueEntry[]): Array<[string, CatalogueEntry[]]> {
  const groups = new Map<string, CatalogueEntry[]>();
  for (const entry of catalogue) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }
  return [...groups.entries()];
}

/**
 * Settings → Roles & permissions (Slice 6). The Administrator picks a role and
 * edits its permission grid: a tick grants a permission, the select next to a
 * scoped one sets how far it reaches (FR-RBAC-03). Custom roles are made by
 * copying (FR-RBAC-04). The server guards lock-out (FR-RBAC-08) and audits
 * every save (FR-RBAC-10); this screen only explains its refusals.
 */
export const RolesSettingsContent: React.FC = () => {
  const { t, i18n } = useTranslation('settings');
  const { catalogue, roles, loading, loadFailed, fetchRoles, savePermissions, copyRole, renameRole, deleteRole } = useRoleAdmin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GrantMap>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [dialog, setDialog] = useState<'copy' | 'rename' | 'delete' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const selected: RoleDetail | undefined = roles.find((role) => role.id === selectedId) ?? roles[0];

  // A different role, or the same role saved or reloaded: start from what the server holds.
  useEffect(() => {
    setDraft(selected ? { ...selected.grants } : {});
  }, [selected?.id, selected?.grants]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupCatalogue(catalogue), [catalogue]);
  const dirty = selected ? !sameGrants(draft, selected.grants) : false;
  const label = (role: Pick<RoleDetail, 'nameSq' | 'nameEn'>) => roleLabel(role, i18n.language);

  const selectRole = (roleId: string) => {
    if (roleId === selected?.id) return;
    if (dirty && !window.confirm(t('roles.discardConfirm'))) return;
    setSelectedId(roleId);
    setStatus(null);
  };

  const toggle = (entry: CatalogueEntry) => {
    setStatus(null);
    setDraft((current) => {
      const next = { ...current };
      if (next[entry.key] !== undefined) {
        delete next[entry.key];
      } else {
        // Least privilege: a newly granted scoped permission starts at Own.
        next[entry.key] = entry.supportsScope ? 'OWN' : true;
      }
      return next;
    });
  };

  const setScope = (key: string, scope: PermissionScope) => {
    setStatus(null);
    setDraft((current) => ({ ...current, [key]: scope }));
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    try {
      await savePermissions(selected.id, draft);
      setStatus({ tone: 'success', message: t('roles.saved') });
    } catch (err) {
      setStatus({ tone: 'error', message: rolesErrorMessage(err, t) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleteError(null);
    try {
      await deleteRole(selected.id);
      setSelectedId(null);
    } catch (err) {
      setDeleteError(rolesErrorMessage(err, t));
      // Rethrown so the dialog stays open with the reason showing.
      throw err;
    }
  };

  if (loading && roles.length === 0) {
    return <p className={styles.mutedText}>{t('roles.loading')}</p>;
  }
  if (loadFailed && roles.length === 0) {
    return <p className={styles.errorText} role="alert">{t('roles.loadFailed')}</p>;
  }
  if (!selected) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('roles.title')}</h2>
        <p className={styles.headerSubtitle}>{t('roles.subtitle')}</p>
      </div>

      <div className={styles.layout}>
        <ul className={styles.roleList} aria-label={t('roles.listLabel')}>
          {roles.map((role) => {
            const isActive = role.id === selected.id;
            return (
              <li key={role.id}>
                <button
                  type="button"
                  className={`${styles.roleButton} ${isActive ? styles.roleButtonActive : ''}`}
                  aria-pressed={isActive}
                  onClick={() => selectRole(role.id)}
                >
                  <span className={styles.roleName}>{label(role)}</span>
                  <span className={styles.roleMeta}>
                    <Badge variant={role.isSystem ? 'secondary' : 'primary'}>
                      {role.isSystem ? t('roles.systemBadge') : t('roles.customBadge')}
                    </Badge>
                    <span className={styles.roleUsers}>{t('roles.users', { count: role.users })}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <Card padding="md" className={styles.editor}>
          <div className={styles.editorHeader}>
            <h3 className={styles.editorTitle}>{label(selected)}</h3>
            <div className={styles.editorActions}>
              <Button variant="outline" size="sm" onClick={() => setDialog('copy')}>
                <Copy size={16} aria-hidden="true" />
                {t('roles.copy')}
              </Button>
              {!selected.isSystem && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setDialog('rename')}>
                    <Edit2 size={16} aria-hidden="true" />
                    {t('roles.rename')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteError(null);
                      setDialog('delete');
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    {t('roles.delete')}
                  </Button>
                </>
              )}
            </div>
          </div>
          {selected.isSystem && <p className={styles.mutedText}>{t('roles.systemRoleNote')}</p>}

          {groups.map(([group, entries]) => (
            <section key={group} className={styles.group} aria-labelledby={`group-${group}`}>
              <h4 id={`group-${group}`} className={styles.groupTitle}>{t(`roles.groups.${group}`, { defaultValue: group })}</h4>
              <ul className={styles.permissionList}>
                {entries.map((entry) => {
                  const grant = draft[entry.key];
                  const granted = grant !== undefined;
                  const permissionLabel = t(permissionLabelKey(entry.key), { defaultValue: entry.key });
                  const inputId = `perm-${entry.key}`;
                  return (
                    <li key={entry.key} className={styles.permissionRow}>
                      <label className={styles.permissionLabel} htmlFor={inputId}>
                        <input
                          id={inputId}
                          type="checkbox"
                          className={styles.checkbox}
                          checked={granted}
                          onChange={() => toggle(entry)}
                        />
                        <span>{permissionLabel}</span>
                      </label>
                      <div className={styles.permissionSide}>
                        {entry.milestone && (
                          <Badge variant="outline" className={styles.milestone}>
                            {t(`roles.milestone.${entry.milestone}`)}
                          </Badge>
                        )}
                        {entry.supportsScope && granted && (
                          <select
                            className={styles.scopeSelect}
                            aria-label={t('roles.scopeLabel', { permission: permissionLabel })}
                            value={grant as PermissionScope}
                            onChange={(e) => setScope(entry.key, e.target.value as PermissionScope)}
                          >
                            {SCOPES.map((scope) => (
                              <option key={scope} value={scope}>{t(`roles.scopes.${scope}`)}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className={styles.saveBar}>
            <p
              className={status?.tone === 'error' ? styles.errorText : status ? styles.successText : styles.mutedText}
              role={status?.tone === 'error' ? 'alert' : 'status'}
            >
              {status?.message ?? (dirty ? t('roles.unsaved') : '')}
            </p>
            <div className={styles.saveActions}>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft({ ...selected.grants });
                  setStatus(null);
                }}
                disabled={!dirty || saving}
              >
                {t('roles.discard')}
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={!dirty} isLoading={saving}>
                {t('roles.save')}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <RoleNameModal
        isOpen={dialog === 'copy'}
        onClose={() => setDialog(null)}
        title={t('roles.copyModal.title', { role: label(selected) })}
        hint={t('roles.copyModal.hint')}
        submitLabel={t('roles.copyModal.submit')}
        initialNames={{ nameSq: '', nameEn: '' }}
        onSubmit={async (names) => {
          const newId = await copyRole(selected.id, names);
          setSelectedId(newId);
          setStatus(null);
        }}
      />
      <RoleNameModal
        isOpen={dialog === 'rename'}
        onClose={() => setDialog(null)}
        title={t('roles.renameModal.title')}
        submitLabel={t('roles.renameModal.submit')}
        initialNames={{ nameSq: selected.nameSq, nameEn: selected.nameEn }}
        onSubmit={(names) => renameRole(selected.id, names)}
      />
      <ConfirmDialog
        isOpen={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={handleDelete}
        title={t('roles.deleteConfirm.title')}
        confirmLabel={t('roles.deleteConfirm.confirm')}
        message={
          <>
            <p>{t('roles.deleteConfirm.message', { role: label(selected) })}</p>
            {deleteError && <p className={styles.errorText} role="alert">{deleteError}</p>}
          </>
        }
      />
    </div>
  );
};
