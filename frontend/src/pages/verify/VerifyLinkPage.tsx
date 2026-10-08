import { Suspense, lazy, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { PublicVerification } from './PublicVerification';

/** Loaded only for a signed-in user with "Members: verify", so a partner clinic's phone never downloads the staff screen. */
const StaffTokenVerification = lazy(() => import('./StaffTokenVerification'));

/** The page must never be indexed, even if a link is pasted somewhere public (FR-CRD-08). */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}

/**
 * `/v/:token`, the address every card's QR code holds (M4 Slice 13, FR-VER-08, D12). One link, two pages: once the
 * session is known, a user with "Members: verify" gets the Reception screen and anyone else the public page. The server
 * enforces the difference: the staff endpoint needs the permission, and the public endpoint answers the same to everyone.
 */
export const VerifyLinkPage = () => {
  const { token = '' } = useParams();
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.isInitializing);
  useNoIndex();

  if (initializing) return <main aria-busy="true" />;
  const staffSlug = user?.permissions?.['members.verify'] !== undefined ? user.tenantSlug : null;
  if (staffSlug) {
    return (
      <Suspense fallback={null}>
        <StaffTokenVerification token={token} tenantSlug={staffSlug} />
      </Suspense>
    );
  }
  return <PublicVerification token={token} />;
};
