'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type Assessment = {
  id: string;
  title: string;
  totalScore: number;
  weight: number | null;
  assessmentDate: string | null;
  subject: { id: string; name: string };
  term: { id: string; name: string };
  _count: { scores: number };
};

type Subject = { id: string; name: string };
type Term    = { id: string; name: string; isActive: boolean };

// ── New assessment modal ──────────────────────────────────────────────────────

function NewAssessmentModal({ open, onClose, subjects, terms, onCreated, assignedSubjectIds }: {
  open: boolean; onClose: () => void;
  subjects: Subject[]; terms: Term[]; onCreated: () => void;
  assignedSubjectIds: string[] | null; // null = no restriction
}) {
  const [form, setForm] = useState({
    title: '', subjectId: '', termId: '',
    totalScore: '100', weight: '', assessmentDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const activeTerm    = terms.find(t => t.isActive);
  const visibleSubjects = assignedSubjectIds
    ? subjects.filter(s => assignedSubjectIds.includes(s.id))
    : subjects;

  async function create() {
    if (!form.title || !form.subjectId || !form.termId) {
      setError('Title, subject, and term are required.'); return;
    }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/assessments', {
        title:          form.title,
        subjectId:      form.subjectId,
        termId:         form.termId,
        totalScore:     parseFloat(form.totalScore),
        weight:         form.weight ? parseFloat(form.weight) : null,
        assessmentDate: form.assessmentDate || null,
      });
      setForm({ title:'', subjectId:'', termId:'', totalScore:'100', weight:'', assessmentDate:'' });
      onCreated(); onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create assessment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New assessment">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <FormField label="Title" required>
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mid-term Test, Class Quiz 1" />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Subject" required>
            <select value={form.subjectId} onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Select subject…</option>
              {visibleSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>

          <FormField label="Term" required>
            <select value={form.termId || activeTerm?.id || ''} onChange={e => setForm(f => ({ ...f, termId: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Select term…</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Total marks" required>
            <Input type="number" value={form.totalScore} min="1"
              onChange={e => setForm(f => ({ ...f, totalScore: e.target.value }))} />
          </FormField>
          <FormField label="Weight (%)" hint="Optional">
            <Input type="number" value={form.weight} min="0" max="100"
              onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="e.g. 30" />
          </FormField>
          <FormField label="Date">
            <Input type="date" value={form.assessmentDate}
              onChange={e => setForm(f => ({ ...f, assessmentDate: e.target.value }))} />
          </FormField>
        </div>

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={create} label="Create assessment" />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssessmentsPage() {
  const router = useRouter();
  const scope  = useTeacherScope();

  const [showNew, setShowNew]             = useState(false);
  const [termFilter, setTermFilter]       = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  const fetchAssessments = useCallback(() => {
    const params = new URLSearchParams();
    if (termFilter)    params.set('termId',    termFilter);
    if (subjectFilter) params.set('subjectId', subjectFilter);
    return staffApi.get<Assessment[]>(`/school/assessments?${params}`);
  }, [termFilter, subjectFilter]);

  const fetchSubjects = useCallback(() => staffApi.get<Subject[]>('/school/subjects'), []);
  const fetchTerms    = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active')
      .then(year => year?.terms ?? []).catch(() => []),
    [],
  );

  const { data: assessments, loading, refetch } = useApi(fetchAssessments);
  const { data: subjects } = useApi(fetchSubjects);
  const { data: terms }    = useApi(fetchTerms);

  // For restricted teachers: only show subjects they are assigned to teach
  const visibleSubjects = scope.restricted
    ? (subjects ?? []).filter(s => scope.assignedSubjectIds.includes(s.id))
    : (subjects ?? []);

  // For restricted teachers: further filter the list to their assigned subjects
  const visibleAssessments = scope.restricted
    ? (assessments ?? []).filter(a => scope.assignedSubjectIds.includes(a.subject.id))
    : (assessments ?? []);

  // Summary figures
  const totalScores = visibleAssessments.reduce((sum, a) => sum + a._count.scores, 0);
  const awaitingCount = visibleAssessments.filter(a => a._count.scores === 0).length;

  // Group by term — active term first, then by first appearance
  const activeTermId = (terms ?? []).find((t: Term) => t.isActive)?.id;
  const termGroups: { termId: string; termName: string; items: Assessment[] }[] = [];
  for (const a of visibleAssessments) {
    let g = termGroups.find(x => x.termId === a.term.id);
    if (!g) { g = { termId: a.term.id, termName: a.term.name, items: [] }; termGroups.push(g); }
    g.items.push(a);
  }
  termGroups.sort((x, y) =>
    (y.termId === activeTermId ? 1 : 0) - (x.termId === activeTermId ? 1 : 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Assessments</h2>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
        >
          + New assessment
        </button>
      </div>

      {/* Summary */}
      {!loading && visibleAssessments.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Assessments</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{visibleAssessments.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Scores recorded</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{totalScores}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Awaiting scores</p>
            <p className={`mt-1 text-xl font-bold ${awaitingCount > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{awaitingCount}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={termFilter} onChange={e => setTermFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All terms</option>
          {terms?.map((t: Term) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>)}
        </select>
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">{scope.restricted ? 'All my subjects' : 'All subjects'}</option>
          {visibleSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 border-b border-slate-50 last:border-0">
              <div className="h-7 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleAssessments.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-16 text-center">
          <p className="text-sm text-slate-400">No assessments yet.</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-3 text-sm font-medium underline underline-offset-2"
            style={{ color: 'var(--accent)' }}
          >
            Create your first assessment
          </button>
        </div>
      )}

      {/* Grouped tables — one per term, active term first */}
      {!loading && termGroups.map(group => (
        <div key={group.termId} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-700">{group.termName}</h3>
            {group.termId === activeTermId && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>Active</span>
            )}
            <span className="text-xs text-slate-400">· {group.items.length}</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Marks</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Weight</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(a => (
                    <tr
                      key={a.id}
                      className="border-b border-slate-50 hover:bg-slate-50/60 transition cursor-pointer"
                      onClick={() => router.push(`/school/academics/assessments/${a.id}`)}
                    >
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-slate-800">{a.title}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-slate-600">{a.subject.name}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-medium text-slate-700">{a.totalScore}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center hidden md:table-cell">
                        <span className="text-sm text-slate-500">{a.weight ? `${a.weight}%` : '—'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {a._count.scores > 0 ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                            {a._count.scores} scored
                          </span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            Awaiting scores
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-slate-400">
                          {a.assessmentDate
                            ? new Date(a.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                            : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Enter scores →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      <NewAssessmentModal
        open={showNew} onClose={() => setShowNew(false)}
        subjects={subjects ?? []} terms={terms ?? []} onCreated={refetch}
        assignedSubjectIds={scope.restricted ? scope.assignedSubjectIds : null}
      />
    </div>
  );
}
