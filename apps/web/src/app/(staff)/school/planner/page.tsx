'use client';

import { useState, useCallback, useMemo } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Alert } from '@/components/ui/settings-card';
import { localKey, mondayOf } from '@/lib/date-range';

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'PLANNED' | 'DONE';

type PlannerEntry = {
  id: string;
  date: string;          // ISO; the YYYY-MM-DD prefix is the planned day
  title: string;
  notes: string | null;
  status: Status;
  position: number;
  classId: string | null;
  subjectId: string | null;
  class: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
};

type Option = { id: string; name: string };

// ── Helpers ─────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayKey(d: Date) { return localKey(d); }

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function prettyDay(key: string) {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function shortDay(key: string) {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [view, setView]     = useState<'day' | 'week'>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [editing, setEditing] = useState<PlannerEntry | 'new' | null>(null);
  const [newDayKey, setNewDayKey] = useState<string>('');

  // The visible day keys (1 for day view, Mon–Sun for week view).
  const dayKeys = useMemo(() => {
    if (view === 'day') return [dayKey(anchor)];
    const monday = mondayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));
  }, [view, anchor]);

  const rangeStart = dayKeys[0];
  const rangeEnd   = dayKeys[dayKeys.length - 1];

  const fetchEntries = useCallback(
    () => staffApi.get<PlannerEntry[]>(`/school/planner?start=${rangeStart}&end=${rangeEnd}`).catch(() => []),
    [rangeStart, rangeEnd],
  );
  const { data: entries, loading, refetch } = useApi(fetchEntries, `${rangeStart}|${rangeEnd}`);

  // Optional class/subject tag options (best-effort — empty if the user lacks access).
  const fetchClasses  = useCallback(() => staffApi.get<Option[]>('/school/grade-structure/classes').catch(() => []), []);
  const fetchSubjects = useCallback(() => staffApi.get<Option[]>('/school/subjects').catch(() => []), []);
  const { data: classes }  = useApi(fetchClasses);
  const { data: subjects } = useApi(fetchSubjects);

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerEntry[]>();
    for (const k of dayKeys) map.set(k, []);
    for (const e of entries ?? []) {
      const k = e.date.slice(0, 10);
      if (map.has(k)) map.get(k)!.push(e);
    }
    return map;
  }, [entries, dayKeys]);

  const todayKey = dayKey(new Date());

  // ── Mutations ──
  async function toggle(entry: PlannerEntry) {
    const next: Status = entry.status === 'DONE' ? 'PLANNED' : 'DONE';
    try {
      await staffApi.patch(`/school/planner/${entry.id}`, { status: next });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not update.' });
    }
  }

  async function quickAdd(key: string, title: string) {
    const t = title.trim();
    if (!t) return;
    try {
      await staffApi.post('/school/planner', { title: t, date: key });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not add entry.' });
    }
  }

  async function remove(entry: PlannerEntry) {
    try {
      await staffApi.delete(`/school/planner/${entry.id}`);
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not delete.' });
    }
  }

  // ── Navigation ──
  function shift(dir: -1 | 1) {
    setAnchor(a => addDays(a, dir * (view === 'day' ? 1 : 7)));
  }

  const rangeLabel = view === 'day'
    ? prettyDay(rangeStart)
    : `${shortDay(rangeStart)} – ${shortDay(rangeEnd)}`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Planner</h2>
          <p className="text-sm text-slate-500 mt-0.5">Plan your day and week and tick things off. Private to you.</p>
        </div>

        {/* View toggle */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['day', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition capitalize ${
                view === v ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={view === v ? { backgroundColor: 'var(--accent)' } : {}}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => shift(-1)} className="w-8 h-8 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition" aria-label="Previous">‹</button>
        <button onClick={() => shift(1)} className="w-8 h-8 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition" aria-label="Next">›</button>
        <button onClick={() => setAnchor(new Date())} className="px-3 h-8 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Today</button>
        <span className="ml-1 text-sm font-medium text-slate-700">{rangeLabel}</span>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
          {dayKeys.map(k => <div key={k} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
        <div className={view === 'day' ? 'max-w-2xl' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3'}>
          {dayKeys.map(key => (
            <DayColumn
              key={key}
              dayKey={key}
              isToday={key === todayKey}
              compact={view === 'week'}
              entries={byDay.get(key) ?? []}
              onToggle={toggle}
              onQuickAdd={quickAdd}
              onEdit={e => setEditing(e)}
              onAddDetailed={() => { setNewDayKey(key); setEditing('new'); }}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {editing && (
        <EntryModal
          entry={editing === 'new' ? null : editing}
          defaultDate={editing === 'new' ? newDayKey : undefined}
          classes={classes ?? []}
          subjects={subjects ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
          onError={m => setAlert({ type: 'error', message: m })}
        />
      )}
    </div>
  );
}

// ── Day column ──────────────────────────────────────────────────────────────

function DayColumn({
  dayKey: key, isToday, compact, entries, onToggle, onQuickAdd, onEdit, onAddDetailed, onDelete,
}: {
  dayKey: string;
  isToday: boolean;
  compact: boolean;
  entries: PlannerEntry[];
  onToggle: (e: PlannerEntry) => void;
  onQuickAdd: (key: string, title: string) => void;
  onEdit: (e: PlannerEntry) => void;
  onAddDetailed: () => void;
  onDelete: (e: PlannerEntry) => void;
}) {
  const [draft, setDraft] = useState('');
  const d = new Date(`${key}T00:00:00`);
  const doneCount = entries.filter(e => e.status === 'DONE').length;

  function submitQuick() {
    if (!draft.trim()) return;
    onQuickAdd(key, draft);
    setDraft('');
  }

  return (
    <div className={`bg-white rounded-xl border ${isToday ? 'border-[color:var(--accent)]' : 'border-slate-100'} shadow-sm flex flex-col`}>
      {/* Day header */}
      <div className="px-3 py-2.5 border-b border-slate-50 flex items-center justify-between">
        <div>
          <p className={`text-xs font-semibold ${isToday ? 'text-[color:var(--accent)]' : 'text-slate-500'}`}>
            {compact ? DOW[(d.getDay() + 6) % 7] : prettyDay(key)}
          </p>
          {compact && <p className="text-[11px] text-slate-400">{shortDay(key)}</p>}
        </div>
        {entries.length > 0 && (
          <span className="text-[11px] text-slate-400">{doneCount}/{entries.length}</span>
        )}
      </div>

      {/* Entries */}
      <div className="flex-1 p-2 space-y-1.5 min-h-[60px]">
        {entries.map(e => (
          <EntryRow key={e.id} entry={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-slate-300 px-1 py-2">Nothing planned.</p>
        )}
      </div>

      {/* Quick add */}
      <div className="px-2 pb-2 flex items-center gap-1">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitQuick(); }}
          placeholder="Add a task…"
          className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300"
        />
        <button
          onClick={onAddDetailed}
          title="Add with details"
          className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 transition shrink-0"
        >
          ⋯
        </button>
      </div>
    </div>
  );
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry, onToggle, onEdit, onDelete }: {
  entry: PlannerEntry;
  onToggle: (e: PlannerEntry) => void;
  onEdit: (e: PlannerEntry) => void;
  onDelete: (e: PlannerEntry) => void;
}) {
  const done = entry.status === 'DONE';
  return (
    <div className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition">
      <button
        onClick={() => onToggle(entry)}
        className={`mt-0.5 w-4 h-4 shrink-0 rounded border grid place-items-center transition ${
          done ? 'border-transparent text-white' : 'border-slate-300 hover:border-slate-400'
        }`}
        style={done ? { backgroundColor: 'var(--accent)' } : {}}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      >
        {done && <span className="text-[10px] leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(entry)}>
        <p className={`text-sm leading-snug ${done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{entry.title}</p>
        {(entry.class || entry.subject) && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {entry.class && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{entry.class.name}</span>}
            {entry.subject && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{entry.subject.name}</span>}
          </div>
        )}
        {entry.notes && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{entry.notes}</p>}
      </div>

      <button
        onClick={() => onDelete(entry)}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition shrink-0 text-xs"
        aria-label="Delete"
      >
        ✕
      </button>
    </div>
  );
}

// ── Create / edit modal ─────────────────────────────────────────────────────

function EntryModal({ entry, defaultDate, classes, subjects, onClose, onSaved, onError }: {
  entry: PlannerEntry | null;
  defaultDate?: string;
  classes: Option[];
  subjects: Option[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle]   = useState(entry?.title ?? '');
  const [date, setDate]     = useState((entry?.date ?? '').slice(0, 10) || defaultDate || localKey(new Date()));
  const [notes, setNotes]   = useState(entry?.notes ?? '');
  const [classId, setClassId]     = useState(entry?.classId ?? '');
  const [subjectId, setSubjectId] = useState(entry?.subjectId ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { onError('Title is required'); return; }
    setSaving(true);
    try {
      const body = { title: title.trim(), date, notes, classId, subjectId };
      if (entry) await staffApi.patch(`/school/planner/${entry.id}`, body);
      else await staffApi.post('/school/planner', body);
      onSaved();
    } catch (err) {
      onError((err as ApiError).message ?? 'Could not save.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 mb-4">{entry ? 'Edit task' : 'New task'}</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Task</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} autoFocus placeholder="What do you want to accomplish?" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Class <span className="text-slate-300">(optional)</span></label>
              <select value={classId} onChange={e => setClassId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Subject <span className="text-slate-300">(optional)</span></label>
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes <span className="text-slate-300">(optional)</span></label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="Details, goals, what success looks like…" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
