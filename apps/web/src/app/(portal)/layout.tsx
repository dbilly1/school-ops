'use client';

import { PortalAuthProvider } from '@/contexts/portal-auth';
import { PortalBrandingProvider } from '@/contexts/portal-branding';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalBrandingProvider>
      <PortalAuthProvider>
        {children}
      </PortalAuthProvider>
    </PortalBrandingProvider>
  );
}
