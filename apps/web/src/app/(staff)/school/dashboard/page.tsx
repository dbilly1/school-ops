'use client';

import { useStaffAuth } from '@/contexts/staff-auth';

export default function DashboardPage() {
  const { user, branding } = useStaffAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">
          Good {getGreeting()}, {user?.firstName}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {branding?.name ?? 'Your school'} · Staff Portal
        </p>
      </div>

      {/* Placeholder — will be replaced with real dashboard widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {['Students', 'Staff', 'Present today', 'Outstanding fees'].map(label => (
          <div key={label} className="bg-white rounded-xl border border-slate-100 px-5 py-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
            <div className="mt-2 h-7 w-20 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 px-5 py-8 text-center text-slate-400 text-sm">
        Dashboard widgets coming soon
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
