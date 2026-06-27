'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { downloadCsv } from '@/lib/csv';

type Category = { id: string; name: string };
type ClassItem = { id: string; name: string };

export type SelectedStudent = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  classAssignments: { class: { name: string } }[];
  studentCategory: { id: string; name: string } | null;
  guardians: { name: string; phone: string | null }[];
};

type Action = 'category' | 'class' | 'reset' | 'archive' | 'restore' | 'delete';

export function BulkActionsBar({
  selected, categories, classes, statusFilter, isOwner, onRefetch, onClearSelection,
}: {
  selected: SelectedStudent[];
  categories: Category[] | null;
  classes: ClassItem[] | null;
  statusFilter: 'active' | 'archived' | 'all';
  isOwner: boolean;
  onRefetch: () => void;
  onClearSelection: () => void;
}) {
  const ids = selected.map(s => s.id);
  const count = ids.length;

  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [classId, setClassId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [resetResult, setResetResult] = useState<{ studentId: string; firstName: string; lastName: string; tempPassword: string }[] | null>(null);
  const [deleteResult, setDeleteResult] = useState<{ deleted: number; skipped: { studentId: string; name: string; reason: string }[] } | null>(null);

  function close() {
    setAction(null); setBusy(false); setError(null);
    setCategoryId(''); setClassId(''); setConfirmText('');
    setResetResult(null); setDeleteResult(null);
  }

  // For actions that finish immediately: refresh the list, close, drop selection.
  function finishAndClear() { onRefetch(); close(); onClearSelection(); }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (err) { setError((err as ApiError).message ?? 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  const applyCategory = () => run(async () => {
    await staffApi.post('/school/students/bulk-category', { studentIds: ids, studentCategoryId: categoryId });
    finishAndClear();
  });

  const applyClass = () => run(async () => {
    if (!classId) { setError('Choose a class.'); return; }
    await staffApi.post('/school/students/bulk-assign-class', { studentIds: ids, classId });
    finishAndClear();
  });

  const applyStatus = (status: 'ACTIVE' | 'ARCHIVED') => run(async () => {
    await staffApi.post('/school/students/bulk-status', { studentIds: ids, status });
    finishAndClear();
  });

  const applyReset = () => run(async () => {
    const res = await staffApi.post<{ credentials: typeof resetResult }>('/school/students/bulk-reset-password', { studentIds: ids });
    setResetResult(res.credentials);
  });

  const applyDelete = () => run(async () => {
    const res = await staffApi.post<{ deleted: number; skipped: { studentId: string; name: string; reason: string }[] }>('/school/students/bulk-delete', { studentIds: ids });
    setDeleteResult(res);
    onRefetch(); // deleted rows drop out of the list immediately
  });

  function exportCsv() {
    downloadCsv(
      'students',
      ['Student ID', 'First Name', 'Last Name', 'Class', 'Fee Category', 'Date of Birth', 'Guardian', 'Guardian Phone'],
      selected.map(s => [
        s.studentId, s.firstName, s.lastName,
        s.classAssignments[0]?.class.name ?? '',
        s.studentCategory?.name ?? '',
        s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : '',
        s.guardians[0]?.name ?? '',
        s.guardians[0]?.phone ?? '',
      ]),
    );
  }

  function downloadResetCsv() {
    if (!resetResult) return;
    downloadCsv(
      'portal-login-details',
      ['Student ID', 'First Name', 'Last Name', 'Temporary Password'],
      resetResult.map(c => [c.studentId, c.firstName, c.lastName, c.tempPassword]),
    );
  }

  const modalTitle: Record<Action, string> = {
    category: 'Set fee category',
    class: 'Assign to class',
    reset: 'Reset portal passwords',
    archive: 'Archive students',
    restore: 'Restore students',
    delete: 'Delete students permanently',
  };

  return (
    <>
      <div
        className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl border flex-wrap"
        style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-tint, #f0fdf4)' }}
      >
        <span className="text-sm font-medium text-slate-700">{count} selected</span>
        <span className="text-slate-300">·</span>

        <BarButton onClick={() => setAction('category')}>Set category</BarButton>
        <BarButton onClick={() => setAction('class')}>Assign class</BarButton>
        <BarButton onClick={() => setAction('reset')}>Reset passwords</BarButton>
        <BarButton onClick={exportCsv}>Export CSV</BarButton>
        {statusFilter === 'archived'
          ? <BarButton onClick={() => setAction('restore')}>Restore</BarButton>
          : <BarButton onClick={() => setAction('archive')}>Archive</BarButton>}
        {isOwner && (
          <button
            onClick={() => setAction('delete')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 border border-red-200 bg-white hover:bg-red-50 transition"
          >
            Delete
          </button>
        )}

        <button onClick={onClearSelection} className="text-sm text-slate-400 hover:text-slate-700 transition ml-auto">
          Clear selection
        </button>
      </div>

      <Modal open={action !== null} onClose={close} title={action ? modalTitle[action] : ''} width="max-w-md">
        {error && (
          <div className="mb-4 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* ── Set category ── */}
        {action === 'category' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Apply a fee category to the {count} selected student{count !== 1 ? 's' : ''}.</p>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls}>
              <option value="">— Remove category —</option>
              {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Actions busy={busy} onCancel={close} onConfirm={applyCategory} confirmLabel="Apply" />
          </div>
        )}

        {/* ── Assign class ── */}
        {action === 'class' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Assign the {count} selected student{count !== 1 ? 's' : ''} to a class for the active year.</p>
            <select value={classId} onChange={e => setClassId(e.target.value)} className={selectCls}>
              <option value="">Choose a class…</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Actions busy={busy} onCancel={close} onConfirm={applyClass} confirmLabel="Assign" />
          </div>
        )}

        {/* ── Archive / restore ── */}
        {action === 'archive' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Archive {count} student{count !== 1 ? 's' : ''}? They’ll be hidden from active rosters, attendance and fee
              generation, but all their records are kept. You can restore them later.
            </p>
            <Actions busy={busy} onCancel={close} onConfirm={() => applyStatus('ARCHIVED')} confirmLabel="Archive" />
          </div>
        )}
        {action === 'restore' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Restore {count} student{count !== 1 ? 's' : ''} to active?</p>
            <Actions busy={busy} onCancel={close} onConfirm={() => applyStatus('ACTIVE')} confirmLabel="Restore" />
          </div>
        )}

        {/* ── Reset passwords ── */}
        {action === 'reset' && !resetResult && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Generate new temporary portal passwords for {count} student{count !== 1 ? 's' : ''}? You’ll get a downloadable
              list — the new passwords are only shown once.
            </p>
            <Actions busy={busy} onCancel={close} onConfirm={applyReset} confirmLabel="Reset passwords" />
          </div>
        )}
        {action === 'reset' && resetResult && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-amber-800 mb-1">{resetResult.length} password{resetResult.length !== 1 ? 's' : ''} reset</p>
              <p className="text-xs text-amber-700 mb-2">Download the list now — these passwords aren’t shown again.</p>
              <button onClick={downloadResetCsv} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: 'var(--accent)' }}>
                Download login details (CSV)
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={finishAndClear} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--accent)' }}>Done</button>
            </div>
          </div>
        )}

        {/* ── Delete ── */}
        {action === 'delete' && !deleteResult && (
          <div className="space-y-4">
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              This permanently deletes student records and cannot be undone. Students with any fees, grades, attendance or
              report cards are <span className="font-semibold">skipped</span> — archive those instead.
            </div>
            <p className="text-sm text-slate-600">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm deleting {count} selected student{count !== 1 ? 's' : ''}.
            </p>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className={selectCls}
            />
            <div className="flex justify-end gap-3">
              <button onClick={close} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button
                onClick={applyDelete}
                disabled={busy || confirmText !== 'DELETE'}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition"
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        )}
        {action === 'delete' && deleteResult && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-800">
              {deleteResult.deleted} student{deleteResult.deleted !== 1 ? 's' : ''} deleted
              {deleteResult.skipped.length > 0 && `, ${deleteResult.skipped.length} skipped`}
            </p>
            {deleteResult.skipped.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {deleteResult.skipped.map(s => (
                      <tr key={s.studentId} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{s.name}</td>
                        <td className="px-3 py-2 text-amber-600 text-xs">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={finishAndClear} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: 'var(--accent)' }}>Done</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const selectCls = 'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none focus:border-slate-400';

function BarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition">
      {children}
    </button>
  );
}

function Actions({ busy, onCancel, onConfirm, confirmLabel }: { busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel: string }) {
  return (
    <div className="flex justify-end gap-3">
      <button onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancel</button>
      <button onClick={onConfirm} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition" style={{ backgroundColor: 'var(--accent)' }}>
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
}
