import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { LookupItem, LookupValues } from '../../../services/lookupService';
import { lookupLabel } from '../../../utils/lookupLabel';
import styles from './LookupListEditor.module.css';

/** A row being edited or added: every field as the text its input holds. */
export type LookupDraft = Record<string, string>;

export interface LookupInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The row being added, rather than an existing value being edited. */
  isNew: boolean;
}

/** A list-specific column (a risk level's number, a business type's risk level). */
export interface LookupColumn<T extends LookupItem> {
  field: string;
  header: string;
  render: (item: T) => ReactNode;
  renderInput: (props: LookupInputProps) => ReactNode;
  /** The input text for an existing value, or for a new one when `item` is undefined. */
  draftOf: (item: T | undefined) => string;
}

export interface LookupListEditorProps<T extends LookupItem> {
  /** Accessible name of the table, e.g. "Business types". */
  caption: string;
  items: T[];
  columns?: LookupColumn<T>[];
  /** Turns the draft's text into the API body's list-specific fields (e.g. `level` as a number). */
  toValues?: (draft: LookupDraft) => LookupValues;
  onCreate: (values: LookupValues) => Promise<void>;
  onUpdate: (id: string, values: LookupValues) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** The API's refusal in the user's language. */
  errorMessage: (error: unknown) => string;
  /**
   * Hides the drag handles and move buttons (default `true`). Cities are
   * reorderable only while filtered to one area (FR-SET-04); across "all
   * areas" a display order would not mean anything.
   */
  reorderable?: boolean;
}

const NEW_ROW = 'new';

/**
 * The shared editor behind every Settings → Lists screen (Slice 8): a table of
 * values with inline Albanian/English label editing, reordering (drag, or the
 * arrow buttons on touch screens and keyboards), an active toggle and delete.
 * The server enforces the rules; this explains its refusals.
 */
