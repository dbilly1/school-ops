'use client';

import { use } from 'react';
import { UserOverrides } from '@/components/permissions/user-overrides';

export default function UserOverridesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserOverrides userId={id} backHref={`/school/users/${id}`} />;
}
