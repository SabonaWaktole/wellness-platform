import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useIntegrations } from '../hooks/useIntegrations';
import { useAuthStore } from '../store/useAuthStore';
import { useLogout } from '../hooks/useLogout';
import { usePermission } from '../hooks/usePermission';
import { useNavigation } from '../hooks/useNavigation';
import { AppLayout } from '../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../components/layout/Sidebar/Sidebar';
import { SettingsLayout } from '../components/layout/SettingsLayout/SettingsLayout';
import { useTranslation } from 'react-i18next';
import { useDateFormat } from '../hooks/useDateFormat';
import { getUserDisplayName } from '../utils/userUtils';

const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
  GOOGLE_CALENDAR: (
    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.135 12.01L14.135 12.01H12.01V14.135H14.135V12.01ZM14.135 16.26H12.01V18.385H14.135V16.26ZM18.385 12.01H16.26V14.135H18.385V12.01ZM18.385 16.26H16.26V18.385H18.385V16.26ZM18.385 10.947H16.26V12.01H14.135V10.947H12.01V12.01H10.947V10.947H8.822V12.01H6.697V10.947H5.635V20.51H19.447V10.947H18.385ZM19.447 7.76H17.322V5.635H15.197V7.76H9.885V5.635H7.76V7.76H5.635C4.467 7.76 3.51 8.716 3.51 9.885L3.51 20.51C3.51 21.678 4.467 22.635 5.635 22.635H19.447C20.616 22.635 21.572 21.678 21.572 20.51V9.885C21.572 8.716 20.616 7.76 19.447 7.76ZM19.447 20.51H5.635V9.885H19.447V20.51Z" fill="#4285F4"/>
      <path d="M9.885 5.635H7.76V7.76H9.885V5.635Z" fill="#34A853"/>
      <path d="M17.322 5.635H15.197V7.76H17.322V5.635Z" fill="#EA4335"/>
    </svg>
  ),
};

