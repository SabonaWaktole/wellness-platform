import { sharedStep } from './defineGuide';
import { tourPath } from './tourProps';
import type { GuideStep } from './types';

/**
 * The step families that three or more pages repeat. Each returns plain step
 * objects, in tour order, that a page can override, reorder or extend. Standard
 * controls use shared guidance; the page supplies copy for the rest. Nothing
 * here is ever `try-it`: a page opts a step in explicitly.
 */

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
/** Actions whose names say they remove or end something; their steps carry the care flag. */
const CAREFUL = new Set(['delete', 'void', 'cancel', 'close', 'remove', 'archive']);

interface ListOptions {
  /** What the list holds, for the copy ("clients"). */
  subject: string;
  /** The page has an Add button. Default true. */
  add?: boolean;
  search?: boolean;
  /** Filter control names, in order; each is `<prefix>.<name>`. */
  filters?: string[];
  table?: boolean;
  /** A sortable column's id, to explain sorting once. */
  sortColumn?: string;
  /** Explain a row (repeated). */
  rows?: boolean;
  rowMenu?: boolean;
  pagination?: boolean;
}

export function listPageSteps(prefix: string, options: ListOptions): GuideStep[] {
  const vars = { subject: options.subject };
  const steps: GuideStep[] = [];
  if (options.add ?? true) steps.push({ id: 'add', target: `${prefix}.add`, kind: 'control' });
  if (options.search) steps.push(sharedStep('search', `${prefix}.search`, { vars }));
  for (const filter of options.filters ?? []) {
    steps.push(sharedStep('filterSelect', `${prefix}.${filter}`, { id: `filter${cap(filter)}`, vars }));
  }
  if (options.table) steps.push({ id: 'table', target: `${prefix}.table`, kind: 'region' });
  if (options.sortColumn) {
    steps.push(sharedStep('sortHeader', tourPath(`${prefix}.table`, 'sort', options.sortColumn), { id: 'sort', vars }));
  }
  if (options.rows) steps.push({ id: 'rows', target: `${prefix}.row`, kind: 'region', repeat: true });
  if (options.rowMenu) steps.push(sharedStep('rowMenu', `${prefix}.rowMenu`, { repeat: true }));
  if (options.pagination) steps.push(sharedStep('pagination', `${prefix}.pagination`, { vars }));
  return steps;
}

interface FormOptions {
  /** Field names, in order; each is `<prefix>.<name>`. */
  fields: string[];
  saveBar?: boolean;
  backLink?: boolean;
}

export function formPageSteps(prefix: string, options: FormOptions): GuideStep[] {
  const steps: GuideStep[] = options.fields.map((field) => ({ id: `field${cap(field)}`, target: `${prefix}.${field}`, kind: 'field' as const }));
  if (options.saveBar) steps.push(sharedStep('saveBar', `${prefix}.save`));
  if (options.backLink) steps.push(sharedStep('backLink', `${prefix}.back`));
  return steps;
}

interface DetailHeaderOptions {
  status?: boolean;
  /** Action button names, in order; each is `<prefix>.<name>`. */
  actions?: string[];
  backLink?: boolean;
}

export function detailHeaderSteps(prefix: string, options: DetailHeaderOptions = {}): GuideStep[] {
  const steps: GuideStep[] = [{ id: 'header', target: `${prefix}.header`, kind: 'region' }];
  if (options.status) steps.push(sharedStep('statusBadge', `${prefix}.status`, { id: 'status' }));
  for (const action of options.actions ?? []) {
    steps.push({
      id: `action${cap(action)}`,
      target: `${prefix}.${action}`,
      kind: 'control',
      safety: 'explain-only',
      ...(CAREFUL.has(action) ? { warning: true } : {}),
    });
  }
  if (options.backLink) steps.push(sharedStep('backLink', `${prefix}.back`));
  return steps;
}
