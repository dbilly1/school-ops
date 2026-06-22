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

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Monday-based weekday index (0 = Monday … 6 = Sunday).
function weekIdx(d: Date) { return (d.getDay() + 6) % 7; }

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
  const [anchor, setAnchor]     = useState<Date>(() => new Date());
  // Which weekday is featured on the left (defaults to today's weekday).
  const [selectedIdx, setSelectedIdx] = useState<number>(() => weekIdx(new Date()));
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [editing, setEditing]   = useState<PlannerEntry | 'new' | null>(null);
  const [newDayKey, setNewDayKey] = useState<string>('');

  // The 7 day keys (Mon–Sun) of the anchor's week.
  const dayKeys = useMemo(() => {
    const monday = mondayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => localKey(addDays(monday, i)));
  }, [anchor]);

  const rangeStart = dayKeys[0];
  const rangeEnd   = dayKeys[6];
  const selectedKey = dayKeys[selectedIdx];
  const todayKey = localKey(new Date());

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

  function goToday() {
    setAnchor(new Date());
    setSelectedIdx(weekIdx(new Date()));
  }

  const weekLabel = `${shortDay(rangeStart)} – ${shortDay(rangeEnd)}`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Planner</h2>
          <p className="text-sm text-slate-500 mt-0.5">Plan your day and week and tick things off. Private to you.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(a => addDays(a, -7))} className="w-8 h-8 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition" aria-label="Previous week">‹</button>
          <button onClick={() => setAnchor(a => addDays(a, 7))} className="w-8 h-8 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition" aria-label="Next week">›</button>
          <button onClick={goToday} className="px-3 h-8 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Today</button>
          <span className="ml-1 text-sm font-medium text-slate-700">{weekLabel}</span>
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-4">
          <div className="h-[420px] rounded-2xl bg-slate-100 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {dayKeys.map(k => <div key={k} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-4">
          {/* Featured (selected) day — 30% */}
          <FeaturedDay
            dayKey={selectedKey}
            isToday={selectedKey === todayKey}
            entries={byDay.get(selectedKey) ?? []}
            onToggle={toggle}
            onQuickAdd={quickAdd}
            onEdit={e => setEditing(e)}
            onAddDetailed={() => { setNewDayKey(selectedKey); setEditing('new'); }}
            onDelete={remove}
          />

          {/* The week — 70% */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
            {dayKeys.map((key, i) => (
              <WeekDayCard
                key={key}
                dayKey={key}
                isToday={key === todayKey}
                isSelected={i === selectedIdx}
                entries={byDay.get(key) ?? []}
                onSelect={() => setSelectedIdx(i)}
                onToggle={toggle}
                onQuickAdd={quickAdd}
              />
            ))}
          </div>
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

// ── Featured day (left, prominent) ────────────────────────────────────────────

function FeaturedDay({
  dayKey: key, isToday, entries, onToggle, onQuickAdd, onEdit, onAddDetailed, onDelete,
}: {
  dayKey: string;
  isToday: boolean;
  entries: PlannerEntry[];
  onToggle: (e: PlannerEntry) => void;
  onQuickAdd: (key: string, title: string) => void;
  onEdit: (e: PlannerEntry) => void;
  onAddDetailed: () => void;
  onDelete: (e: PlannerEntry) => void;
}) {
  const [draft, setDraft] = useState('');
  const doneCount = entries.filter(e => e.status === 'DONE').length;

  function submitQuick() {
    if (!draft.trim()) return;
    onQuickAdd(key, draft);
    setDraft('');
  }

  return (
    <div className="bg-white rounded-2xl border-2 shadow-sm flex flex-col self-start lg:sticky lg:top-4"
      style={{ borderColor: isToday ? 'var(--accent)' : 'rgb(226 232 240)' }}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {isToday && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent)' }}>Today</span>
          )}
          <p className="text-base font-bold text-slate-900">{prettyDay(key)}</p>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {entries.length === 0 ? 'Nothing planned yet' : `${doneCount} of ${entries.length} done`}
        </p>
      </div>

      {/* Entries */}
      <div className="flex-1 p-3 space-y-1 min-h-[180px] max-h-[60vh] overflow-y-auto scrollbar-slim">
        {entries.map(e => (
          <EntryRow key={e.id} entry={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-slate-300 px-2 py-6 text-center">Add your first task for this day.</p>
        )}
      </div>

      {/* Quick add */}
      <div className="px-3 pb-3 pt-1 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitQuick(); }}
          placeholder="Add a task…"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300"
        />
        <button
          onClick={onAddDetailed}
          title="Add with details"
          className="w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 transition shrink-0"
        >
          ⋯
        </button>
      </div>
    </div>
  );
}

// ── Week day card (right, selectable) ─────────────────────────────────────────

function WeekDayCard({
  dayKey: key, isToday, isSelected, entries, onSelect, onToggle, onQuickAdd,
}: {
  dayKey: string;
  isToday: boolean;
  isSelected: boolean;
  entries: PlannerEntry[];
  onSelect: () => void;
  onToggle: (e: PlannerEntry) => void;
  onQuickAdd: (key: string, title: string) => void;
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
    <div
      onClick={onSelect}
      className={`bg-white rounded-xl border shadow-sm flex flex-col cursor-pointer transition min-h-[128px] ${
        isSelected ? 'ring-2 ring-[color:var(--accent)] border-transparent' : 'border-slate-100 hover:border-slate-200'
      }`}
    >
      <div className="px-3 py-2.5 border-b border-slate-50 flex items-center justify-between">
        <div>
          <p className={`text-xs font-semibold ${isToday ? 'text-[color:var(--accent)]' : 'text-slate-500'}`}>{DOW[weekIdx(d)]}</p>
          <p className="text-[11px] text-slate-400">{shortDay(key)}</p>
        </div>
        {entries.length > 0 && <span className="text-[11px] text-slate-400">{doneCount}/{entries.length}</span>}
      </div>

      <div className="flex-1 p-2 space-y-1">
        {entries.slice(0, 5).map(e => (
          <MiniRow key={e.id} entry={e} onToggle={onToggle} />
        ))}
        {entries.length > 5 && (
          <p className="text-[11px] text-slate-400 px-1.5">+{entries.length - 5} more</p>
        )}
        {entries.length === 0 && <p className="text-xs text-slate-300 px-1.5 py-1">Nothing planned.</p>}
      </div>

      <div className="px-2 pb-2" onClick={e => e.stopPropagation()}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitQuick(); }}
          placeholder="Add…"
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300"
        />
      </div>
    </div>
  );
}

