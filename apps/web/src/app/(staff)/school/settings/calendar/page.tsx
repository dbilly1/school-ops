'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SettingsCard, FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

type CalendarEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  eventType: 'holiday' | 'vacation' | 'exam_period' | 'event';
  source: 'manual' | 'public_holiday_api' | 'tentative_public_holiday';
  confirmedAt: string | null;
  confirmedBy: string | null;
};

type AcademicYear = { id: string; name: string; isActive: boolean };

const EVENT_TYPE_LABELS: Record<CalendarEvent['eventType'], string> = {
  holiday:     'Holiday',
  vacation:    'Vacation',
  exam_period: 'Exam Period',
  event:       'Event',
};

const EVENT_TYPE_COLORS: Record<CalendarEvent['eventType'], string> = {
  holiday:     '#ef4444',
  vacation:    '#f59e0b',
  exam_period: '#3b82f6',
  event:       '#8b5cf6',
};

const SOURCE_LABELS: Record<CalendarEvent['source'], string> = {
  manual:                    'Manual',
  public_holiday_api:        'Public holiday',
  tentative_public_holiday:  'Tentative public holiday',
};

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event, onAction }: { event: CalendarEvent; onAction: () => void }) {
  const [acting, setActing] = useState(false);
  const isPending = event.source !== 'manual' && !event.confirmedAt;

  async function confirm() {
    setActing(true);
    try { await staffApi.patch(`/school/calendar/holidays/${event.id}/confirm`); onAction(); }
    finally { setActing(false); }
  }

  async function dismiss() {
    setActing(true);
    try { await staffApi.delete(`/school/calendar/holidays/${event.id}/dismiss`); onAction(); }
    finally { setActing(false); }
  }

  async function deleteEvent() {
    setActing(true);
    try { await staffApi.delete(`/school/calendar/${event.id}`); onAction(); }
    finally { setActing(false); }
  }

  return (
    <div className={`flex items-center gap-4 py-3 border-b border-slate-50 last:border-0 ${isPending ? 'bg-amber-50 -mx-4 px-4 rounded-lg' : ''}`}>
      {/* Type badge */}
      <div
        className="text-xs font-semibold text-white px-2.5 py-1 rounded-full shrink-0"
        style={{ backgroundColor: EVENT_TYPE_COLORS[event.eventType] }}
      >
        {EVENT_TYPE_LABELS[event.eventType]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{event.name}</p>
        <p className="text-xs text-slate-400">
          {formatDate(event.startDate)}
          {event.endDate !== event.startDate && ` → ${formatDate(event.endDate)}`}
          {event.source !== 'manual' && ` · ${SOURCE_LABELS[event.source]}`}
          {event.source === 'tentative_public_holiday' && ' ⚠️'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {isPending ? (
          <>
            <button onClick={confirm} disabled={acting} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition disabled:opacity-50" style={{ backgroundColor: 'var(--accent)' }}>
              {acting ? '…' : 'Observe'}
            </button>
            <button onClick={dismiss} disabled={acting} className="text-xs font-medium text-slate-400 hover:text-red-500 transition disabled:opacity-50">
              Dismiss
            </button>
          </>
        ) : (
          <button onClick={deleteEvent} disabled={acting} className="text-xs text-slate-300 hover:text-red-400 transition disabled:opacity-50">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add event form ────────────────────────────────────────────────────────────

function AddEventForm({ selectedYearId, onCreated }: { selectedYearId: string; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', eventType: 'holiday' as CalendarEvent['eventType'] });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function create() {
    if (!form.name || !form.startDate) { setError('Name and start date are required.'); return; }
    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/calendar', {
        name:       form.name,
        startDate:  form.startDate,
        endDate:    form.endDate || form.startDate,
        eventType:  form.eventType,
        academicYearId: selectedYearId,
      });
      setForm({ name: '', startDate: '', endDate: '', eventType: 'holiday' });
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to add event.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-slate-100 pt-5 mt-2">
      <p className="text-sm font-semibold text-slate-700 mb-4">Add calendar event</p>
      {error && <Alert type="error" message={error} />}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <FormField label="Event name" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Independence Day" />
        </FormField>
        <FormField label="Type">
          <select value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value as CalendarEvent['eventType'] }))}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
            {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </FormField>
        <FormField label="Start date" required>
          <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
        </FormField>
        <FormField label="End date" hint="Leave blank for a single day">
          <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SaveButton loading={saving} onClick={create} label="Add event" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const fetchYears = useCallback(() => staffApi.get<AcademicYear[]>('/school/academic-years'), []);
  const { data: years } = useApi(fetchYears);

  const activeYear = years?.find(y => y.isActive) ?? years?.[0];
  const [selectedYearId, setSelectedYearId] = useState<string>('');

  const currentYearId = selectedYearId || activeYear?.id || '';

  const fetchEvents = useCallback(
    () => currentYearId ? staffApi.get<CalendarEvent[]>(`/school/calendar?academicYearId=${currentYearId}`) : Promise.resolve([]),
    [currentYearId],
  );
  const { data: events, loading, refetch } = useApi(fetchEvents);

  const [fetchingHolidays, setFetchingHolidays] = useState(false);

  async function fetchPublicHolidays() {
    if (!currentYearId) return;
    setFetchingHolidays(true);
    try {
      await staffApi.post(`/school/calendar/fetch-holidays/${currentYearId}`);
      refetch();
    } finally {
      setFetchingHolidays(false);
    }
  }

  const pendingEvents = events?.filter(e => e.source !== 'manual' && !e.confirmedAt) ?? [];
  const confirmedEvents = events?.filter(e => e.source === 'manual' || e.confirmedAt) ?? [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">School Calendar</h2>
        <p className="text-sm text-slate-500 mt-0.5">Holidays, vacation periods, and exam windows.</p>
      </div>

      {/* Year selector + fetch holidays */}
      <SettingsCard title="Calendar events">
        <div className="flex items-center justify-between mb-5">
          <select
            value={currentYearId}
            onChange={e => setSelectedYearId(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
          >
            {years?.map(y => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (Active)' : ''}</option>)}
          </select>

          <button
            onClick={fetchPublicHolidays}
            disabled={fetchingHolidays || !currentYearId}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {fetchingHolidays ? 'Fetching…' : '↓ Fetch public holidays'}
          </button>
        </div>

        {/* Pending confirmation */}
        {pendingEvents.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-2">
              ⚠️ Pending review — {pendingEvents.length} public holiday{pendingEvents.length > 1 ? 's' : ''}
            </p>
            {pendingEvents.map(e => <EventRow key={e.id} event={e} onAction={refetch} />)}
          </div>
        )}

        {/* Confirmed / manual events */}
        {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>}
        {!loading && confirmedEvents.length === 0 && pendingEvents.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">No events for this year. Add one below or fetch public holidays.</p>
        )}
        {confirmedEvents.map(e => <EventRow key={e.id} event={e} onAction={refetch} />)}

        <AddEventForm selectedYearId={currentYearId} onCreated={refetch} />
      </SettingsCard>
    </div>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
