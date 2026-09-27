import { useEffect } from 'react';
import { PRODUCT_NAME } from '../constants/brand';

/**
 * Sets the browser tab title (FR-BR-04).
 *
 * The page's own title comes first and the product name after it, so a tab
 * narrowed to a few characters still tells two open pages apart. With no page
 * title the tab reads just the product name.
 *
 * Called by the two layouts rather than by each page: every screen renders one
 * of them, so the tab can never be left showing the previous page's title.
 */
export function usePageTitle(pageTitle?: string): void {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [pageTitle]);
}
