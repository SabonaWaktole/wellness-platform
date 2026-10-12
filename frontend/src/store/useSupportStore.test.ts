import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore, type User } from './useAuthStore';
import { useSupportStore } from './useSupportStore';

const user: User = {
  userId: 'u1',
  email: 'owner@example.com',
  role: 'BUSINESS_OWNER',
  tenantId: 't1',
  tenantSlug: 'acme',
};

const reset = () => {
  useSupportStore.getState().closePanel();
  useSupportStore.getState().endSession();
  useSupportStore.getState().clearContext();
  useAuthStore.setState({ user: null, impersonating: null, isAuthenticated: false });
};

describe('useSupportStore', () => {
  beforeEach(reset);

  it('starts closed with no session and no context', () => {
    expect(useSupportStore.getState()).toMatchObject({
      panelOpen: false,
      mode: 'none',
      context: { pageId: null, variant: null, scope: null },
    });
  });

  it('opens and closes the panel', () => {
    useSupportStore.getState().openPanel();
    expect(useSupportStore.getState().panelOpen).toBe(true);
    useSupportStore.getState().closePanel();
    expect(useSupportStore.getState().panelOpen).toBe(false);
  });

  it('starting a tour records the page, enters tour mode and closes the panel', () => {
    useSupportStore.getState().openPanel();
    useSupportStore.getState().startTour('clients.list');
    expect(useSupportStore.getState()).toMatchObject({
      panelOpen: false,
      mode: 'tour',
      context: { pageId: 'clients.list' },
    });
  });

  it('SUP-04 explaining one control records the page and the control, and closes the panel', () => {
    useSupportStore.getState().openPanel();
    useSupportStore.getState().startSingle('clients.list', 'search');
    expect(useSupportStore.getState()).toMatchObject({ panelOpen: false, mode: 'single', singleStepId: 'search', context: { pageId: 'clients.list' } });
  });

  it('SUP-04 ending a session forgets the control', () => {
    useSupportStore.getState().startSingle('clients.list', 'search');
    useSupportStore.getState().endSession();
    expect(useSupportStore.getState()).toMatchObject({ mode: 'none', singleStepId: null });
  });

  it('SUP-04 the panel can be opened straight onto the list of controls, and opens on the main view otherwise', () => {
    useSupportStore.getState().openPanel('controls');
    expect(useSupportStore.getState().panelView).toBe('controls');
    useSupportStore.getState().closePanel();
    expect(useSupportStore.getState().panelView).toBe('main');
    useSupportStore.getState().openPanel();
    expect(useSupportStore.getState().panelView).toBe('main');
  });

  it('SUP-04 pointing at a control starts pick mode on the page and closes the panel', () => {
    useSupportStore.getState().openPanel();
    useSupportStore.getState().startPick('clients.list');
    expect(useSupportStore.getState()).toMatchObject({ panelOpen: false, mode: 'pick', context: { pageId: 'clients.list' } });
  });

  it('ending the session returns to mode none', () => {
    useSupportStore.getState().startTour('clients.list');
    useSupportStore.getState().endSession();
    expect(useSupportStore.getState()).toMatchObject({ mode: 'none', context: { pageId: null } });
  });

  it('setContext merges, so a page can publish its variant and its tab separately', () => {
    useSupportStore.getState().setContext({ variant: 'ceo' });
    useSupportStore.getState().setContext({ scope: 'zones' });
    expect(useSupportStore.getState().context).toEqual({ pageId: null, variant: 'ceo', scope: 'zones' });
  });

  it('clearContext drops what a page published but keeps the running session page', () => {
    useSupportStore.getState().startTour('dashboard.ceo');
    useSupportStore.getState().setContext({ variant: 'ceo', scope: 'x' });
    useSupportStore.getState().clearContext();
    expect(useSupportStore.getState().context).toEqual({ pageId: 'dashboard.ceo', variant: null, scope: null });
  });

  it('signing out clears everything, as the sales script panel does', () => {
    useAuthStore.setState({ user, isAuthenticated: true });
    useSupportStore.getState().openPanel();
    useSupportStore.getState().startTour('clients.list');
    useSupportStore.getState().setContext({ variant: 'ceo' });

    useAuthStore.setState({ user: null, isAuthenticated: false });

    expect(useSupportStore.getState()).toMatchObject({
      panelOpen: false,
      mode: 'none',
      context: { pageId: null, variant: null, scope: null },
    });
  });
});
