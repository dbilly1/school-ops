'use client';

import { useState, useCallback, useMemo } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { Alert } from '@/components/ui/settings-card';
import { RichTextEditor } from '@/components/rich-text/rich-text-editor';
import { RichTextView } from '@/components/rich-text/rich-text-view';

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';

// School-wide policy for how a note body may be authored.
type FormatPolicy = 'STRUCTURED_ONLY' | 'RICH_ALLOWED' | 'RICH_ONLY';

type Lesson = { day?: string; starter?: string; main?: string; plenary?: string };
// A note's content is either the structured GES template or a free-form rich
// body, discriminated by `format: 'RICH'`.
type Content = {
  format?: 'RICH';
  html?: string;
  strand?: string;
  subStrand?: string;
  contentStandard?: string;
  indicators?: string;
  objectives?: string;
  resources?: string;
  references?: string;
  lessons?: Lesson[];
};

function isRich(c?: Content | null): boolean {
  return !!c && c.format === 'RICH';
}

type Person = { id: string; firstName: string; lastName: string };
type Named = { id: string; name: string };

type Note = {
  id: string;
  authorId: string;
  classId: string;
  subjectId: string;
  termId: string;
  weekEnding: string;
  title: string | null;
  content: Content;
  status: Status;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComments: string | null;
  author: Person;
  reviewer: Person | null;
  class: Named;
  subject: Named;
  term: Named;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Plain-text length of an HTML string — used to tell whether a rich body is
// actually empty (an editor can leave behind <br>/&nbsp; with no real text).
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').replace(/ /g, ' ');
}

// Whether the structured template carries any author-entered text.
function hasStructuredBody(c: Content, lessons: Lesson[]): boolean {
  const headers = [c.strand, c.subStrand, c.contentStandard, c.indicators, c.objectives, c.resources, c.references];
  if (headers.some(v => (v ?? '').trim())) return true;
  return lessons.some(l => [l.day, l.starter, l.main, l.plenary].some(v => (v ?? '').trim()));
}

const STATUS_STYLES: Record<Status, { label: string; cls: string; dot: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'text-slate-500',   dot: 'bg-slate-300'   },
  SUBMITTED: { label: 'Submitted', cls: 'text-blue-600',    dot: 'bg-blue-500'    },
  APPROVED:  { label: 'Approved',  cls: 'text-emerald-700', dot: 'bg-emerald-500' },
  RETURNED:  { label: 'Returned',  cls: 'text-orange-600',  dot: 'bg-orange-400'  },
};

