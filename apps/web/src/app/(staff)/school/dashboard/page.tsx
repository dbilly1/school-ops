'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useStaffAuth } from '@/contexts/staff-auth';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type DashboardSummary = {
  scope: 'full' | 'restricted';
  counts: {
    students: number;
    staff: number;
    present: { present: number; total: number; rate: number | null };
    outstanding: { total: number; invoiceCount: number } | null;
  };
  academics: {
    activeTerm: string | null;
    recentAssessments: {
      id: string; title: string; subject: string; term: string;
      totalScore: number; scoresRecorded: number; assessmentDate: string | null;
    }[];
    scoring: { total: number; scored: number };
  };
  activity: {
    recentAdmissions: { id: string; stage: string; name: string; createdAt: string }[] | null;
    upcomingEvents: { id: string; name: string; eventType: string; startDate: string; endDate: string }[];
    birthdaysToday: { id: string; firstName: string; lastName: string }[];
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtMoney(n: number) {
  return `GHS ${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, loading }: {
  label: string; value: string; sub?: string; loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-5 py-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-20 bg-slate-100 rounded animate-pulse" />
      ) : (
        <>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function Panel({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 italic py-3 text-center">{text}</p>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, branding } = useStaffAuth();

  const fetchSummary = useCallback(() => staffApi.get<DashboardSummary>('/school/dashboard/summary'), []);
  const { data, loading } = useApi(fetchSummary);

  const c = data?.counts;
  const present = c?.present;
  const scoring = data?.academics.scoring;
  const scoringPct = scoring && scoring.total > 0 ? Math.round((scoring.scored / scoring.total) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">
          Good {getGreeting()}, {user?.firstName}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {branding?.name ?? 'Your school'} · Staff Portal
          {data?.academics.activeTerm && <span> · {data.academics.activeTerm}</span>}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Students" loading={loading} value={String(c?.students ?? 0)} />
        <StatCard label="Staff" loading={loading} value={String(c?.staff ?? 0)} />
        <StatCard
          label="Present today"
          loading={loading}
          value={present?.rate !== null && present?.rate !== undefined ? `${present.rate}%` : '—'}
          sub={present && present.total > 0 ? `${present.present} of ${present.total} marked` : 'No attendance marked'}
        />
        {/* Outstanding only for privileged roles */}
        {(loading || c?.outstanding != null) && (
          <StatCard
            label="Outstanding fees"
            loading={loading}
            value={c?.outstanding != null ? fmtMoney(c.outstanding.total) : '—'}
            sub={
              c?.outstanding != null
                ? c.outstanding.invoiceCount === 0
                  ? 'No invoices generated yet'
                  : 'Current term'
                : undefined
            }
          />
        )}
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Academics */}
        <Panel
          title="Academics"
          action={<Link href="/school/academics/assessments" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>View all →</Link>}
        >
          {/* Scoring progress */}
          {scoring && scoring.total > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500">Assessments scored this term</span>
                <span className="text-xs font-medium text-slate-700">{scoring.scored}/{scoring.total}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${scoringPct}%`, backgroundColor: 'var(--accent)' }} />
              </div>
            </div>
          )}

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent assessments</p>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}</div>
          ) : data && data.academics.recentAssessments.length > 0 ? (
            <div className="space-y-1">
              {data.academics.recentAssessments.map(a => (
                <Link key={a.id} href={`/school/academics/assessments/${a.id}`}
                  className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                    <p className="text-xs text-slate-400">{a.subject} · {a.term}</p>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ml-3 ${a.scoresRecorded > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                    {a.scoresRecorded > 0 ? `${a.scoresRecorded} scored` : 'Awaiting'}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyRow text="No assessments yet." />
          )}
        </Panel>

        {/* Activity */}
        <Panel title="Activity">
          {/* Birthdays */}
          {data && data.activity.birthdaysToday.length > 0 && (
            <div className="mb-4 px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor: 'var(--accent-tint, #f0fdf4)' }}>
              🎂 <span className="font-medium text-slate-700">
                {data.activity.birthdaysToday.map(b => `${b.firstName} ${b.lastName}`).join(', ')}
              </span>
              <span className="text-slate-500"> {data.activity.birthdaysToday.length === 1 ? 'has' : 'have'} a birthday today</span>
            </div>
          )}

          {/* Recent admissions — privileged only */}
          {data?.activity.recentAdmissions && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recent admissions</p>
                <Link href="/school/admissions" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>View →</Link>
              </div>
              {data.activity.recentAdmissions.length > 0 ? (
                <div className="space-y-1">
                  {data.activity.recentAdmissions.map(a => (
                    <div key={a.id} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-slate-700 truncate">{a.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0 ml-3 capitalize">{a.stage.toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRow text="No admissions yet." />
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Upcoming events</p>
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 bg-slate-50 rounded-lg animate-pulse" />)}</div>
            ) : data && data.activity.upcomingEvents.length > 0 ? (
              <div className="space-y-1">
                {data.activity.upcomingEvents.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{e.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{e.eventType.toLowerCase().replace(/_/g, ' ')}</p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0 ml-3">{fmtDate(e.startDate)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow text="Nothing scheduled." />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