export function LookupListEditor<T extends LookupItem>({
  caption,
  items,
  columns = [],
  toValues = () => ({}),
  onCreate,
  onUpdate,
  onReorder,
  onSetActive,
  onDelete,
  errorMessage,
  reorderable: reorderableProp = true,
}: LookupListEditorProps<T>) {
  const { t, i18n } = useTranslation('settings');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<LookupDraft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<T | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const startEdit = (item?: T) => {
    setError(null);
    setEditing(item ? item.id : NEW_ROW);
    setDraft({
      nameSq: item?.nameSq ?? '',
      nameEn: item?.nameEn ?? '',
      ...Object.fromEntries(columns.map((column) => [column.field, column.draftOf(item)])),
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const save = async () => {
    const values = { nameSq: draft.nameSq, nameEn: draft.nameEn.trim() || null, ...toValues(draft) };
    setSaving(true);
    const saved = await run(() => (editing === NEW_ROW ? onCreate(values) : onUpdate(editing!, values)));
    setSaving(false);
    if (saved) setEditing(null);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const ids = items.map((item) => item.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    void run(() => onReorder(ids));
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleteError(null);
    try {
      await onDelete(toDelete.id);
    } catch (err) {
      setDeleteError(errorMessage(err));
      // Rethrown so the dialog stays open with the reason showing.
      throw err;
    }
  };

  const field = (name: string) => (value: string) => setDraft((current) => ({ ...current, [name]: value }));
  const reorderable = reorderableProp && editing === null && items.length > 1;

  const editCells = (rowId: string) => (
    <>
      <td className={styles.cell} data-label={t('lists.columns.nameSq')}>
        <input
          id={`${rowId}-nameSq`}
          className={styles.input}
          aria-label={t('lists.columns.nameSq')}
          value={draft.nameSq}
          onChange={(e) => field('nameSq')(e.target.value)}
          maxLength={100}
          required
          autoFocus
        />
      </td>
      <td className={styles.cell} data-label={t('lists.columns.nameEn')}>
        <input
          id={`${rowId}-nameEn`}
          className={styles.input}
          aria-label={t('lists.columns.nameEn')}
          value={draft.nameEn}
          onChange={(e) => field('nameEn')(e.target.value)}
          maxLength={100}
          placeholder={t('lists.optional')}
        />
      </td>
      {columns.map((column) => (
        <td key={column.field} className={styles.cell} data-label={column.header}>
          {column.renderInput({
            id: `${rowId}-${column.field}`,
            label: column.header,
            value: draft[column.field],
            onChange: field(column.field),
            isNew: rowId === NEW_ROW,
          })}
        </td>
      ))}
      <td className={styles.cell} />
      <td className={`${styles.cell} ${styles.actionsCell}`}>
        <div className={styles.actions}>
          <Button size="sm" variant="primary" onClick={save} isLoading={saving} disabled={!draft.nameSq.trim()}>
            <Check size={16} aria-hidden="true" />
            {t('lists.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
            <X size={16} aria-hidden="true" />
            {t('lists.cancel')}
          </Button>
        </div>
      </td>
    </>
  );

  return (
    <div className={styles.editor}>
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.handleCol}>
              <span className={styles.srOnly}>{t('lists.columns.order')}</span>
            </th>
            <th scope="col">{t('lists.columns.nameSq')}</th>
            <th scope="col">{t('lists.columns.nameEn')}</th>
            {columns.map((column) => (
              <th scope="col" key={column.field}>{column.header}</th>
            ))}
            <th scope="col">{t('lists.columns.status')}</th>
            <th scope="col">
              <span className={styles.srOnly}>{t('lists.columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const name = lookupLabel(item, i18n.language);
            const isDragged = dragged === item.id;
            return (
              <tr
                key={item.id}
                className={`${styles.row} ${item.active ? '' : styles.inactiveRow} ${isDragged ? styles.draggedRow : ''}`}
                draggable={reorderable}
                onDragStart={(e) => {
                  setDragged(item.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (dragged) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged) move(items.findIndex((row) => row.id === dragged), index);
                  setDragged(null);
                }}
                onDragEnd={() => setDragged(null)}
                data-testid={`lookup-row-${item.id}`}
              >
                <td className={`${styles.cell} ${styles.handleCol}`}>
                  {reorderable ? (
                    <div className={styles.reorder}>
                      <GripVertical size={16} className={styles.grip} aria-hidden="true" />
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => move(index, index - 1)}
                        disabled={index === 0}
                        aria-label={t('lists.moveUp', { name })}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => move(index, index + 1)}
                        disabled={index === items.length - 1}
                        aria-label={t('lists.moveDown', { name })}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </td>
                {editing === item.id ? (
                  editCells(item.id)
                ) : (
                  <>
                    <td className={`${styles.cell} ${styles.nameCell}`} data-label={t('lists.columns.nameSq')}>{item.nameSq}</td>
                    <td className={styles.cell} data-label={t('lists.columns.nameEn')}>
                      {item.nameEn ?? <span className={styles.muted}>{t('lists.fallsBackToSq')}</span>}
                    </td>
                    {columns.map((column) => (
                      <td key={column.field} className={styles.cell} data-label={column.header}>
                        {column.render(item)}
                      </td>
                    ))}
                    <td className={styles.cell} data-label={t('lists.columns.status')}>
                      <Badge variant={item.active ? 'success' : 'outline'}>
                        {item.active ? t('lists.active') : t('lists.inactive')}
                      </Badge>
                    </td>
                    <td className={`${styles.cell} ${styles.actionsCell}`}>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => startEdit(item)}
                          disabled={editing !== null}
                          aria-label={t('lists.edit', { name })}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => void run(() => onSetActive(item.id, !item.active))}
                          disabled={editing !== null}
                          aria-label={t(item.active ? 'lists.deactivate' : 'lists.reactivate', { name })}
                          title={t(item.active ? 'lists.deactivate' : 'lists.reactivate', { name })}
                        >
                          <Power size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.dangerButton}`}
                          onClick={() => {
                            setDeleteError(null);
                            setToDelete(item);
                          }}
                          disabled={editing !== null}
                          aria-label={t('lists.delete', { name })}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {editing === NEW_ROW && (
            <tr className={`${styles.row} ${styles.newRow}`}>
              <td className={`${styles.cell} ${styles.handleCol}`} />
              {editCells(NEW_ROW)}
            </tr>
          )}
        </tbody>
      </table>

      {items.length === 0 && editing !== NEW_ROW && <p className={styles.muted}>{t('lists.empty')}</p>}

      <div>
        <Button variant="outline" size="sm" onClick={() => startEdit()} disabled={editing !== null}>
          <Plus size={16} aria-hidden="true" />
          {t('lists.add')}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={t('lists.deleteConfirm.title')}
        confirmLabel={t('lists.deleteConfirm.confirm')}
        message={
          <>
            <p>{t('lists.deleteConfirm.message', { name: toDelete ? lookupLabel(toDelete, i18n.language) : '' })}</p>
            {deleteError && (
              <p className={styles.errorText} role="alert">
                {deleteError}
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
