'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';
import { ClassTabs } from '@/components/ui/class-tabs';

// ── Types ─────────────────────────────────────────────────────────────────────

type Assessment = {
  id: string;
  title: string;
  totalScore: number;
  weight: number | null;
  category: string;
  assessmentDate: string | null;
  batchId: string | null;
  subject: { id: string; name: string };
  class: { id: string; name: string } | null;
  term: { id: string; name: string };
  _count: { scores: number };
};

type Batch = {
  id: string;
  title: string;
  category: string;
  assessmentDate: string | null;
  class: { id: string; name: string };
  term: { id: string; name: string };
  subjectCount: number;
  subjectsScored: number;
};

type Subject = { id: string; name: string };
type ClassRow = { id: string; name: string };
type Term    = { id: string; name: string; isActive: boolean };

// Assessment categories (mirror of the API enum). Everything except the
// end-of-term exam rolls up into the class score (SBA) on report cards.
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'CLASS_EXERCISE',   label: 'Class Exercise' },
  { value: 'CLASS_TEST',       label: 'Class Test' },
  { value: 'GROUP_WORK',       label: 'Group Work' },
  { value: 'PROJECT',          label: 'Project Work' },
  { value: 'HOMEWORK',         label: 'Homework' },
  { value: 'MID_TERM',         label: 'Mid-Term' },
  { value: 'END_OF_TERM_EXAM', label: 'End-of-Term Exam' },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

// ── New assessment modal ──────────────────────────────────────────────────────

