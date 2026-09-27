import React from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../ui/Card/Card';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { BrandLogo } from '../BrandLogo';
import { usePageTitle } from '../../../hooks/usePageTitle';
import styles from './AuthLayout.module.css';

export interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** A glyph above the title, for a screen with a context of its own (an invitation). */
  icon?: ReactNode;
}

/**
 * The frame of every screen a signed-out visitor sees (FR-BR-03): sign-in,
 * password recovery and invitations.
 *
 * On a wide screen a brand panel fills the left-hand column. It is the slot a
 * login photograph goes into if Wellness Albania supplies one; until then it
 * carries the logo's colours and shapes. On a phone the panel is dropped and
 * the form has the screen to itself.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle, icon }) => {
  const { t } = useTranslation('auth');
  usePageTitle(title);

  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        {/* The logo's figure, enlarged: two leaves and a head. Decorative. */}
        <div className={styles.art} aria-hidden="true">
          <span className={styles.leafLeft} />
          <span className={styles.leafRight} />
          <span className={styles.head} />
        </div>
        <p className={styles.tagline}>{t('layout.tagline')}</p>
      </aside>

      <div className={styles.formColumn}>
        <div className={styles.toolbar}>
          <ThemeToggle />
        </div>

        <main className={styles.content}>
          <BrandLogo className={styles.logo} />

          <header className={styles.header}>
            {icon && <div className={styles.icon}>{icon}</div>}
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </header>

          <Card padding="lg" className={styles.card}>
            {children}
          </Card>
        </main>

        <footer className={styles.footer}>
          {t('layout.copyright', { year: new Date().getFullYear() })}
        </footer>
      </div>
    </div>
  );
};
