import React from 'react';
import type { ReactNode } from 'react';
import { Card } from '../../ui/Card/Card';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { useThemeStore } from '../../../store/useThemeStore';
import nevaLogo from '../../../assets/nevacrm-logo.png';
import nevaLogoDark from '../../../assets/nevacrm-logo-dark.png';
import styles from './AuthLayout.module.css';

export interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  logoSrc?: string;
  logoIcon?: ReactNode; // Alternative if no src is provided
  /** Renders the NevaCRM wordmark instead of logoSrc/logoIcon, theme-aware. */
  showBrand?: boolean;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
  logoSrc,
  logoIcon,
  showBrand,
}) => {
  const resolvedTheme = useThemeStore((state) => state.resolved);

  return (
    <div className={styles.container}>
      <div className={styles.themeToggleSlot}>
        <ThemeToggle />
      </div>
      <Card padding="xl" className={styles.mainCard}>
        <header className={styles.header}>
          {showBrand ? (
            <img
              src={resolvedTheme === 'dark' ? nevaLogoDark : nevaLogo}
              alt="NevaCRM"
              className={styles.brandLogo}
            />
          ) : (
            (logoSrc || logoIcon) && (
              <div className={styles.logoWrapper}>
                {logoSrc ? (
                  <img src={logoSrc} alt="Logo" className={styles.logoImage} />
                ) : (
                  logoIcon
                )}
              </div>
            )
          )}
          <div className={styles.titleWrapper}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </header>
        
        {children}
      </Card>
    </div>
  );
};
