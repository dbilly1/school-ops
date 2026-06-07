'use client';

import { useState, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; email: string };
};

type AuditResponse = {
  data: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

const ACTION_COLORS: Record<string, string> = {
  create: '#22c55e',
  update: '#f59e0b',
  delete: '#ef4444',
  login:  '#3b82f6',
  logout: '#94a3b8',
};

function actionColor(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#64748b';
}

function actionBg(action: string): string {
  const c = actionColor(action);
  return c + '18'; // ~10% opacity hex
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = log.beforeValue || log.afterValue;

  return (
    <>
      <tr
        className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${hasDiff ? 'cursor-pointer' : ''}`}
        onClick={() => hasDiff && setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: actionColor(log.action), backgroundColor: actionBg(log.action) }}
          >
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
          {hasDiff && (
            <span className="text-xs text-slate-400">{expanded ? '▲' : '▼'}</span>
          )}
        </td>
      </tr>

      {expanded && hasDiff && (
        <tr className="border-b border-slate-50 bg-slate-50">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';

  const [action, setAction]         = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate]   = useState(monthStart);
  const [endDate, setEndDate]       = useState(today);
  const [page, setPage]             = useState(1);

  const fetchLogs = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (action)     params.set('action',     action);
    if (entityType) params.set('entityType', entityType);
    if (startDate)  params.set('startDate',  startDate);
    if (endDate)    params.set('endDate',    endDate);
    return staffApi.get<AuditResponse>(`/school/audit-logs?${params}`).catch(() => null);
  }, [action, entityType, startDate, endDate, page]);

  const { data, loading } = useApi(fetchLogs);

  const ENTITY_TYPES = [
    'student', 'user', 'invoice', 'payment', 'assessment', 'assessment_score',
    'attendance', 'feeding_payment', 'transport_payment', 'role_permission_override',
    'user_permission_override', 'school_feature', 'notice', 'announcement',
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-sm text-slate-500 mt-0.5">All write operations are logged. Click any row with a before/after diff to expand it.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <span className="text-slate-400 self-center text-sm">to</span>
        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All entity types</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(action || entityType) && (
          <button onClick={() => { setAction(''); setEntityType(''); setPage(1); }}
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
                <td colSpan={6} className="px-4 py-3">
                  <div className="h-7 bg-slate-100 rounded animate-pulse" />
                </td>
              </tr>
            ))}
            {!loading && data?.data.map(log => <LogRow key={log.id} log={log} />)}
            {!loading && (!data?.data || data.data.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                No audit logs for this period.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">
            Showing {((page - 1) * data.pageSize) + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-slate-500">
              {page} / {data.pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