function NewAssessmentModal({ open, onClose, subjects, classes, terms, onCreated, assignedSubjectIds, assignedClassIds }: {
  open: boolean; onClose: () => void;
  subjects: Subject[]; classes: ClassRow[]; terms: Term[]; onCreated: () => void;
  assignedSubjectIds: string[] | null; // null = no restriction
  assignedClassIds: string[] | null;   // null = no restriction
}) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [form, setForm] = useState({
    title: '', subjectId: '', classId: '', termId: '', category: 'CLASS_TEST',
    totalScore: '100', weight: '', assessmentDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const activeTerm    = terms.find(t => t.isActive);
  const visibleSubjects = assignedSubjectIds
    ? subjects.filter(s => assignedSubjectIds.includes(s.id))
    : subjects;
  const visibleClasses = assignedClassIds
    ? classes.filter(c => assignedClassIds.includes(c.id))
    : classes;

  // ── Batch state: which classes, and a per-subject {selected, marks} map ───────
  const [batchClassIds, setBatchClassIds]   = useState<string[]>([]);
  const [batchSubjects, setBatchSubjects]   = useState<Record<string, { selected: boolean; totalScore: string }>>({});

  // Seed the batch selections (all classes + all subjects, /100) on first open or
  // when switching into batch mode.
  function seedBatch() {
    setBatchClassIds(visibleClasses.map(c => c.id));
    setBatchSubjects(Object.fromEntries(visibleSubjects.map(s => [s.id, { selected: true, totalScore: '100' }])));
  }

  function switchMode(next: 'single' | 'batch') {
    setError(null);
    if (next === 'batch') seedBatch();
    setMode(next);
  }

  function resetAndClose() {
    setForm({ title:'', subjectId:'', classId:'', termId:'', category:'CLASS_TEST', totalScore:'100', weight:'', assessmentDate:'' });
    setMode('single'); setError(null);
    onClose();
  }

  async function create() {
    // The term select defaults to the active term for display; fall back to it
    // here so an unchanged dropdown still submits a term.
    const termId = form.termId || activeTerm?.id || '';
    if (!form.title || !form.subjectId || !form.classId || !termId) {
      setError('Title, subject, class, and term are required.'); return;
    }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/assessments', {
        title:          form.title,
        subjectId:      form.subjectId,
        classId:        form.classId,
        category:       form.category,
        termId,
        totalScore:     parseFloat(form.totalScore),
        weight:         form.weight ? parseFloat(form.weight) : null,
        assessmentDate: form.assessmentDate || null,
      });
      resetAndClose();
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create assessment.');
    } finally {
      setSaving(false);
    }
  }

  async function createBatch() {
    const termId = form.termId || activeTerm?.id || '';
    const chosenSubjects = visibleSubjects
      .filter(s => batchSubjects[s.id]?.selected)
      .map(s => ({ subjectId: s.id, totalScore: parseFloat(batchSubjects[s.id].totalScore || '0') }));

    if (!form.title || !termId)        { setError('Title and term are required.'); return; }
    if (batchClassIds.length === 0)    { setError('Select at least one class.'); return; }
    if (chosenSubjects.length === 0)   { setError('Select at least one subject.'); return; }
    if (chosenSubjects.some(s => !s.totalScore || s.totalScore < 1)) {
      setError('Every selected subject needs total marks of at least 1.'); return;
    }

    setError(null); setSaving(true);
    try {
      const res = await staffApi.post<{ created: number; skipped: { notOnGradeLevel: number; duplicate: number; forbidden: number; unknownSubject: number } }>(
        '/school/assessments/batch',
        {
          title:          form.title,
          category:       form.category,
          termId,
          assessmentDate: form.assessmentDate || null,
          classIds:       batchClassIds,
          subjects:       chosenSubjects,
        },
      );
      const s = res.skipped;
      const skippedTotal = s.notOnGradeLevel + s.duplicate + s.forbidden + s.unknownSubject;
      if (res.created === 0) {
        setError(
          skippedTotal > 0
            ? `Nothing created — ${s.duplicate} already existed, ${s.notOnGradeLevel} not offered by the selected classes.`
            : 'Nothing created. Check your selections.',
        );
        return;
      }
      resetAndClose();
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create assessments.');
    } finally {
      setSaving(false);
    }
  }

  const selectedSubjectCount = visibleSubjects.filter(s => batchSubjects[s.id]?.selected).length;
  const batchPreviewCount    = batchClassIds.length * selectedSubjectCount;

  return (
    <Modal open={open} onClose={resetAndClose} title="New assessment">
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          {(['single', 'batch'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {m === 'single' ? 'Single' : 'Batch (all subjects)'}
            </button>
          ))}
        </div>

        {error && <Alert type="error" message={error} />}

        <FormField label="Title" required>
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={mode === 'batch' ? 'e.g. End of Term Exam, Mid-Term' : 'e.g. Mid-term Test, Class Quiz 1'} />
        </FormField>

        {mode === 'single' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Subject" required>
                <select value={form.subjectId} onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                  <option value="">Select subject…</option>
                  {visibleSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </FormField>

              <FormField label="Class" required>
                <select value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                  <option value="">Select class…</option>
                  {visibleClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>

              <FormField label="Category" required hint="Determines whether it counts as class score or exam">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Category" required hint="Usually End-of-Term Exam or Mid-Term">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormField>
              <FormField label="Term" required>
                <select value={form.termId || activeTerm?.id || ''} onChange={e => setForm(f => ({ ...f, termId: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                  <option value="">Select term…</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>)}
                </select>
              </FormField>
              <FormField label="Date">
                <Input type="date" value={form.assessmentDate}
                  onChange={e => setForm(f => ({ ...f, assessmentDate: e.target.value }))} />
              </FormField>
            </div>

            {/* Classes */}
            <FormField label="Classes" required hint="The exam is created for each selected class">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">{batchClassIds.length} of {visibleClasses.length} selected</span>
                <div className="flex gap-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  <button type="button" onClick={() => setBatchClassIds(visibleClasses.map(c => c.id))}>Select all</button>
                  <button type="button" className="text-slate-400" onClick={() => setBatchClassIds([])}>Clear</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleClasses.map(c => {
                  const on = batchClassIds.includes(c.id);
                  return (
                    <button key={c.id} type="button"
                      onClick={() => setBatchClassIds(ids => on ? ids.filter(x => x !== c.id) : [...ids, c.id])}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition ${on ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}`}
                      style={on ? { backgroundColor: 'var(--accent)' } : undefined}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </FormField>

            {/* Subjects with per-subject marks */}
            <FormField label="Subjects & marks" required hint="Subjects not offered by a class are skipped automatically">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">{selectedSubjectCount} of {visibleSubjects.length} selected</span>
                <div className="flex gap-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  <button type="button" onClick={() => setBatchSubjects(prev => Object.fromEntries(visibleSubjects.map(s => [s.id, { selected: true, totalScore: prev[s.id]?.totalScore || '100' }])))}>Select all</button>
                  <button type="button" className="text-slate-400" onClick={() => setBatchSubjects(prev => Object.fromEntries(visibleSubjects.map(s => [s.id, { selected: false, totalScore: prev[s.id]?.totalScore || '100' }])))}>Clear</button>
                </div>
              </div>
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-64 overflow-y-auto scrollbar-slim">
                {visibleSubjects.map(s => {
                  const st = batchSubjects[s.id] ?? { selected: false, totalScore: '100' };
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input type="checkbox" checked={st.selected}
                          onChange={e => setBatchSubjects(prev => ({ ...prev, [s.id]: { ...st, selected: e.target.checked } }))} />
                        <span className="text-sm text-slate-700">{s.name}</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">/ marks</span>
                        <input type="number" min="1" value={st.totalScore} disabled={!st.selected}
                          onChange={e => setBatchSubjects(prev => ({ ...prev, [s.id]: { ...st, totalScore: e.target.value } }))}
                          className="w-20 px-2 py-1 text-sm bg-white border border-slate-200 rounded-md text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </FormField>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                {batchPreviewCount > 0 ? `Up to ${batchPreviewCount} assessment${batchPreviewCount === 1 ? '' : 's'} will be created` : 'Select classes and subjects'}
              </span>
              <SaveButton loading={saving} onClick={createBatch} label="Create assessments" />
            </div>
          </>
        )}
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
  const [classFilter, setClassFilter]     = useState('');

  const fetchAssessments = useCallback(() => {
    const params = new URLSearchParams();
    if (termFilter)    params.set('termId',    termFilter);
    if (subjectFilter) params.set('subjectId', subjectFilter);
    if (classFilter)   params.set('classId',   classFilter);
    return staffApi.get<Assessment[]>(`/school/assessments?${params}`);
  }, [termFilter, subjectFilter, classFilter]);

  const fetchBatches = useCallback(() => {
    const params = new URLSearchParams();
    if (termFilter)  params.set('termId',  termFilter);
    if (classFilter) params.set('classId', classFilter);
    return staffApi.get<Batch[]>(`/school/assessments/batches?${params}`);
  }, [termFilter, classFilter]);

  const fetchSubjects = useCallback(() => staffApi.get<Subject[]>('/school/subjects'), []);
  const fetchClasses  = useCallback(() => staffApi.get<ClassRow[]>('/school/grade-structure/classes'), []);
  const fetchTerms    = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active')
      .then(year => year?.terms ?? []).catch(() => []),
    [],
  );

  // Key on the filters so the list re-queries when any of them changes.
  const { data: assessments, loading, refetch } = useApi(fetchAssessments, `${termFilter}|${subjectFilter}|${classFilter}`);
  const { data: batches, refetch: refetchBatches } = useApi(fetchBatches, `b|${termFilter}|${classFilter}`);
  const { data: subjects } = useApi(fetchSubjects);
  const { data: classes }  = useApi(fetchClasses);
  const { data: terms }    = useApi(fetchTerms);

  const refetchAll = useCallback(() => { refetch(); refetchBatches(); }, [refetch, refetchBatches]);

  // Default the term filter to the active term once terms load — but only once,
  // so a later switch to "All terms" (or another term) isn't overridden.
  const termDefaultApplied = useRef(false);
  useEffect(() => {
    if (termDefaultApplied.current || !terms?.length) return;
    const active = (terms as Term[]).find(t => t.isActive);
    if (active) setTermFilter(active.id);
    termDefaultApplied.current = true;
  }, [terms]);

  // For restricted teachers: show subjects they may record for — subject-teacher
  // subjects plus every subject of their class-teacher classes.
  const visibleSubjects = scope.restricted
    ? (subjects ?? []).filter(s => scope.recordableSubjectIds.includes(s.id))
    : (subjects ?? []);

  // Class tabs — scoped to a teacher's assigned classes when restricted.
  const visibleClasses = scope.restricted
    ? (classes ?? []).filter(c => scope.assignedClassIds.includes(c.id))
    : (classes ?? []);

  // For restricted teachers: further filter the list to those recordable subjects
  const visibleAssessments = scope.restricted
    ? (assessments ?? []).filter(a => scope.recordableSubjectIds.includes(a.subject.id))
    : (assessments ?? []);

  // Batched assessments are shown as their batch row instead of individually — the
  // table below only lists standalone (non-batch) assessments.
  const standalone   = visibleAssessments.filter(a => !a.batchId);
  const visibleBatches = batches ?? []; // already class-scoped + filtered server-side

  // Summary figures
  const totalScores = visibleAssessments.reduce((sum, a) => sum + a._count.scores, 0);
  const awaitingCount = visibleAssessments.filter(a => a._count.scores === 0).length;

  // Group by term — active term first, then by first appearance. Each group holds
  // both exam batches and standalone assessments for that term.
  const activeTermId = (terms ?? []).find((t: Term) => t.isActive)?.id;
  const termGroups: { termId: string; termName: string; batches: Batch[]; items: Assessment[] }[] = [];
  const groupFor = (termId: string, termName: string) => {
    let g = termGroups.find(x => x.termId === termId);
    if (!g) { g = { termId, termName, batches: [], items: [] }; termGroups.push(g); }
    return g;
  };
  for (const b of visibleBatches) groupFor(b.term.id, b.term.name).batches.push(b);
  for (const a of standalone)     groupFor(a.term.id, a.term.name).items.push(a);
  termGroups.sort((x, y) =>
    (y.termId === activeTermId ? 1 : 0) - (x.termId === activeTermId ? 1 : 0));

  const isEmpty = standalone.length === 0 && visibleBatches.length === 0;

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

      {/* Class tabs */}
      <ClassTabs
        classes={visibleClasses}
        value={classFilter}
        onChange={setClassFilter}
        includeAll
        allLabel={scope.restricted ? 'All my classes' : 'All Classes'}
      />

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
      {!loading && isEmpty && (
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
            <span className="text-xs text-slate-400">· {group.batches.length + group.items.length}</span>
          </div>

          {/* Exam batches — one row per class, opens its own page */}
          {group.batches.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-3">
              {group.batches.map(b => {
                const done = b.subjectCount > 0 && b.subjectsScored === b.subjectCount;
                return (
                  <button
                    key={b.id}
                    onClick={() => router.push(`/school/academics/assessments/batch/${b.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition text-left"
                  >
                    <span className="text-base">📋</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {b.class.name} — {b.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {CATEGORY_LABEL[b.category] ?? b.category} · {b.subjectCount} subject{b.subjectCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {b.subjectsScored}/{b.subjectCount} scored
                    </span>
                    <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Open →</span>
                  </button>
                );
              })}
            </div>
          )}

          {group.items.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden sm:table-cell">Class</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Category</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Marks</th>
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
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className="text-sm text-slate-600">{a.class?.name ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {CATEGORY_LABEL[a.category] ?? a.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-medium text-slate-700">{a.totalScore}</span>
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
          )}
        </div>
      ))}

      <NewAssessmentModal
        open={showNew} onClose={() => setShowNew(false)}
        subjects={subjects ?? []} classes={classes ?? []} terms={terms ?? []} onCreated={refetchAll}
        assignedSubjectIds={scope.restricted ? scope.recordableSubjectIds : null}
        assignedClassIds={scope.restricted ? scope.assignedClassIds : null}
      />
    </div>
  );
}
