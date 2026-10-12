import { useLocation } from 'react-router-dom';
import { useSupportStore } from '../../store/useSupportStore';
import { hasLoader, isPlanned, resolvePageId } from './pageRegistry';

export interface SupportPage {
  /** The page the user is on, or null when the route has none (or the variant is not published yet). */
  pageId: string | null;
  /** The active tab, for pages whose route has a `:tab?` segment. */
  scope: string | null;
  hasGuide: boolean;
  /** The page is known but its guide is not built yet. */
  isPlanned: boolean;
}

/** Derived from the router on every render, never stored, so it changes on the same render as the URL. */
export function useSupportPage(): SupportPage {
  const { pathname } = useLocation();
  const variant = useSupportStore((state) => state.context.variant);
  const scope = useSupportStore((state) => state.context.scope);
  const pageId = resolvePageId(pathname, variant);
  return {
    pageId,
    scope,
    hasGuide: pageId !== null && hasLoader(pageId),
    isPlanned: pageId !== null && isPlanned(pageId),
  };
}
