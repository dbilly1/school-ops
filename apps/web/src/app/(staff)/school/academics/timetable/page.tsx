'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { Modal } from '@/components/ui/modal';
import { SaveButton, Alert, FormField } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type Term         = { id: string; name: string; isActive: boolean; academicYear: { name: string } };
type ClassItem    = { id: string; name: string };
type Subject      = { id: string; name: string };
type Teacher      = { id: string; firstName: string; lastName: string };
type TimetableConfig = {
  id: string;
  periodsPerDay: number;
  periodDurationMinutes: number;
  schoolDays: string[];
  breaks: { afterPeriod: number; durationMinutes: number; label?: string | null }[];
};
type Slot = {
  id: string;
  day: string;
  periodNumber: number;
  slotType: 'LESSON' | 'BREAK' | 'FREE' | 'lesson' | 'break' | 'free';
  subject: { id: string; name: string } | null;
  teacher: { id: string; firstName: string; lastName: string } | null;
};
type Clash = {
  teacherId: string;
  teacherName: string;
  day: string;
  period: number;
  classes: string[];
};

const DAY_ORDER = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const ALL_DAYS  = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

// ── Timing config form (shared by setup + edit) ───────────────────────────────

type BreakEntry = { afterPeriod: string; durationMinutes: string; label: string };
type TimingForm = {
  periodsPerDay: number;
  periodDurationMinutes: number;
  schoolDays: string[];
  breaks: BreakEntry[];
};