// ── Rows ───────────────────────────────────────────────────────────────────────

function Checkbox({ done, onClick }: { done: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`mt-0.5 w-4 h-4 shrink-0 rounded border grid place-items-center transition ${
        done ? 'border-transparent text-white' : 'border-slate-300 hover:border-slate-400'
      }`}
      style={done ? { backgroundColor: 'var(--accent)' } : {}}
      aria-label={done ? 'Mark not done' : 'Mark done'}
    >
      {done && <span className="text-[10px] leading-none">✓</span>}
    </button>
  );
}

// Full row — featured panel (toggle, click to edit, delete on hover).
function EntryRow({ entry, onToggle, onEdit, onDelete }: {
  entry: PlannerEntry;
  onToggle: (e: PlannerEntry) => void;
  onEdit: (e: PlannerEntry) => void;
  onDelete: (e: PlannerEntry) => void;
}) {
  const done = entry.status === 'DONE';
  return (
    <div className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition">
      <Checkbox done={done} onClick={() => onToggle(entry)} />
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

// Compact row — week cards (toggle only; clicking the row bubbles up to select
// the day, where it can be edited in the featured panel).
function MiniRow({ entry, onToggle }: { entry: PlannerEntry; onToggle: (e: PlannerEntry) => void }) {
  const done = entry.status === 'DONE';
  return (
    <div className="flex items-start gap-1.5 px-1.5 py-1 rounded-md">
      <Checkbox done={done} onClick={e => { e.stopPropagation(); onToggle(entry); }} />
      <p className={`text-xs leading-snug min-w-0 truncate ${done ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{entry.title}</p>
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
