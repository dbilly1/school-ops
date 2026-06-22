'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';

// Subjects is the first tab but is owner/admin-only (see academics/layout.tsx).
// Redirect each user to the first tab they can actually open so teachers (and
// headmasters) don't land on Subjects, which they have no access to.
export default function AcademicsIndex() {
  const router = useRouter();
  const { isOwner, isAdmin, loading } = useStaffAuth();

  useEffect(() => {
    if (loading) return;
    const target = isOwner || isAdmin
      ? '/school/academics/subjects'
      : '/school/academics/timetable';
    router.replace(target);
  }, [loading, isOwner, isAdmin, router]);

  return null;
}
