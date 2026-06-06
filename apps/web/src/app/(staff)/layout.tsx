'use client';

import { StaffAuthProvider } from '@/contexts/staff-auth';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffAuthProvider>
      {children}
    </StaffAuthProvider>
  );
}
