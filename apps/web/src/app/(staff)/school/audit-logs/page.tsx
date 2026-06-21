'use client';

import { useState, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { downloadCsv } from '@/lib/csv';

// ── Types (mirror apps/api/src/audit-viewer/audit-viewer.service.ts) ────────────

type Actor = { id: string; firstName: string; lastName: string; email: string };

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: Actor;
};

type AuditResponse = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  logs: AuditLog[];
};

type AuditSummary = {
  total: number;
  todayCount: number;
  byAction: { action: string; count: number }[];
  recentActors: { actorId: string; createdAt: string; actor: Actor }[];
};

type UserLite = { id: string; firstName: string; lastName: string };

// The enum lives in apps/api prisma schema (AuditAction).
const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT',
  'PERMISSION_CHANGE', 'FEATURE_TOGGLE', 'PROGRESSION',
  'YEAR_ACTIVATION', 'TERM_ACTIVATION', 'GRANT_ISSUED',
];

const ENTITY_TYPES = [
  'student', 'user', 'invoice', 'payment', 'assessment', 'assessment_score',
  'attendance', 'feeding_payment', 'transport_payment', 'expense',
  'role_permission_override', 'user_permission_override', 'school_feature',
  'notice', 'announcement', 'report_card', 'academic_year', 'term',
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#22c55e', GRANT_ISSUED: '#22c55e',
  UPDATE: '#f59e0b', FEATURE_TOGGLE: '#f59e0b', PERMISSION_CHANGE: '#f59e0b',
  DELETE: '#ef4444',
  LOGIN: '#3b82f6', PROGRESSION: '#3b82f6', YEAR_ACTIVATION: '#3b82f6', TERM_ACTIVATION: '#3b82f6',
  LOGOUT: '#94a3b8',
};

function actionColor(action: string) { return ACTION_COLORS[action] ?? '#64748b'; }
function actionBg(action: string) { return actionColor(action) + '18'; }

// ── Summary header ──────────────────────────────────────────────────────────────

