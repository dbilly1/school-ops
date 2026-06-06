'use client';

import { useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  school: { id: string; name: string } | null;
};

type LogsResponse = {
  total: number; page: number; limit: number; pages: number;
  logs: AuditLog[];
};

export default function AdminAuditLogsPage() {
  const [page, setPage]           = useState(1);
  const [schoolId, setSchoolId]   = useState('');
  const [inputSchool, setInput]   = useState('');

  const fetchLogs = useCallback(
    () => adminApi.get<LogsResponse>(
      `/super-admin/analytics/audit-logs?page=${page}&limit=50${schoolId ? `&schoolId=${schoolId}` : ''}`
    ),
    [page, schoolId],
  );
  const { data, loading } = useApi(fetchLogs);

  function applyFilter() {
    setSchoolId(inputSchool.trim());
    setPage(1);
  }

  function clearFilter() {
    setInput('');
    setSchoolId('');
    setPage(1);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Cross-tenant write event history.</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <input
          value={inputSchool}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyFilter()}
          placeholder="Filter by school ID…"
          className="w-72 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button onClick={applyFilter}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition">
          Apply
        </button>
        {schoolId && (
          <button onClick={clearFilter} className="text-sm text-slate-400 hover:text-slate-600 transition">
            Clear
          </button>
        )}
        {data && (
          <span className="text-xs text-slate-400 ml-auto">
            {data.total.toLocaleString()} events · page {data.page} of {data.pages}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">School</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Actor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={6} className="px-4 py-3">
                  <div className="h-5 bg-slate-100 rounded animate-pulse" />
                </td>
              </tr>
            ))}

            {!loading && data?.logs.map(log => (
              <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3">
                  {log.school
                    ? <span className="text-xs text-slate-600">{log.school.name}</span>
                    : <span className="text-xs text-slate-300 italic">Platform</span>}
                </td>
                <td className="px-4 py-3">
                  {log.actor ? (
                    <div>
                      <p className="text-xs font-medium text-slate-700">
                        {log.actor.firstName} {log.actor.lastName}
                      </p>
                      <p className="text-[10px] text-slate-400">{log.actor.email}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300 italic">System</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-500">{log.entityType}</p>
                  <p className="text-[10px] font-mono text-slate-300 truncate max-w-[120px]">{log.entityId}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-slate-400">{log.ipAddress ?? '—'}</span>
                </td>
              </tr>
            ))}

            {!loading && (!data?.logs || data.logs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-400">
                  No audit log entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition">
            ← Prev
          </button>
          <span className="text-sm text-slate-500">Page {page} of {data.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages}
            className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
