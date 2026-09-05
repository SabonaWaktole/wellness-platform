/**
 * Values only — no components — so React Fast Refresh keeps working for the
 * tab files that import them. `renderers.tsx` documents the same split.
 */

/**
 * The permanent tabs. Word's Home/Insert/Layout, minus everything this
 * product has no equivalent for: the point is a familiar SHAPE, not a
 * reproduction of a ribbon whose tabs would be empty here.
 */
export type RibbonTabId = 'home' | 'insert' | 'layout';

export const RIBBON_TABS: RibbonTabId[] = ['home', 'insert', 'layout'];

/**
 * Tabs that exist only while something is selected — Word's "Picture Format"
 * and friends. They are appended after the permanent tabs and activate
 * themselves, so the commands for the thing just clicked are already in front
 * of the user rather than a tab away.
 */
export type ContextualTabId = 'picture' | 'field' | 'textBox' | 'shape' | 'section';

export type AnyRibbonTabId = RibbonTabId | ContextualTabId;
