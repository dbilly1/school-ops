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

        <div className="grid grid-cols-2 gap-3">
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

        <div className="grid grid-cols-3 gap-3">
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

      {/* Filters */}
      <div className="flex gap-3 mb-5">
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Term</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Marks</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Weight</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Scores</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:5}).map((_,i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={8} className="px-4 py-3.5"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && visibleAssessments.map(a => (
              <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                <td className="px-4 py-3.5">
                  <p className="text-sm font-medium text-slate-800">{a.title}</p>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-sm text-slate-600">{a.subject.name}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-xs text-slate-500">{a.term.name}</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="text-sm font-medium text-slate-700">{a.totalScore}</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="text-sm text-slate-500">{a.weight ? `${a.weight}%` : '—'}</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className={`text-sm font-medium ${a._count.scores > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                    {a._count.scores}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-xs text-slate-400">
                    {a.assessmentDate
                      ? new Date(a.assessmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : '—'}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => router.push(`/school/academics/assessments/${a.id}`)}
                    className="text-xs font-medium transition"
                    style={{ color: 'var(--accent)' }}
                  >
                    Enter scores →
                  </button>
                </td>
              </tr>
            ))}
            {!loading && visibleAssessments.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">No assessments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <NewAssessmentModal
        open={showNew} onClose={() => setShowNew(false)}
        subjects={subjects ?? []} terms={terms ?? []} onCreated={refetch}
        assignedSubjectIds={scope.restricted ? scope.assignedSubjectIds : null}
      />
    </div>
  );
}
