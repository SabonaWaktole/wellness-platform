import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { tourPath, tourProps } from '../../../lib/support/tourProps';
import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  /** Stable identifier, also used as the React key for cells. */
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Fixed width, e.g. '48px'. Useful for action columns. */
  width?: string;
  /** Keeps cell content on a single line. */
  nowrap?: boolean;
  /**
   * Label shown beside the value in the mobile card layout. Defaults to
   * `header` when it is a string. Pass `null` to render the value alone,
   * which suits the primary/title cell of a card.
   */
  cardLabel?: ReactNode | null;
  /** Omits this column from the mobile card layout entirely. */
  hideOnCard?: boolean;
  /**
   * Makes the header a sort control. Requires the `sort` prop; the column's
   * `id` is the field passed back to `onSort`.
   */
  sortable?: boolean;
}

export interface DataTableEmptyState {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Sorting is controlled by the parent so it can round-trip to the server. */
export interface DataTableSort {
  field: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
}

/** Row selection, also controlled, so bulk actions live with the data. */
export interface DataTableSelection {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Per-row opt-out, e.g. rows the current user may not act on. */
  isSelectable?: (rowKey: string) => boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  /** Number of skeleton rows rendered while loading. */
  loadingRowCount?: number;
  empty?: DataTableEmptyState;
  onRowClick?: (row: T) => void;
  /** Pins the header while the table body scrolls. */
  stickyHeader?: boolean;
  /** Accessible description of the table's contents. */
  caption?: string;
  sort?: DataTableSort;
  selection?: DataTableSelection;
  className?: string;
  /** Support tour id for the table; also derives `<id>.empty`, `<id>.loading` and `<id>.sort.<column>`. */
  tourId?: string;
  /** Support tour id carried by every row (table) or card (phone); declared repeated. */
  rowTourId?: string;
}

const alignClass = <T,>(column: DataTableColumn<T>) => {
  if (column.align === 'right') return styles.alignRight;
  if (column.align === 'center') return styles.alignCenter;
  return '';
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  loadingRowCount = 5,
  empty,
  onRowClick,
  stickyHeader = true,
  caption,
  sort,
  selection,
  className = '',
  tourId,
  rowTourId,
}: DataTableProps<T>) {
  const { t } = useTranslation('common');
  const isEmpty = !isLoading && rows.length === 0;
  const isInteractive = Boolean(onRowClick);
  // Render one layout or the other, never both, so rows are not duplicated
  // into the DOM and accessibility tree.
  const isDesktop = useIsDesktop();

  const wrapperClasses = [styles.wrapper, className].filter(Boolean).join(' ');
  const tableClasses = [styles.table, stickyHeader ? styles.stickyHeader : '']
    .filter(Boolean)
    .join(' ');

  // ---- Selection ----------------------------------------------------------

  const selectableKeys = selection
    ? rows.map(rowKey).filter((key) => selection.isSelectable?.(key) ?? true)
    : [];
  const selectedSet = new Set(selection?.selectedIds ?? []);
  const selectedOnPage = selectableKeys.filter((key) => selectedSet.has(key));
  const allSelected = selectableKeys.length > 0 && selectedOnPage.length === selectableKeys.length;
  // Distinct from `allSelected` so the header box can show a dash rather than
  // a tick when only part of the page is chosen.
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  const toggleRow = (key: string) => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange([...next]);
  };

  const toggleAll = () => {
    if (!selection) return;
    if (allSelected) {
      // Only clear what this page contributed; a selection spanning pages survives.
      const remaining = selection.selectedIds.filter((id) => !selectableKeys.includes(id));
      selection.onChange(remaining);
      return;
    }
    selection.onChange([...new Set([...selection.selectedIds, ...selectableKeys])]);
  };

  const renderCheckbox = (
    checked: boolean,
    indeterminate: boolean,
    onToggle: () => void,
    label: string,
    disabled = false
  ) => (
    <input
      type="checkbox"
      className={styles.checkbox}
      checked={checked}
      disabled={disabled}
      // A checkbox's indeterminate state is a DOM property, not an attribute,
      // so it has to be set through a ref.
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      onChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      aria-label={label}
    />
  );

  // ---- Sorting ------------------------------------------------------------

  const sortIcon = (columnId: string) => {
    if (!sort || sort.field !== columnId) return <ChevronsUpDown size={13} />;
    return sort.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  // While loading, the skeleton says so, so a tour waits instead of deciding a control is missing.
  const loadingProps = tourId ? { ...tourProps(tourPath(tourId, 'loading')), 'aria-busy': true } : {};

  const ariaSort = (columnId: string): 'ascending' | 'descending' | 'none' => {
    if (!sort || sort.field !== columnId) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  };

  // ---- Empty --------------------------------------------------------------

  if (isEmpty && empty) {
    return (
      <div className={wrapperClasses} {...tourProps(tourId)}>
        <div className={styles.emptyState} {...tourProps(tourId && tourPath(tourId, 'empty'))}>
          {empty.icon && <div className={styles.emptyIcon}>{empty.icon}</div>}
          <p className={styles.emptyTitle}>{empty.title}</p>
          {empty.description && (
            <p className={styles.emptyDescription}>{empty.description}</p>
          )}
          {empty.action && <div className={styles.emptyAction}>{empty.action}</div>}
        </div>
      </div>
    );
  }

  const handleRowKeyDown = (event: React.KeyboardEvent, row: T) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };

  // ---- Mobile cards -------------------------------------------------------

  if (!isDesktop) {
    return (
      <div className={wrapperClasses} {...tourProps(tourId)}>
        {selection && selectableKeys.length > 0 && !isLoading && (
          <div className={styles.cardSelectAll}>
            <label className={styles.cardSelectAllLabel}>
              {renderCheckbox(allSelected, someSelected, toggleAll, t('table.selectAllRows'))}
              {selectedOnPage.length > 0
                ? t('table.selected', { count: selectedOnPage.length })
                : t('table.selectAll')}
            </label>
          </div>
        )}
        <div className={styles.cardList}>
          {isLoading
            ? Array.from({ length: loadingRowCount }).map((_, index) => (
                <div
                  key={`skeleton-card-${index}`}
                  className={styles.card}
                  {...loadingProps}
                >
                  <span className={`${styles.skeleton} ${styles.skeletonCardLine}`} />
                  <span className={`${styles.skeleton} ${styles.skeletonCardLine}`} />
                </div>
              ))
            : rows.map((row) => {
                const key = rowKey(row);
                const cardColumns = columns.filter((column) => !column.hideOnCard);
                const canSelect = selection?.isSelectable?.(key) ?? true;
                return (
                  <div
                    key={key}
                    className={[
                      styles.card,
                      isInteractive ? styles.cardInteractive : '',
                      selectedSet.has(key) ? styles.cardSelected : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={isInteractive ? (e) => handleRowKeyDown(e, row) : undefined}
                    tabIndex={isInteractive ? 0 : undefined}
                    role={isInteractive ? 'button' : undefined}
                    {...tourProps(rowTourId, { repeat: true })}
                  >
                    {selection && (
                      <div className={styles.cardCheckbox}>
                        {renderCheckbox(
                          selectedSet.has(key),
                          false,
                          () => toggleRow(key),
                          'Select row',
                          !canSelect
                        )}
                      </div>
                    )}
                    {cardColumns.map((column) => {
                      const label =
                        column.cardLabel === null
                          ? null
                          : column.cardLabel ??
                            (typeof column.header === 'string' ? column.header : null);

                      return (
                        <div key={column.id} className={styles.cardField}>
                          {label && <span className={styles.cardLabel}>{label}</span>}
                          <span className={styles.cardValue}>{column.render(row)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          {isEmpty && !empty && <div className={styles.inlineEmpty}>No results</div>}
        </div>
      </div>
    );
  }

  // ---- Desktop table ------------------------------------------------------

  const columnCount = columns.length + (selection ? 1 : 0);

  return (
    <div className={wrapperClasses} {...tourProps(tourId)}>
      <div className={styles.scrollArea}>
        <table className={tableClasses}>
          {caption && <caption className={styles.visuallyHidden}>{caption}</caption>}
          <thead>
            <tr>
              {selection && (
                <th scope="col" className={styles.checkboxCell} style={{ width: '44px' }}>
                  {renderCheckbox(allSelected, someSelected, toggleAll, t('table.selectAllRows'))}
                </th>
              )}
              {columns.map((column) => {
                const isSortable = Boolean(column.sortable && sort);
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={alignClass(column)}
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={isSortable ? ariaSort(column.id) : undefined}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        className={[
                          styles.sortButton,
                          sort!.field === column.id ? styles.sortButtonActive : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => sort!.onSort(column.id)}
                        {...tourProps(tourId && tourPath(tourId, 'sort', column.id))}
                      >
                        {column.header}
                        <span className={styles.sortIcon} aria-hidden="true">
                          {sortIcon(column.id)}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: loadingRowCount }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className={styles.skeletonRow} {...loadingProps}>
                    {selection && (
                      <td className={styles.checkboxCell}>
                        <span className={styles.skeleton} />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.id} className={alignClass(column)}>
                        <span className={styles.skeleton} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const key = rowKey(row);
                  const canSelect = selection?.isSelectable?.(key) ?? true;
                  return (
                    <tr
                      key={key}
                      className={[
                        isInteractive ? styles.rowInteractive : '',
                        selectedSet.has(key) ? styles.rowSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={isInteractive ? (e) => handleRowKeyDown(e, row) : undefined}
                      tabIndex={isInteractive ? 0 : undefined}
                      role={isInteractive ? 'button' : undefined}
                      {...tourProps(rowTourId, { repeat: true })}
                    >
                      {selection && (
                        <td className={styles.checkboxCell}>
                          {renderCheckbox(
                            selectedSet.has(key),
                            false,
                            () => toggleRow(key),
                            'Select row',
                            !canSelect
                          )}
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={[alignClass(column), column.nowrap ? styles.nowrap : '']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            {isEmpty && !empty && (
              <tr>
                <td colSpan={columnCount} className={styles.inlineEmpty}>
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