function SummaryHeader() {
  const { data } = useApi(useCallback(() => staffApi.get<AuditSummary>('/school/audit-logs/summary').catch(() => null), []));
  if (!data) return null;

  const top = data.byAction.slice(0, 4);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
        <p className="text-xs text-slate-400 mb-1">Total events</p>
        <p className="text-2xl font-bold text-slate-800">{data.total.toLocaleString()}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
        <p className="text-xs text-slate-400 mb-1">Today</p>
        <p className="text-2xl font-bold text-emerald-600">{data.todayCount.toLocaleString()}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 col-span-2">
        <p className="text-xs text-slate-400 mb-2">Most common actions</p>
        <div className="flex flex-wrap gap-1.5">
          {top.length === 0 && <span className="text-sm text-slate-400">No activity yet.</span>}
          {top.map(a => (
            <span key={a.action} className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ color: actionColor(a.action), backgroundColor: actionBg(a.action) }}>
              {a.action} · {a.count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Log row ─────────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = !!(log.beforeValue || log.afterValue);

  return (
    <>
      <tr
        className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${hasDiff ? 'cursor-pointer' : ''}`}
        onClick={() => hasDiff && setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: actionColor(log.action), backgroundColor: actionBg(log.action) }}>
            {log.action}
          </span>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm text-slate-700 font-medium">{log.entityType}</p>
          <p className="text-xs font-mono text-slate-400 truncate max-w-[180px]">{log.entityId}</p>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm text-slate-700">{log.actor.firstName} {log.actor.lastName}</p>
          <p className="text-xs text-slate-400">{log.actor.email}</p>
        </td>
        <td className="px-4 py-3">
          <p className="text-xs text-slate-500">
            {new Date(log.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-xs text-slate-400">
            {new Date(log.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </td>
        <td className="px-4 py-3">
          {log.ipAddress && <span className="text-xs font-mono text-slate-400">{log.ipAddress}</span>}
        </td>
        <td className="px-4 py-3 text-right">
          {hasDiff && <span className="text-xs text-slate-400">{expanded ? '▲' : '▼'}</span>}
        </td>
      </tr>

      {expanded && hasDiff && (
        <tr className="border-b border-slate-50 bg-slate-50">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {log.beforeValue && (
                <div>
                  <p className="font-semibold text-slate-500 mb-1 uppercase tracking-wide">Before</p>
                  <pre className="bg-white border border-slate-200 rounded-lg p-3 text-slate-600 overflow-auto max-h-48 font-mono text-[11px]">
                    {JSON.stringify(log.beforeValue, null, 2)}
                  </pre>
                </div>
              )}
              {log.afterValue && (
                <div>
                  <p className="font-semibold text-slate-500 mb-1 uppercase tracking-wide">After</p>
                  <pre className="bg-white border border-slate-200 rounded-lg p-3 text-slate-600 overflow-auto max-h-48 font-mono text-[11px]">
                    {JSON.stringify(log.afterValue, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

const selectInput = 'px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none';
const dateInput = selectInput;
function focusRing(e: React.FocusEvent<HTMLElement>) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; }
function blurRing(e: React.FocusEvent<HTMLElement>) { e.currentTarget.style.boxShadow = ''; }

export default function AuditLogsPage() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';

  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [page, setPage] = useState(1);

  const { data: users } = useApi(useCallback(() => staffApi.get<UserLite[]>('/school/users').catch(() => []), []));

  const fetchLogs = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (action) params.set('action', action);
    if (actorId) params.set('actorId', actorId);
    if (entityType) params.set('entityType', entityType);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return staffApi.get<AuditResponse>(`/school/audit-logs?${params}`).catch(() => null);
  }, [action, actorId, entityType, startDate, endDate, page]);

  const { data, loading } = useApi(fetchLogs, `${action}|${actorId}|${entityType}|${startDate}|${endDate}|${page}`);

  const hasFilters = !!(action || actorId || entityType);

  function reset<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  function exportCsv() {
    if (!data?.logs?.length) return;
    const rows = data.logs.map(l => [
      new Date(l.createdAt).toLocaleString('en-GB'),
      l.action, l.entityType, l.entityId,
      `${l.actor.firstName} ${l.actor.lastName}`, l.actor.email,
      l.ipAddress ?? '',
    ]);
    downloadCsv('audit-logs', ['Time', 'Action', 'Entity type', 'Entity ID', 'Actor', 'Email', 'IP'], rows);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every write operation is logged. Click a row with a diff to expand its before/after.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data?.logs?.length}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" />
          </svg>
          Export page
        </button>
      </div>

      <SummaryHeader />

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <input type="date" value={startDate} onChange={e => reset(setStartDate)(e.target.value)} className={dateInput} onFocus={focusRing} onBlur={blurRing} />
        <span className="text-slate-400 self-center text-sm">to</span>
        <input type="date" value={endDate} onChange={e => reset(setEndDate)(e.target.value)} className={dateInput} onFocus={focusRing} onBlur={blurRing} />
        <select value={action} onChange={e => reset(setAction)(e.target.value)} className={selectInput}>
          <option value="">All actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={actorId} onChange={e => reset(setActorId)(e.target.value)} className={selectInput}>
          <option value="">All actors</option>
          {users?.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </select>
        <select value={entityType} onChange={e => reset(setEntityType)(e.target.value)} className={selectInput}>
          <option value="">All entity types</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setAction(''); setActorId(''); setEntityType(''); setPage(1); }}
            className="text-sm text-slate-400 hover:text-slate-700 transition">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Actor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">IP</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={6} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && data?.logs?.map(log => <LogRow key={log.id} log={log} />)}
            {!loading && (!data?.logs || data.logs.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No audit logs match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">
            Showing {((page - 1) * data.pageSize) + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-40">
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-slate-500">{page} / {data.totalPages}</span>
            <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
