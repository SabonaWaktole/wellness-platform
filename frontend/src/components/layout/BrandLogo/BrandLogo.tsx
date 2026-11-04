import { useThemeStore } from '../../../store/useThemeStore';
import { PRODUCT_NAME } from '../../../constants/brand';
import logo from '../../../assets/brand/wellness-plus-logo.png';
import logoOnDark from '../../../assets/brand/wellness-plus-logo-dark.png';
import mark from '../../../assets/brand/wellness-plus-mark.png';
import markOnDark from '../../../assets/brand/wellness-plus-mark-dark.png';
import styles from './BrandLogo.module.css';

/*
 * The artwork is the Wellness Albania Clinic logo, supplied as a stacked
 * square in a navy and a light version. Its symbol and wordmark are set side
 * by side here so the logo stays legible at header height. The dark-theme
 * files are the light version. Swap these four files, and nothing else, when
 * the vector logo arrives.
 */
const LOCKUP_SIZE = { width: 388, height: 160 };
const MARK_SIZE = { width: 192, height: 192 };

export interface BrandLogoProps {
  /**
   * Viewport width, in px, below which the lockup gives way to the
   * three-rings symbol on its own. Omit to always show the full lockup.
   */
  collapseBelow?: number;
  className?: string;
}

/**
 * The Wellness Albania Clinic logo (FR-BR-01), named for screen readers as the product.
 *
 * One `<img>` in a `<picture>` rather than two images toggled by CSS, so the
 * accessibility tree holds a single logo at every width. Height comes from the
 * `--brand-logo-height` custom property; the width follows the artwork.
 */
export const BrandLogo = ({ collapseBelow, className }: BrandLogoProps) => {
  const resolvedTheme = useThemeStore((state) => state.resolved);
  const onDark = resolvedTheme === 'dark';
  const lockup = onDark ? logoOnDark : logo;

  return (
    <picture className={[styles.logo, className].filter(Boolean).join(' ')}>
      {collapseBelow !== undefined && (
        <source media={`(max-width: ${collapseBelow - 0.02}px)`} srcSet={onDark ? markOnDark : mark} {...MARK_SIZE} />
      )}
      <img className={styles.image} src={lockup} alt={PRODUCT_NAME} {...LOCKUP_SIZE} />
    </picture>
  );
};