function StatusChip({ status }: { status: Status }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LessonNotesPage() {
  const [tab, setTab] = useState<'mine' | 'review'>('mine');

  // Capability probe — the review summary endpoint is gated by
  // academics:lesson_note_review, so a 200 means the user is a reviewer.
  const fetchSummary = useCallback(
    () => staffApi.get<{ pending: number }>('/school/lesson-notes/review/summary').then(r => r).catch(() => null),
    [],
  );
  const { data: summary } = useApi(fetchSummary);
  const isReviewer = summary !== null && summary !== undefined;

  const fetchPolicy = useCallback(
    () => staffApi.get<{ policy: FormatPolicy }>('/school/lesson-notes/policy').then(r => r.policy).catch(() => 'STRUCTURED_ONLY' as FormatPolicy),
    [],
  );
  const { data: policy } = useApi(fetchPolicy);

  const fetchTerms = useCallback(
    () => staffApi.get<any>('/school/academic-years/active').then(y => (y?.terms ?? []) as Named[]).catch(() => []),
    [],
  );
  const fetchClasses  = useCallback(() => staffApi.get<Named[]>('/school/grade-structure/classes').catch(() => []), []);
  const fetchSubjects = useCallback(() => staffApi.get<Named[]>('/school/subjects').catch(() => []), []);
  const { data: terms }    = useApi(fetchTerms);
  const { data: classes }  = useApi(fetchClasses);
  const { data: subjects } = useApi(fetchSubjects);

  const effectivePolicy: FormatPolicy = policy ?? 'STRUCTURED_ONLY';

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Lesson Notes</h2>
        <p className="text-sm text-slate-500 mt-0.5">Prepare your weekly lesson notes and submit them for review.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>My notes</TabButton>
        {isReviewer && (
          <TabButton active={tab === 'review'} onClick={() => setTab('review')}>
            Review{summary && summary.pending > 0 ? ` (${summary.pending})` : ''}
          </TabButton>
        )}
      </div>

      {tab === 'mine' ? (
        <MyNotesTab terms={terms ?? []} classes={classes ?? []} subjects={subjects ?? []} policy={effectivePolicy} />
      ) : (
        <ReviewTab terms={terms ?? []} classes={classes ?? []} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
        active ? 'border-[color:var(--accent)] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

// ── My notes ────────────────────────────────────────────────────────────────

function MyNotesTab({ terms, classes, subjects, policy }: { terms: Named[]; classes: Named[]; subjects: Named[]; policy: FormatPolicy }) {
  const [termId, setTermId] = useState('');
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [editing, setEditing] = useState<Note | 'new' | null>(null);

  const activeTermId = termId || terms.find((t: any) => t.isActive)?.id || terms[0]?.id || '';

  const fetchNotes = useCallback(
    () => staffApi.get<Note[]>(`/school/lesson-notes/mine${activeTermId ? `?termId=${activeTermId}` : ''}`).catch(() => []),
    [activeTermId],
  );
  const { data: notes, loading, refetch } = useApi(fetchNotes, activeTermId);

  async function action(path: string, okMsg: string) {
    setAlert(null);
    try {
      await staffApi.post(path, {});
      setAlert({ type: 'success', message: okMsg });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Action failed.' });
    }
  }

  async function del(id: string) {
    if (!window.confirm('Delete this lesson note?')) return;
    setAlert(null);
    try {
      await staffApi.delete(`/school/lesson-notes/${id}`);
      setAlert({ type: 'success', message: 'Lesson note deleted.' });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not delete.' });
    }
  }

  if (editing) {
    return (
      <NoteEditor
        note={editing === 'new' ? null : editing}
        termId={activeTermId}
        terms={terms}
        classes={classes}
        subjects={subjects}
        policy={policy}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refetch(); }}
        onError={m => setAlert({ type: 'error', message: m })}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <select value={activeTermId} onChange={e => setTermId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All terms</option>
          {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
        </select>
        <button onClick={() => setEditing('new')}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          + New lesson note
        </button>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-2">
          {notes.map(note => (
            <div key={note.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{note.subject.name}</p>
                  <span className="text-xs text-slate-400">·</span>
                  <p className="text-sm text-slate-600">{note.class.name}</p>
                  <StatusChip status={note.status} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Week ending {fmtDate(note.weekEnding)}{note.title ? ` · ${note.title}` : ''}</p>
                {note.status === 'RETURNED' && note.reviewComments && (
                  <p className="text-xs text-orange-600 mt-1">↩ {note.reviewComments}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(note.status === 'DRAFT' || note.status === 'RETURNED') && (
                  <>
                    <button onClick={() => setEditing(note)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition">Edit</button>
                    <button onClick={() => action(`/school/lesson-notes/${note.id}/submit`, 'Submitted for review.')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition" style={{ backgroundColor: 'var(--accent)' }}>Submit</button>
                    <button onClick={() => del(note.id)} className="px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:text-red-500 transition">✕</button>
                  </>
                )}
                {note.status === 'SUBMITTED' && (
                  <>
                    <button onClick={() => setEditing(note)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition">View</button>
                    <button onClick={() => action(`/school/lesson-notes/${note.id}/withdraw`, 'Withdrawn back to draft.')} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">Withdraw</button>
                  </>
                )}
                {note.status === 'APPROVED' && (
                  <button onClick={() => setEditing(note)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition">View</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
          No lesson notes yet. Click “New lesson note” to create one.
        </div>
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

const EMPTY_LESSON: Lesson = { day: '', starter: '', main: '', plenary: '' };

function NoteEditor({ note, termId, terms, classes, subjects, policy, onClose, onSaved, onError }: {
  note: Note | null;
  termId: string;
  terms: Named[];
  classes: Named[];
  subjects: Named[];
  policy: FormatPolicy;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const readOnly = !!note && (note.status === 'SUBMITTED' || note.status === 'APPROVED');
  const scope = useTeacherScope();

  const [classId, setClassId]     = useState(note?.classId ?? '');
  const [subjectId, setSubjectId] = useState(note?.subjectId ?? '');
  const [noteTermId, setNoteTermId] = useState(note?.termId ?? termId);
  const [weekEnding, setWeekEnding] = useState((note?.weekEnding ?? '').slice(0, 10) || nextFriday());
  const [title, setTitle] = useState(note?.title ?? '');
  const [c, setC] = useState<Content>(note?.content ?? {});
  const [lessons, setLessons] = useState<Lesson[]>(note?.content?.lessons?.length ? note.content.lessons : [{ ...EMPTY_LESSON }]);
  const [saving, setSaving] = useState(false);

  // Authoring mode. Honour an existing note's shape; otherwise fall back to what
  // the school policy dictates. The toggle is only offered under RICH_ALLOWED.
  const initialMode: 'structured' | 'rich' =
    note ? (isRich(note.content) ? 'rich' : 'structured')
         : (policy === 'RICH_ONLY' ? 'rich' : 'structured');
  const [mode, setMode] = useState<'structured' | 'rich'>(initialMode);
  const [richHtml, setRichHtml] = useState<string>(isRich(note?.content) ? (note?.content.html ?? '') : '');
  const canSwitchMode = !readOnly && policy === 'RICH_ALLOWED';

  function switchMode(next: 'structured' | 'rich') {
    if (next === mode) return;
    // Switching discards the other mode's body; warn if there's content to lose.
    const losingRich = mode === 'rich' && richHtml.trim() && stripHtml(richHtml).trim();
    const losingStructured = mode === 'structured' && hasStructuredBody(c, lessons);
    if ((losingRich || losingStructured) && !window.confirm('Switching format will clear what you have written here. Continue?')) return;
    setMode(next);
  }

  // Scope the class/subject pickers to what a restricted teacher actually teaches
  // (class-teacher latitude — backend enforces the same). When editing an existing
  // note the selects are disabled, so we keep the full lists to display the value.
  const restrict = scope.restricted && !note;
  const classOptions = restrict ? classes.filter(c => scope.assignedClassIds.includes(c.id)) : classes;
  const allowedSubjectIds = !restrict
    ? null
    : (classId && scope.isClassTeacherOf(classId) ? scope.recordableSubjectIds : (classId ? scope.subjectsForClass(classId) : scope.recordableSubjectIds));
  const subjectOptions = allowedSubjectIds ? subjects.filter(s => allowedSubjectIds.includes(s.id)) : subjects;

  const field = (k: keyof Content) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setC(prev => ({ ...prev, [k]: e.target.value }));

  function setLesson(i: number, k: keyof Lesson, v: string) {
    setLessons(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }

  async function save(submitAfter: boolean) {
    if (!classId || !subjectId || !noteTermId) { onError('Class, subject and term are required.'); return; }
    const content: Content = mode === 'rich'
      ? { format: 'RICH', html: richHtml }
      : { ...c, lessons };
    setSaving(true);
    try {
      let id = note?.id;
      if (note) {
        await staffApi.patch(`/school/lesson-notes/${note.id}`, { title, weekEnding, content });
      } else {
        const created = await staffApi.post<Note>('/school/lesson-notes', {
          classId, subjectId, termId: noteTermId, weekEnding, title, content,
        });
        id = created.id;
      }
      if (submitAfter && id) await staffApi.post(`/school/lesson-notes/${id}/submit`, {});
      onSaved();
    } catch (err) {
      onError((err as ApiError).message ?? 'Could not save.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-500 mb-1';

  return (
    <div>
      <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-700 transition mb-4 flex items-center gap-1">← Back to lesson notes</button>

      {note && (
        <div className="mb-4 flex items-center gap-2"><StatusChip status={note.status} />
          {note.status === 'RETURNED' && note.reviewComments && (
            <span className="text-xs text-orange-600">↩ {note.reviewComments}</span>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        {/* Header row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Class</label>
            <select value={classId} onChange={e => { setClassId(e.target.value); setSubjectId(''); }} disabled={readOnly || !!note} className={inputCls}>
              <option value="">Select…</option>
              {classOptions.map(c2 => <option key={c2.id} value={c2.id}>{c2.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Subject</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} disabled={readOnly || !!note} className={inputCls}>
              <option value="">Select…</option>
              {subjectOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Term</label>
            <select value={noteTermId} onChange={e => setNoteTermId(e.target.value)} disabled={readOnly || !!note} className={inputCls}>
              <option value="">Select…</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Week ending</label>
            <input type="date" value={weekEnding} onChange={e => setWeekEnding(e.target.value)} disabled={readOnly} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Title <span className="text-slate-300">(optional)</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} disabled={readOnly} className={inputCls} placeholder="e.g. Week 5 — Fractions" />
        </div>

        {/* Format toggle — only when the school lets teachers choose per note */}
        {canSwitchMode && (
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button type="button" onClick={() => switchMode('structured')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${mode === 'structured' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              GES template
            </button>
            <button type="button" onClick={() => switchMode('rich')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${mode === 'rich' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              Rich text
            </button>
          </div>
        )}

        {mode === 'structured' ? (
          <>
            {/* GES header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Strand</label><input value={c.strand ?? ''} onChange={field('strand')} disabled={readOnly} className={inputCls} /></div>
              <div><label className={labelCls}>Sub-strand</label><input value={c.subStrand ?? ''} onChange={field('subStrand')} disabled={readOnly} className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Content standard</label><textarea rows={2} value={c.contentStandard ?? ''} onChange={field('contentStandard')} disabled={readOnly} className={inputCls} /></div>
            <div><label className={labelCls}>Indicators</label><textarea rows={2} value={c.indicators ?? ''} onChange={field('indicators')} disabled={readOnly} className={inputCls} /></div>
            <div><label className={labelCls}>Learning objectives</label><textarea rows={2} value={c.objectives ?? ''} onChange={field('objectives')} disabled={readOnly} className={inputCls} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Teaching-learning resources / core competencies</label><textarea rows={2} value={c.resources ?? ''} onChange={field('resources')} disabled={readOnly} className={inputCls} /></div>
              <div><label className={labelCls}>References</label><textarea rows={2} value={c.references ?? ''} onChange={field('references')} disabled={readOnly} className={inputCls} /></div>
            </div>

            {/* Lessons */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">Lessons</label>
                {!readOnly && (
                  <button onClick={() => setLessons(ls => [...ls, { ...EMPTY_LESSON }])} className="text-xs font-medium text-[color:var(--accent)]">+ Add lesson</button>
                )}
              </div>
              <div className="space-y-3">
                {lessons.map((l, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <input value={l.day ?? ''} onChange={e => setLesson(i, 'day', e.target.value)} disabled={readOnly}
                        placeholder={`Lesson ${i + 1} — day/period`} className="text-sm font-medium bg-transparent outline-none text-slate-700 w-full disabled:text-slate-500" />
                      {!readOnly && lessons.length > 1 && (
                        <button onClick={() => setLessons(ls => ls.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 text-xs shrink-0">✕</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <textarea rows={2} value={l.starter ?? ''} onChange={e => setLesson(i, 'starter', e.target.value)} disabled={readOnly} placeholder="Phase 1 — Starter / introduction" className={inputCls} />
                      <textarea rows={3} value={l.main ?? ''} onChange={e => setLesson(i, 'main', e.target.value)} disabled={readOnly} placeholder="Phase 2 — New learning & assessment" className={inputCls} />
                      <textarea rows={2} value={l.plenary ?? ''} onChange={e => setLesson(i, 'plenary', e.target.value)} disabled={readOnly} placeholder="Phase 3 — Plenary / reflection" className={inputCls} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className={labelCls}>Lesson note</label>
            {readOnly
              ? <RichTextView html={richHtml} />
              : <RichTextEditor initialHtml={richHtml} onChange={setRichHtml} />}
          </div>
        )}

        {!readOnly && (
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button>
            <button onClick={() => save(true)} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50" style={{ backgroundColor: 'var(--accent)' }}>Save & submit</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Review queue ──────────────────────────────────────────────────────────────

function ReviewTab({ terms, classes }: { terms: Named[]; classes: Named[] }) {
  const [status, setStatus]   = useState<Status>('SUBMITTED');
  const [classId, setClassId] = useState('');
  const [termId, setTermId]   = useState('');
  const [open, setOpen]       = useState<Note | null>(null);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ status });
    if (classId) p.set('classId', classId);
    if (termId) p.set('termId', termId);
    return p.toString();
  }, [status, classId, termId]);

  const fetchQueue = useCallback(
    () => staffApi.get<Note[]>(`/school/lesson-notes/review?${qs}`).catch(() => []),
    [qs],
  );
  const { data: notes, loading, refetch } = useApi(fetchQueue, qs);

  if (open) {
    return (
      <ReviewDetail
        note={open}
        onClose={() => setOpen(null)}
        onReviewed={(msg) => { setOpen(null); setAlert({ type: 'success', message: msg }); refetch(); }}
        onError={m => setAlert({ type: 'error', message: m })}
      />
    );
  }

  const selectCls = 'px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={status} onChange={e => setStatus(e.target.value as Status)} className={selectCls}>
          <option value="SUBMITTED">Awaiting review</option>
          <option value="APPROVED">Approved</option>
          <option value="RETURNED">Returned</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select value={termId} onChange={e => setTermId(e.target.value)} className={selectCls}>
          <option value="">All terms</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={classId} onChange={e => setClassId(e.target.value)} className={selectCls}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-2">
          {notes.map(note => (
            <button key={note.id} onClick={() => setOpen(note)}
              className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{note.subject.name}</p>
                  <span className="text-xs text-slate-400">·</span>
                  <p className="text-sm text-slate-600">{note.class.name}</p>
                  <StatusChip status={note.status} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {note.author.firstName} {note.author.lastName} · Week ending {fmtDate(note.weekEnding)}
                </p>
              </div>
              <span className="text-xs font-medium shrink-0" style={{ color: 'var(--accent)' }}>Review →</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
          Nothing here.
        </div>
      )}
    </div>
  );
}

function ReviewDetail({ note, onClose, onReviewed, onError }: {
  note: Note;
  onClose: () => void;
  onReviewed: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const c = note.content ?? {};

  async function decide(decision: 'APPROVED' | 'RETURNED') {
    if (decision === 'RETURNED' && !comments.trim()) { onError('Add a comment so the teacher knows what to revise.'); return; }
    setBusy(true);
    try {
      await staffApi.post(`/school/lesson-notes/${note.id}/review`, { decision, comments });
      onReviewed(decision === 'APPROVED' ? 'Lesson note approved.' : 'Lesson note returned for revision.');
    } catch (err) {
      onError((err as ApiError).message ?? 'Could not submit review.');
      setBusy(false);
    }
  }

  const Row = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{value}</p>
      </div>
    ) : null;

  return (
    <div>
      <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-700 transition mb-4 flex items-center gap-1">← Back to queue</button>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-slate-900">{note.subject.name} · {note.class.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {note.author.firstName} {note.author.lastName} · {note.term.name} · Week ending {fmtDate(note.weekEnding)}
            </p>
          </div>
          <StatusChip status={note.status} />
        </div>

        {note.title && <p className="text-sm font-medium text-slate-700">{note.title}</p>}

        {isRich(c) ? (
          <RichTextView html={c.html} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Row label="Strand" value={c.strand} />
              <Row label="Sub-strand" value={c.subStrand} />
            </div>
            <Row label="Content standard" value={c.contentStandard} />
            <Row label="Indicators" value={c.indicators} />
            <Row label="Objectives" value={c.objectives} />
            <Row label="Resources / core competencies" value={c.resources} />
            <Row label="References" value={c.references} />

            {(c.lessons ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Lessons</p>
                <div className="space-y-3">
                  {(c.lessons ?? []).map((l, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-1.5">
                      <p className="text-sm font-medium text-slate-700">{l.day || `Lesson ${i + 1}`}</p>
                      <Row label="Starter" value={l.starter} />
                      <Row label="Main" value={l.main} />
                      <Row label="Plenary" value={l.plenary} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Review actions — only for submitted notes */}
        {note.status === 'SUBMITTED' ? (
          <div className="border-t border-slate-100 pt-4">
            <label className="block text-xs font-medium text-slate-500 mb-1">Comments {`(required to return)`}</label>
            <textarea rows={2} value={comments} onChange={e => setComments(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300" placeholder="Feedback for the teacher…" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => decide('RETURNED')} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-orange-600 hover:bg-orange-50 transition disabled:opacity-50">Return for revision</button>
              <button onClick={() => decide('APPROVED')} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50" style={{ backgroundColor: 'var(--accent)' }}>Approve</button>
            </div>
          </div>
        ) : (
          note.reviewComments && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Reviewer comments</p>
              <p className="text-sm text-slate-700 mt-0.5">{note.reviewComments}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
