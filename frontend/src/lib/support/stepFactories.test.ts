import { describe, expect, it } from 'vitest';
import { definePageGuide } from './defineGuide';
import { lintGuide } from './guideLint';
import { detailHeaderSteps, formPageSteps, listPageSteps } from './stepFactories';

const ids = (steps: Array<{ id: string }>) => steps.map((s) => s.id);
const targets = (steps: Array<{ target: string }>) => steps.map((s) => s.target);

describe('SUP-05 listPageSteps', () => {
  it('SUP-05 builds the standard list page in tour order', () => {
    const steps = listPageSteps('clients.list', { subject: 'clients', search: true, filters: ['city', 'status'], table: true, sortColumn: 'name', rowMenu: true, pagination: true });
    expect(ids(steps)).toEqual(['add', 'search', 'filterCity', 'filterStatus', 'table', 'sort', 'rowMenu', 'pagination']);
    expect(targets(steps)).toEqual([
      'clients.list.add',
      'clients.list.search',
      'clients.list.city',
      'clients.list.status',
      'clients.list.table',
      'clients.list.table.sort.name',
      'clients.list.rowMenu',
      'clients.list.pagination',
    ]);
  });

  it('SUP-05 gives the standard controls their shared guidance and the subject', () => {
    const steps = listPageSteps('clients.list', { subject: 'clients', search: true, pagination: true });
    expect(steps.find((s) => s.id === 'search')).toMatchObject({ use: 'shared.search', vars: { subject: 'clients' }, kind: 'field' });
    expect(steps.find((s) => s.id === 'pagination')).toMatchObject({ use: 'shared.pagination' });
  });

  it('SUP-07 declares repeat on the structures that repeat', () => {
    const steps = listPageSteps('clients.list', { subject: 'clients', table: true, rowMenu: true, rows: true });
    expect(steps.find((s) => s.id === 'rows')).toMatchObject({ target: 'clients.list.row', repeat: true });
    expect(steps.find((s) => s.id === 'rowMenu')).toMatchObject({ repeat: true });
  });

  it('SUP-05 leaves out what the page does not have', () => {
    expect(ids(listPageSteps('followUps.list', { subject: 'follow-ups', add: false }))).toEqual([]);
    expect(ids(listPageSteps('followUps.list', { subject: 'follow-ups', add: false, table: true }))).toEqual(['table']);
  });

  it('SUP-12 never produces a try-it step, so a page cannot start unsafe by default', () => {
    const steps = listPageSteps('clients.list', { subject: 'clients', search: true, filters: ['city'], table: true, sortColumn: 'name', rowMenu: true, pagination: true });
    expect(steps.every((s) => (s.safety ?? 'explain-only') === 'explain-only')).toBe(true);
  });

  it('SUP-05 can be overridden or extended by the page', () => {
    const steps = listPageSteps('clients.list', { subject: 'clients', search: true });
    const own = steps.map((s) => (s.id === 'search' ? { ...s, safety: 'try-it' as const } : s));
    expect(own.find((s) => s.id === 'search')?.safety).toBe('try-it');
    expect(Object.isFrozen(steps[0])).toBe(false);
  });

  it('SUP-02 a guide built from it passes lint apart from the page’s own copy', () => {
    const guide = definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps: listPageSteps('clients.list', { subject: 'clients', search: true, rows: true, pagination: true, table: true }) });
    const issues = lintGuide(guide).filter((i) => i.code !== 'missing-copy');
    expect(issues).toEqual([]);
  });
});

describe('SUP-05 formPageSteps', () => {
  it('SUP-05 builds fields, then the shared save bar and back link', () => {
    const steps = formPageSteps('clients.form', { fields: ['name', 'city'], saveBar: true, backLink: true });
    expect(ids(steps)).toEqual(['fieldName', 'fieldCity', 'saveBar', 'backLink']);
    expect(targets(steps)).toEqual(['clients.form.name', 'clients.form.city', 'clients.form.save', 'clients.form.back']);
    expect(steps[0]).toMatchObject({ kind: 'field' });
    expect(steps[2]).toMatchObject({ use: 'shared.saveBar', kind: 'submit', safety: 'explain-only' });
  });

  it('SUP-12 the save bar is explain-only, never try-it', () => {
    expect(formPageSteps('clients.form', { fields: [], saveBar: true }).every((s) => s.safety !== 'try-it')).toBe(true);
  });
});

describe('SUP-05 detailHeaderSteps', () => {
  it('SUP-05 builds the header, status, actions and back link', () => {
    const steps = detailHeaderSteps('clients.detail', { status: true, actions: ['edit', 'delete'], backLink: true });
    expect(ids(steps)).toEqual(['header', 'status', 'actionEdit', 'actionDelete', 'backLink']);
    expect(steps.find((s) => s.id === 'status')).toMatchObject({ use: 'shared.statusBadge' });
  });

  it('SUP-12 an action named delete, void or cancel is flagged as needing care', () => {
    const steps = detailHeaderSteps('deals.detail', { actions: ['edit', 'delete', 'void', 'cancel'] });
    expect(steps.filter((s) => s.warning).map((s) => s.id)).toEqual(['actionDelete', 'actionVoid', 'actionCancel']);
  });
});
