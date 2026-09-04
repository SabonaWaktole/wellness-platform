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
