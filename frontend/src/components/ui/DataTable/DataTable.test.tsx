import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

const desktop = vi.hoisted(() => ({ value: true }));
vi.mock('../../../hooks/useMediaQuery', () => ({ useIsDesktop: () => desktop.value }));

interface Row {
  id: string;
  name: string;
}
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));
const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', render: (r) => r.name, sortable: true },
  { id: 'created_at', header: 'Created', render: () => 'today', sortable: true },
  { id: 'plain', header: 'Plain', render: () => 'x' },
];
const sort = { field: 'name', direction: 'asc' as const, onSort: () => {} };
const q = (container: HTMLElement, token: string) => Array.from(container.querySelectorAll(`[data-tour~="${token}"]`));

beforeEach(() => {
  desktop.value = true;
});

describe('SUP-07 DataTable tour ids: rows', () => {
  it.each([
    ['table', true, 'tr'],
    ['card', false, 'div'],
  ])('SUP-07 every row of the %s layout carries the row id and the repeat marker, whatever the row count', (_name, isDesktop, tag) => {
    desktop.value = isDesktop;
    const { container, rerender } = render(<DataTable columns={columns} rows={rows(3)} rowKey={(r) => r.id} rowTourId="clients.list.row" />);
    expect(q(container, 'clients.list.row')).toHaveLength(3);

    rerender(<DataTable columns={columns} rows={rows(20)} rowKey={(r) => r.id} rowTourId="clients.list.row" />);
    const found = q(container, 'clients.list.row');
    expect(found).toHaveLength(20);
    expect(found.every((node) => node.tagName.toLowerCase() === tag)).toBe(true);
    expect(found.every((node) => node.hasAttribute('data-tour-repeat'))).toBe(true);
  });

  it('SUP-05 adds nothing to the rows when the props are omitted', () => {
    const { container } = render(<DataTable columns={columns} rows={rows(3)} rowKey={(r) => r.id} />);
    expect(container.querySelector('[data-tour]')).toBeNull();
    expect(container.querySelector('[data-tour-repeat]')).toBeNull();
  });
});

describe('SUP-05 DataTable tour ids: the table itself', () => {
  it('SUP-05 puts the id on the wrapper', () => {
    const { container } = render(<DataTable columns={columns} rows={rows(2)} rowKey={(r) => r.id} tourId="clients.list.table" />);
    expect(q(container, 'clients.list.table')).toHaveLength(1);
    expect(container.firstElementChild).toHaveAttribute('data-tour', 'clients.list.table');
  });

  it('SUP-05 puts the id on the wrapper of the card layout too', () => {
    desktop.value = false;
    const { container } = render(<DataTable columns={columns} rows={rows(2)} rowKey={(r) => r.id} tourId="clients.list.table" />);
    expect(container.firstElementChild).toHaveAttribute('data-tour', 'clients.list.table');
  });

  it('SUP-05 marks sortable headers only, with the column id, made safe for the id grammar', () => {
    const { container } = render(<DataTable columns={columns} rows={rows(2)} rowKey={(r) => r.id} sort={sort} tourId="clients.list.table" />);
    expect(q(container, 'clients.list.table.sort.name')).toHaveLength(1);
    expect(q(container, 'clients.list.table.sort.created-at')).toHaveLength(1);
    expect(container.querySelector('[data-tour$=".sort.plain"]')).toBeNull();
    expect(q(container, 'clients.list.table.sort.name')[0].tagName).toBe('BUTTON');
  });

  it('SUP-05 marks no sort control when the table is not sortable', () => {
    const { container } = render(<DataTable columns={columns} rows={rows(2)} rowKey={(r) => r.id} tourId="clients.list.table" />);
    expect(container.querySelector('[data-tour*=".sort."]')).toBeNull();
  });

  it('SUP-05 marks the empty state', () => {
    const { container } = render(
      <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} tourId="clients.list.table" empty={{ title: 'None yet' }} />,
    );
    const empty = q(container, 'clients.list.table.empty');
    expect(empty).toHaveLength(1);
    expect(empty[0]).toHaveTextContent('None yet');
  });

  it.each([
    ['table', true],
    ['card', false],
  ])('SUP-08 marks the %s loading skeleton, and says it is busy', (_name, isDesktop) => {
    desktop.value = isDesktop;
    const { container } = render(
      <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} isLoading loadingRowCount={2} tourId="clients.list.table" />,
    );
    const loading = q(container, 'clients.list.table.loading');
    expect(loading).toHaveLength(2);
    expect(loading.every((node) => node.getAttribute('aria-busy') === 'true')).toBe(true);
  });

  it('SUP-05 a skeleton is not marked busy unless the page asked to be explained', () => {
    const { container } = render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} isLoading />);
    expect(container.querySelector('[aria-busy]')).toBeNull();
  });
});
