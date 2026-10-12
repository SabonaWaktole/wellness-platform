import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { tourProps } from '../../../lib/support/tourProps';
import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Noun used in the "1–20 of 84 products" summary. */
  /** Defaults to the translated "items". */
  itemLabel?: string;
  /** Support tour id for the navigation. */
  tourId?: string;
}

/**
 * Builds a compact page list with ellipses: always the first and last page,
 * plus a window around the current one. Keeps the control a fixed width no
 * matter how many pages there are.
 */
const buildPages = (current: number, pageCount: number): (number | 'gap')[] => {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < pageCount) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push('gap');
    result.push(page);
  });
  return result;
};

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel,
  tourId,
}) => {
  const { t } = useTranslation('common');
  const label = itemLabel ?? t('pagination.items');
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className={styles.container} aria-label={t('pagination.label')} {...tourProps(tourId)}>
      <p className={styles.summary}>
        {total === 0
          ? t('pagination.empty', { itemLabel: label })
          : t('pagination.range', { first, last, total, itemLabel: label })}
      </p>

      <div className={styles.controls}>
        {onPageSizeChange && (
          <label className={styles.pageSize}>
            <span className={styles.pageSizeLabel}>{t('pagination.rows')}</span>
            <select
              className={styles.pageSizeSelect}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.pages}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('pagination.previousPage')}
          >
            <ChevronLeft size={16} />
          </button>

          {buildPages(page, pageCount).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className={styles.gap} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={[styles.page, entry === page ? styles.pageActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={t('pagination.page', { page: entry })}
              >
                {entry}
              </button>
            )
          )}

          <button
            type="button"
            className={styles.arrow}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label={t('pagination.nextPage')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
};
