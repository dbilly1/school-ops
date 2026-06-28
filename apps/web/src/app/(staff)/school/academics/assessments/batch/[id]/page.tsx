'use client';

import { useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type BatchSubject = {
  id: string;          // assessment id
  title: string;
  totalScore: number;
  subject: { id: string; name: string };
  scored: number;      // students with a score recorded
};

type Batch = {
  id: string;
  title: string;
  category: string;
  assessmentDate: string | null;
  class: { id: string; name: string };
  term: { id: string; name: string };
  studentCount: number;
  assessments: BatchSubject[];
};

const CATEGORY_LABEL: Record<string, string> = {
  CLASS_EXERCISE: 'Class Exercise', CLASS_TEST: 'Class Test', GROUP_WORK: 'Group Work',
  PROJECT: 'Project Work', HOMEWORK: 'Homework', MID_TERM: 'Mid-Term', END_OF_TERM_EXAM: 'End-of-Term Exam',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const fetchBatch = useCallback(() => staffApi.get<Batch>(`/school/assessments/batches/${id}`), [id]);
  const { data: batch, loading, refetch } = useApi(fetchBatch);

  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Per-subject delete (drops one subject from the exam; removes the batch if it
  // was the last subject).
  const [confirmId, setConfirmId]   = useState<string | null>(null);
  const [rowDeleting, setRowDeleting] = useState<string | null>(null);

  async function deleteSubject(assessmentId: string) {
    setRowDeleting(assessmentId); setAlert(null);
    try {
      const res = await staffApi.delete<{ batchDeleted: boolean }>(`/school/assessments/${assessmentId}`);
      if (res.batchDeleted) { router.push('/school/academics/assessments'); return; }
      setConfirmId(null);
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to delete subject.' });
    } finally {
      setRowDeleting(null);
    }
  }

  async function deleteBatch() {
    setDeleting(true); setAlert(null);
    try {
      await staffApi.delete(`/school/assessments/batches/${id}`);
      router.push('/school/academics/assessments');
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to delete batch.' });
      setDeleting(false);
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
      <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );

  if (!batch) return <p className="text-sm text-slate-400">Batch not found.</p>;

  const total   = batch.assessments.length;
  const scored  = batch.assessments.filter(a => a.scored > 0).length;
  const allDone = total > 0 && scored === total;

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push('/school/academics/assessments')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to assessments
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{batch.class.name} — {batch.title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {CATEGORY_LABEL[batch.category] ?? batch.category}
            {` · ${batch.term.name}`}
            {` · ${batch.studentCount} student${batch.studentCount === 1 ? '' : 's'}`}
            {batch.assessmentDate && ` · ${new Date(batch.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${allDone ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          {scored}/{total} subjects scored
        </span>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Subjects */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Marks</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {batch.assessments.map(a => (
              <tr
                key={a.id}
                className="border-b border-slate-50 hover:bg-slate-50/60 transition cursor-pointer"
                onClick={() => router.push(`/school/academics/assessments/${a.id}`)}
              >
                <td className="px-4 py-3.5">
                  <span className="text-sm font-medium text-slate-800">{a.subject.name}</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="text-sm font-medium text-slate-700">{a.totalScore}</span>
                </td>
                <td className="px-4 py-3.5">
                  {a.scored > 0 ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                      {a.scored} scored
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                      Awaiting scores
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  {confirmId === a.id ? (
                    <span className="inline-flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-slate-500">
                        {a.scored > 0 ? `Delete + ${a.scored} score${a.scored === 1 ? '' : 's'}?` : 'Delete?'}
                      </span>
                      <button onClick={() => setConfirmId(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button>
                      <button onClick={() => deleteSubject(a.id)} disabled={rowDeleting === a.id}
                        className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-60">
                        {rowDeleting === a.id ? '…' : 'Delete'}
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-3">
                      <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Enter scores →</span>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmId(a.id); }}
                        className="text-slate-300 hover:text-red-500 transition"
                        title="Delete subject"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {batch.assessments.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">No subjects in this batch.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete */}
      <div className="mt-6 flex justify-end">
        {confirming ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Delete this batch and all its scores?</span>
            <button onClick={() => setConfirming(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</button>
            <button onClick={deleteBatch} disabled={deleting}
              className="px-3.5 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-60">
              {deleting ? 'Deleting…' : 'Delete batch'}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-sm font-medium text-red-500 hover:text-red-600">
            Delete batch
          </button>
        )}
      </div>
    </div>
  );
}