function TimingForm({ form, onChange }: {
  form: TimingForm;
  onChange: (f: TimingForm) => void;
}) {
  function toggleDay(day: string) {
    onChange({
      ...form,
      schoolDays: form.schoolDays.includes(day)
        ? form.schoolDays.filter(d => d !== day)
        : [...form.schoolDays, day],
    });
  }

  function updateBreak(index: number, field: keyof BreakEntry, value: string) {
    const updated = form.breaks.map((b, i) => i === index ? { ...b, [field]: value } : b);
    onChange({ ...form, breaks: updated });
  }

  function addBreak() {
    onChange({
      ...form,
      breaks: [...form.breaks, { afterPeriod: '', durationMinutes: '20', label: '' }],
    });
  }

  function removeBreak(index: number) {
    onChange({ ...form, breaks: form.breaks.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Periods per day">
          <input type="number" value={form.periodsPerDay} min={1} max={12}
            onChange={e => onChange({ ...form, periodsPerDay: parseInt(e.target.value) || 1 })}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''} />
        </FormField>
        <FormField label="Period duration (min)">
          <input type="number" value={form.periodDurationMinutes} min={10}
            onChange={e => onChange({ ...form, periodDurationMinutes: parseInt(e.target.value) || 10 })}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''} />
        </FormField>
      </div>

      <FormField label="School days">
        <div className="flex gap-2 flex-wrap">
          {ALL_DAYS.map(d => (
            <button key={d} type="button" onClick={() => toggleDay(d)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
              style={form.schoolDays.includes(d)
                ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                : { borderColor: '#e2e8f0', color: '#475569' }}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </FormField>

      {/* Breaks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-700">Breaks</label>
          <button
            type="button"
            onClick={addBreak}
            className="text-xs font-medium transition"
            style={{ color: 'var(--accent)' }}
          >
            + Add break
          </button>
        </div>

        {form.breaks.length === 0 && (
          <p className="text-xs text-slate-400 italic">No breaks — click &ldquo;+ Add break&rdquo; to add one.</p>
        )}

        <div className="space-y-2">
          {form.breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-1">Label</label>
                  <input
                    type="text"
                    value={b.label}
                    onChange={e => updateBreak(i, 'label', e.target.value)}
                    placeholder="e.g. Lunch"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white"
                    onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow = ''}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-1">After period</label>
                  <input
                    type="number"
                    value={b.afterPeriod}
                    min={1}
                    max={form.periodsPerDay}
                    onChange={e => updateBreak(i, 'afterPeriod', e.target.value)}
                    placeholder="e.g. 3"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white"
                    onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow = ''}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    value={b.durationMinutes}
                    min={5}
                    onChange={e => updateBreak(i, 'durationMinutes', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white"
                    onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow = ''}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeBreak(i)}
                className="text-slate-300 hover:text-red-400 transition shrink-0 mt-4"
                title="Remove break"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Initial setup (no config yet) ─────────────────────────────────────────────

function TimetableSetup({ termId, onCreated }: { termId: string; onCreated: () => void }) {
  const [form, setForm] = useState<TimingForm>({
    periodsPerDay: 8,
    periodDurationMinutes: 40,
    schoolDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'],
    breaks: [{ afterPeriod: '3', durationMinutes: '20', label: 'Break' }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function create() {
    setError(null); setSaving(true);
    const payload = {
      periodsPerDay:         form.periodsPerDay,
      periodDurationMinutes: form.periodDurationMinutes,
      schoolDays:            form.schoolDays,
      breaks: form.breaks
        .filter(b => b.afterPeriod !== '')
        .map(b => ({ afterPeriod: parseInt(b.afterPeriod), durationMinutes: parseInt(b.durationMinutes), label: b.label || undefined })),
    };
    try {
      try {
        await staffApi.post('/school/timetables/config', { termId, ...payload });
      } catch (postErr) {
        // If a config already exists (409), update it instead
        if ((postErr as ApiError).status === 409) {
          await staffApi.patch(`/school/timetables/config?termId=${termId}`, payload);
        } else {
          throw postErr;
        }
      }
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save timetable config.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-lg">
      <h3 className="text-base font-semibold text-slate-900 mb-1">Set up timetable</h3>
      <p className="text-sm text-slate-500 mb-5">Configure the structure before building slots.</p>
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      <TimingForm form={form} onChange={setForm} />
      <div className="flex justify-end mt-5">
        <SaveButton loading={saving} onClick={create} label="Create timetable" />
      </div>
    </div>
  );
}

// ── Edit timing modal ─────────────────────────────────────────────────────────

function EditTimingModal({ open, onClose, termId, config, onSaved }: {
  open: boolean;
  onClose: () => void;
  termId: string;
  config: TimetableConfig;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TimingForm>({
    periodsPerDay:         config.periodsPerDay,
    periodDurationMinutes: config.periodDurationMinutes,
    schoolDays:            config.schoolDays,
    breaks: (config.breaks ?? []).map(b => ({
      afterPeriod:     String(b.afterPeriod),
      durationMinutes: String(b.durationMinutes),
      label:           b.label ?? '',
    })),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function save() {
    setError(null); setSaving(true);
    try {
      await staffApi.patch(`/school/timetables/config?termId=${termId}`, {
        periodsPerDay:         form.periodsPerDay,
        periodDurationMinutes: form.periodDurationMinutes,
        schoolDays:            form.schoolDays,
        breaks: form.breaks
          .filter(b => b.afterPeriod !== '')
          .map(b => ({ afterPeriod: parseInt(b.afterPeriod), durationMinutes: parseInt(b.durationMinutes), label: b.label || undefined })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to update timing.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit timing">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <TimingForm form={form} onChange={setForm} />
        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={save} label="Save changes" />
        </div>
      </div>
    </Modal>
  );
}

// ── Slot cell ─────────────────────────────────────────────────────────────────

function SlotCell({ slot, onEdit }: { slot: Slot | undefined; onEdit?: () => void }) {
  if (!slot || slot.slotType === 'free' || slot.slotType === 'FREE') {
    return (
      <button
        onClick={onEdit}
        className="h-16 w-full border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-300 hover:border-slate-300 hover:text-slate-400 transition group"
      >
        <span className="group-hover:block hidden">+ Add</span>
        <span className="group-hover:hidden block">—</span>
      </button>
    );
  }

  return (
    <button
      onClick={onEdit}
      className="h-16 w-full rounded-lg px-2 py-1.5 text-left transition hover:opacity-80 flex flex-col justify-between"
      style={{ backgroundColor: 'var(--accent-tint)', border: '1px solid var(--accent)' }}
    >
      <p className="text-xs font-semibold truncate" style={{ color: 'var(--accent-dark)' }}>
        {slot.subject?.name ?? 'No subject'}
      </p>
      <p className="text-[10px] truncate" style={{ color: 'var(--accent)' }}>
        {slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName}` : 'No teacher'}
      </p>
    </button>
  );
}

// ── Slot editor modal ─────────────────────────────────────────────────────────

function SlotEditorModal({ open, onClose, classId, day, period, termId, currentSlot, onSaved }: {
  open: boolean; onClose: () => void;
  classId: string; day: string; period: number; termId: string;
  currentSlot: Slot | undefined; onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState(currentSlot?.subject?.id ?? '');
  const [teacherId, setTeacherId] = useState(currentSlot?.teacher?.id ?? '');
  const [slotType, setSlotType]   = useState<'LESSON'|'BREAK'|'FREE'>(
    (currentSlot?.slotType?.toUpperCase() as 'LESSON'|'BREAK'|'FREE') ?? 'LESSON',
  );
  const [saving, setSaving]       = useState(false);
  const [clearing, setClearing]   = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchSubjects = useCallback(() => staffApi.get<Subject[]>('/school/subjects'), []);
  const fetchTeachers = useCallback(
    () => subjectId
      ? staffApi.get<Teacher[]>(`/school/staff/teachers/for-subject/${subjectId}`)
      : Promise.resolve([]),
    [subjectId],
  );

  const { data: subjects } = useApi(fetchSubjects);
  const { data: teachers } = useApi(fetchTeachers);

  async function save() {
    setError(null); setSaving(true);
    try {
      await staffApi.post(`/school/timetables/slots?termId=${termId}`, {
        classId, day, periodNumber: period, slotType,
        subjectId: slotType === 'LESSON' ? subjectId || null : null,
        teacherId: slotType === 'LESSON' ? teacherId || null : null,
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save slot.');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setClearing(true);
    try {
      await staffApi.delete(
        `/school/timetables/slots?classId=${classId}&day=${day}&period=${period}&termId=${termId}`,
      );
      onSaved(); onClose();
    } finally {
      setClearing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${day.charAt(0) + day.slice(1).toLowerCase()} · Period ${period}`}>
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <FormField label="Slot type">
          <div className="flex gap-2">
            {(['LESSON','FREE','BREAK'] as const).map(t => (
              <button key={t} type="button" onClick={() => setSlotType(t)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border transition capitalize"
                style={slotType === t
                  ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { borderColor: '#e2e8f0', color: '#475569' }}>
                {t.toLowerCase()}
              </button>
            ))}
          </div>
        </FormField>

        {slotType === 'LESSON' && (
          <>
            <FormField label="Subject">
              <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setTeacherId(''); }}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                <option value="">Select subject…</option>
                {subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>

            <FormField label="Teacher" hint={subjectId ? undefined : 'Select a subject first to see qualified teachers'}>
              <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                disabled={!subjectId}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none disabled:opacity-50">
                <option value="">Select teacher…</option>
                {teachers?.map(t => (
                  <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                ))}
              </select>
            </FormField>
          </>
        )}

        <div className="flex items-center justify-between pt-2">
          {currentSlot && currentSlot.slotType !== 'free' && currentSlot.slotType !== 'FREE' ? (
            <button onClick={clear} disabled={clearing}
              className="text-sm text-red-400 hover:text-red-600 transition disabled:opacity-40">
              {clearing ? 'Clearing…' : 'Clear slot'}
            </button>
          ) : <div />}
          <SaveButton loading={saving} onClick={save} label="Save slot" />
        </div>
      </div>
    </Modal>
  );
}

// ── Timetable grid ────────────────────────────────────────────────────────────

function TimetableGrid({ config, classId, termId, slots, onSlotsChanged, readOnly }: {
  config: TimetableConfig;
  classId: string;
  termId: string;
  slots: Slot[];
  onSlotsChanged: () => void;
  readOnly?: boolean;
}) {
  const [editSlot, setEditSlot] = useState<{ day: string; period: number } | null>(null);

  const activeDays   = config.schoolDays
    .filter(d => DAY_ORDER.includes(d))
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const breakMap     = new Map(config.breaks.map(b => [b.afterPeriod, b.label || 'Break']));
  const periods     = Array.from({ length: config.periodsPerDay }, (_, i) => i + 1);

  function getSlot(day: string, period: number) {
    return slots.find(s => s.day === day && s.periodNumber === period);
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-14 pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">P</th>
              {activeDays.map(day => (
                <th key={day} className="pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wide text-center min-w-[120px]">
                  {day.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map(period => (
              <>
                <tr key={period}>
                  <td className="text-center text-xs font-medium text-slate-400 pb-2 align-middle">{period}</td>
                  {activeDays.map(day => (
                    <td key={day} className="px-1 pb-2 align-top">
                      <SlotCell
                        slot={getSlot(day, period)}
                        onEdit={readOnly ? undefined : () => setEditSlot({ day, period })}
                      />
                    </td>
                  ))}
                </tr>
                {breakMap.has(period) && (
                  <tr key={`break-${period}`}>
                    <td className="text-center text-[10px] text-slate-300 pb-2">↕</td>
                    {activeDays.map(day => (
                      <td key={day} className="px-1 pb-2">
                        <div className="h-7 bg-amber-50 rounded-lg flex items-center justify-center">
                          <span className="text-[10px] text-amber-500 font-semibold tracking-wide uppercase">
                            {breakMap.get(period)}
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {editSlot && (
        <SlotEditorModal
          open
          onClose={() => setEditSlot(null)}
          classId={classId}
          day={editSlot.day}
          period={editSlot.period}
          termId={termId}
          currentSlot={getSlot(editSlot.day, editSlot.period)}
          onSaved={() => { onSlotsChanged(); setEditSlot(null); }}
        />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TimetablePage() {
  const { isOwner, isAdmin } = useStaffAuth();
  const readOnly = !isOwner && !isAdmin;

  const [selectedTermId,  setSelectedTermId]  = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [showEditTiming,  setShowEditTiming]  = useState(false);

  const fetchActiveTerms = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active')
      .then(year => year?.terms?.map((t: any) => ({ ...t, academicYear: { name: year.name } })) ?? [])
      .catch(() => []),
    [],
  );
  const fetchClasses = useCallback(() => staffApi.get<ClassItem[]>('/school/grade-structure/classes'), []);

  const { data: terms }   = useApi(fetchActiveTerms);
  const { data: classes } = useApi(fetchClasses);

  const activeTerm     = terms?.find((t: Term) => t.isActive) ?? terms?.[0];
  const currentTermId  = selectedTermId || activeTerm?.id || '';
  const currentClassId = selectedClassId || classes?.[0]?.id || '';

  const fetchConfig = useCallback(
    () => currentTermId
      ? staffApi.get<TimetableConfig | null>(`/school/timetables/config?termId=${currentTermId}`).catch(() => null)
      : Promise.resolve(null),
    [currentTermId],
  );
  const fetchSlots = useCallback(
    () => currentClassId && currentTermId
      ? staffApi.get<Slot[]>(`/school/timetables/class/${currentClassId}?termId=${currentTermId}`)
          .then((r: any) => r?.slots ?? r ?? [])
          .catch(() => [])
      : Promise.resolve([]),
    [currentClassId, currentTermId],
  );
  const fetchClashes = useCallback(
    () => currentTermId
      ? staffApi.get<Clash[]>(`/school/timetables/clashes?termId=${currentTermId}`).catch(() => [])
      : Promise.resolve([]),
    [currentTermId],
  );

  // Keys force a re-fetch once the term/class actually resolve — on first mount
  // they're still empty (terms/classes load async), so a keyless fetch would
  // cache the empty-term `null` config forever and keep showing the setup form.
  const { data: config,  loading: configLoading, refetch: refetchConfig } = useApi(fetchConfig, currentTermId);
  const { data: slots,   refetch: refetchSlots }  = useApi(fetchSlots, `${currentClassId}:${currentTermId}`);
  const { data: clashes } = useApi(fetchClashes, currentTermId);

  return (
    <div>
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Timetable</h2>

        <div className="flex items-center gap-3">
          {/* Edit timing button — only when config exists */}
          {config && !readOnly && (
            <button
              onClick={() => setShowEditTiming(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              Edit timing
            </button>
          )}

          {/* Term selector */}
          <select value={currentTermId} onChange={e => setSelectedTermId(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">Select term…</option>
            {terms?.map((t: Term) => (
              <option key={t.id} value={t.id}>
                {t.academicYear.name} · {t.name}{t.isActive ? ' (Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Clash report ── */}
      {clashes && clashes.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
          <p className="text-sm font-semibold text-red-600 mb-2">
            ⚠️ {clashes.length} teacher clash{clashes.length > 1 ? 'es' : ''} detected
          </p>
          <div className="space-y-1">
            {clashes.map((c, i) => (
              <p key={i} className="text-xs text-red-500">
                {c.teacherName} · {c.day} P{c.period} · assigned to: {c.classes.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── No term selected ── */}
      {!currentTermId && (
        <p className="text-sm text-slate-400 text-center py-12">Select a term to view the timetable.</p>
      )}

      {/* ── Loading ── */}
      {currentTermId && configLoading && (
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      )}

      {/* ── No config yet → setup form (admins only) or empty state ── */}
      {currentTermId && !configLoading && !config && (
        readOnly
          ? <p className="text-sm text-slate-400 text-center py-12">No timetable has been configured for this term yet.</p>
          : <TimetableSetup termId={currentTermId} onCreated={refetchConfig} />
      )}

      {/* ── Config exists → class tabs + grid ── */}
      {currentTermId && !configLoading && config && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          {/* Class tabs */}
          {classes && classes.length > 0 && (
            <div className="border-b border-slate-100 px-5 overflow-x-auto">
              <div className="flex gap-0 min-w-max">
                {classes.map(cls => {
                  const active = currentClassId === cls.id;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className="px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
                      style={active
                        ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                        : { borderColor: 'transparent', color: '#64748b' }}
                    >
                      {cls.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="p-5">
            {!currentClassId ? (
              <p className="text-sm text-slate-400 text-center py-8">Select a class above.</p>
            ) : (
              <TimetableGrid
                config={config}
                classId={currentClassId}
                termId={currentTermId}
                slots={slots ?? []}
                onSlotsChanged={refetchSlots}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Edit timing modal ── */}
      {config && showEditTiming && (
        <EditTimingModal
          open={showEditTiming}
          onClose={() => setShowEditTiming(false)}
          termId={currentTermId}
          config={config}
          onSaved={refetchConfig}
        />
      )}
    </div>
  );
}