export const IntegrationsPage: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantSlug } = useParams();
  const { integrations, error, connectIntegration, disconnectIntegration } = useIntegrations();
  const [connecting, setConnecting] = useState<string | null>(null);

  const navItems = useNavigation(user, location.pathname);

  const AVAILABLE_INTEGRATIONS = [
    {
      provider: 'GOOGLE_CALENDAR',
      name: t('integrations.googleCalendar.name'),
      description: t('integrations.googleCalendar.description'),
      icon: INTEGRATION_ICONS.GOOGLE_CALENDAR,
    },
  ];

  // integrations.manage (FR-RBAC-07), not the BUSINESS_OWNER role — the whole
  // route is already gated the same way in routes/index.tsx.
  const isBusinessOwner = usePermission('integrations.manage');
  const userName = getUserDisplayName(user, 'Settings User');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      // In a real scenario, this would redirect to Google OAuth flow.
      const mockConfig = { token: 'mock-oauth-token', refreshToken: 'mock-refresh-token' };
      await connectIntegration(provider, mockConfig);
    } catch (err) {
      console.error(err);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (window.confirm(t('integrations.confirmDisconnect'))) {
      setConnecting(provider);
      try {
        await disconnectIntegration(provider);
      } catch (err) {
        console.error(err);
      } finally {
        setConnecting(null);
      }
    }
  };

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar 
          navItems={navItems} 
          onNavItemClick={(id) => navigate(`/${tenantSlug}/${id}`)}
          onLogoutClick={handleLogout}
        />
      }
    >
      <SettingsLayout activeNavId="integrations">
        <div style={{ padding: 'var(--spacing-md)', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
          {/* Header */}
          <div>
            <nav aria-label={tc('a11y.breadcrumb')} style={{ marginBottom: 'var(--spacing-md)' }}>
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', gap: 'var(--spacing-sm)', fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                <li><a href="#settings" onClick={(e) => { e.preventDefault(); navigate(`/${tenantSlug}/settings/profile`); }} style={{ color: 'inherit', textDecoration: 'none' }}>{t('breadcrumb')}</a></li>
                <li>/</li>
                <li aria-current="page" style={{ color: 'var(--color-on-surface)', fontWeight: 600 }}>{t('integrations.breadcrumb')}</li>
              </ol>
            </nav>
            <h1 style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-headline-lg)', color: 'var(--color-on-surface)', margin: 0 }}>{t('integrations.title')}</h1>
            <p style={{ fontFamily: 'var(--font-family-base)', fontSize: '13px', margin: 'var(--spacing-xs) 0 0 0', color: 'var(--color-on-surface-variant)' }}>{t('integrations.subtitle')}</p>
          </div>

          {error && (
            <div style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-on-error-container)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-lg)' }}>
              {error}
            </div>
          )}

          {!isBusinessOwner && (
            <div style={{ backgroundColor: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-lg)' }}>
              {t('integrations.ownerOnlyNotice')}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 'var(--spacing-lg)' }}>
            {AVAILABLE_INTEGRATIONS.map(def => {
              const connectedInt = integrations.find(i => i.provider === def.provider && i.status === 'CONNECTED');
              const isConnected = !!connectedInt;
              const isProcessing = connecting === def.provider;

              return (
                <div key={def.provider} style={{ 
                  backgroundColor: 'var(--color-surface)', 
                  border: '1px solid var(--color-surface-variant)', 
                  borderRadius: 'var(--radius-lg)', 
                  padding: 'var(--spacing-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--elevation-1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                    <div style={{ 
                      padding: 'var(--spacing-sm)', 
                      backgroundColor: 'var(--color-surface-container)', 
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {def.icon}
                    </div>
                    <div>
                      <h3 style={{ margin: '0 0 var(--spacing-xs) 0', fontSize: 'var(--font-size-headline-md)', fontWeight: 500, color: 'var(--color-on-surface)' }}>{def.name}</h3>
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 600, 
                        padding: '2px 8px', 
                        borderRadius: '100px',
                        backgroundColor: isConnected ? 'var(--color-primary-container)' : 'var(--color-surface-variant)',
                        color: isConnected ? 'var(--color-on-primary-container)' : 'var(--color-on-surface-variant)'
                      }}>
                        {isConnected ? t('integrations.connected') : t('integrations.notConnected')}
                      </span>
                    </div>
                  </div>
                  
                  <p style={{ margin: '0 0 var(--spacing-lg) 0', fontSize: '13px', color: 'var(--color-on-surface-variant)', flexGrow: 1 }}>
                    {def.description}
                  </p>
                  
                  <div style={{ paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-surface-variant)' }}>
                    {isConnected ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>
                          {t('integrations.connectedSince', { date: dates.date(connectedInt.createdAt) })}
                        </div>
                        <button
                          onClick={() => handleDisconnect(def.provider)}
                          disabled={!isBusinessOwner || isProcessing}
                          style={{
                            width: '100%',
                            padding: 'var(--spacing-sm) var(--spacing-md)',
                            backgroundColor: 'transparent',
                            color: 'var(--color-error)',
                            border: '1px solid var(--color-error)',
                            borderRadius: 'var(--radius-lg)',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: (!isBusinessOwner || isProcessing) ? 'not-allowed' : 'pointer',
                            opacity: (!isBusinessOwner || isProcessing) ? 0.5 : 1
                          }}
                        >
                          {isProcessing ? t('integrations.disconnecting') : t('integrations.disconnect')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnect(def.provider)}
                        disabled={!isBusinessOwner || isProcessing}
                        style={{
                          width: '100%',
                          padding: 'var(--spacing-sm) var(--spacing-md)',
                          backgroundColor: 'var(--color-primary)',
                          color: 'var(--color-on-primary)',
                          border: 'none',
                          borderRadius: 'var(--radius-lg)',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: (!isBusinessOwner || isProcessing) ? 'not-allowed' : 'pointer',
                          opacity: (!isBusinessOwner || isProcessing) ? 0.5 : 1
                        }}
                      >
                        {isProcessing ? t('integrations.connecting') : t('integrations.connect', { name: def.name })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SettingsLayout>
    </AppLayout>
  );
};
