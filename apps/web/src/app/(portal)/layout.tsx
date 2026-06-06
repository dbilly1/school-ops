'use client';

import { PortalAuthProvider } from '@/contexts/portal-auth';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      {children}
    </PortalAuthProvider>
  );
}
