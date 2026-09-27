import { useThemeStore } from '../../../store/useThemeStore';
import { PRODUCT_NAME } from '../../../constants/brand';
import logo from '../../../assets/brand/wellness-plus-logo.png';
import logoOnDark from '../../../assets/brand/wellness-plus-logo-dark.png';
import mark from '../../../assets/brand/wellness-plus-mark.png';
import styles from './BrandLogo.module.css';

/*
 * The artwork is the PNG Wellness Albania supplied (SRS §3.1), trimmed. The
 * dark-theme file is the same image with only the navy wordmark recoloured
 * light — the symbol keeps its own colours on both themes. Swap these three
 * files, and nothing else, when the vector logo arrives.
 */
const LOCKUP_SIZE = { width: 759, height: 160 };
const MARK_SIZE = { width: 192, height: 192 };

export interface BrandLogoProps {
  /**
   * Viewport width, in px, below which the lockup gives way to the
   * leaf-and-cross symbol on its own. Omit to always show the full lockup.
   */
  collapseBelow?: number;
  className?: string;
}

/**
 * The Wellness Plus logo (FR-BR-01), named for screen readers as the product.
 *
 * One `<img>` in a `<picture>` rather than two images toggled by CSS, so the
 * accessibility tree holds a single logo at every width. Height comes from the
 * `--brand-logo-height` custom property; the width follows the artwork.
 */
export const BrandLogo = ({ collapseBelow, className }: BrandLogoProps) => {
  const resolvedTheme = useThemeStore((state) => state.resolved);
  const lockup = resolvedTheme === 'dark' ? logoOnDark : logo;

  return (
    <picture className={[styles.logo, className].filter(Boolean).join(' ')}>
      {collapseBelow !== undefined && (
        <source media={`(max-width: ${collapseBelow - 0.02}px)`} srcSet={mark} {...MARK_SIZE} />
      )}
      <img className={styles.image} src={lockup} alt={PRODUCT_NAME} {...LOCKUP_SIZE} />
    </picture>
  );
};
