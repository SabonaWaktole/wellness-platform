import { definePageGuide } from '../defineGuide';
import type { GuideStep } from '../types';

/**
 * The application shell's guide: the header and sidebar every page shares. It
 * is not a route page; page guides opt in with `includeShell()`. The copy is
 * under `support:shell.*` and is borrowed by `use`, so it is written once.
 *
 * Two controls are deliberately NOT explained as working, and not annotated,
 * because they do nothing today (open item for the team, risk R10):
 *   - the header search box: it has no value or change handler;
 *   - the sidebar "New entry" button: no page ever passes `onNewEntryClick`.
 * Documenting either as functional would be wrong. The mobile search toggle
 * drives the inert box, so it is left out too.
 */
export const shellSteps: GuideStep[] = [
  // The menu button only exists on a phone; elsewhere the step is dropped.
  { id: 'shellMenu', target: 'shell.menu', kind: 'control', use: 'shell.menu', scope: 'shell', requires: { viewport: 'mobile' } },
  // The sidebar is off screen on a phone until opened, so these steps ask for it.
  { id: 'shellNav', target: 'shell.nav', kind: 'region', use: 'shell.nav', scope: 'shell', needs: 'sidebar' },
  // The menu differs per user (permission and workflow), so one exemplar is explained, not every entry.
  { id: 'shellNavItem', target: 'shell.nav.item', kind: 'control', use: 'shell.navItem', scope: 'shell', repeat: true, needs: 'sidebar' },
  { id: 'shellTheme', target: 'shell.theme', kind: 'menu', use: 'shell.theme', scope: 'shell' },
  { id: 'shellNotifications', target: 'shell.notifications', kind: 'menu', use: 'shell.notifications', scope: 'shell' },
  { id: 'shellScript', target: 'shell.script', kind: 'control', use: 'shell.script', scope: 'shell', requires: { permission: 'script.view' } },
  { id: 'shellSupport', target: 'shell.support', kind: 'control', use: 'shell.support', scope: 'shell' },
  { id: 'shellProfile', target: 'shell.profile', kind: 'menu', use: 'shell.profile', scope: 'shell' },
  { id: 'shellLogout', target: 'shell.logout', kind: 'control', use: 'shell.logout', scope: 'shell', needs: 'sidebar' },
];

export const shellGuide = definePageGuide({ pageId: 'shell', version: 1, namespace: 'support', steps: shellSteps });

/** Copies of the shell steps for a page guide to put first (or anywhere), free to change without changing the shell. */
export const includeShell = (): GuideStep[] => shellSteps.map((step) => ({ ...step, ...(step.requires ? { requires: { ...step.requires } } : {}) }));
