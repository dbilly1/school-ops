'use client';

import { useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type AdmissionStage = 'LEAD' | 'INQUIRY' | 'APPLICATION' | 'INTERVIEW' | 'ACCEPTED' | 'ENROLLED' | 'WITHDRAWN';

type FollowUp = {
  id: string;
  note: string;
  followUpDate: string | null;
  createdAt: string;
  createdBy: string;
};

type AdmissionRecord = {
  id: string;
  stage: AdmissionStage;
  formData: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  followUps: FollowUp[];
  student: { id: string } | null;
};

const STAGE_ORDER: AdmissionStage[] = ['LEAD', 'INQUIRY', 'APPLICATION', 'INTERVIEW', 'ACCEPTED', 'ENROLLED'];

const STAGE_LABELS: Record<AdmissionStage, string> = {
  LEAD: 'Lead', INQUIRY: 'Inquiry', APPLICATION: 'Application',
  INTERVIEW: 'Interview', ACCEPTED: 'Accepted',
  ENROLLED: 'Enrolled', WITHDRAWN: 'Withdrawn',
};

const STAGE_COLORS: Record<AdmissionStage, string> = {
  LEAD: '#8b5cf6', INQUIRY: '#3b82f6', APPLICATION: '#f59e0b',
  INTERVIEW: '#ef4444', ACCEPTED: '#10b981',
  ENROLLED: '#065f46', WITHDRAWN: '#94a3b8',
};

// ── Stage progress bar ────────────────────────────────────────────────────────

function StageProgress({ stage }: { stage: AdmissionStage }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  const isWithdrawn = stage === 'WITHDRAWN';

  return (
    <div className="flex items-center gap-1 mb-6">
      {STAGE_ORDER.map((s, i) => {
        const isPast    = !isWithdrawn && i < currentIdx;
        const isCurrent = !isWithdrawn && i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div
              className="flex-1 h-1.5 rounded-full transition-all"
              style={{
                backgroundColor: isPast || isCurrent
                  ? STAGE_COLORS[s]
                  : '#e2e8f0',
                opacity: isPast ? 0.5 : 1,
              }}
            />
            {i < STAGE_ORDER.length - 1 && (
              <div className="w-1 h-1 rounded-full bg-slate-200 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Follow-up timeline ────────────────────────────────────────────────────────

function FollowUpTimeline({ followUps, recordId, onAdded }: {
  followUps: FollowUp[];
  recordId: string;
  onAdded: () => void;
}) {
  const [note, setNote]             = useState('');
  const [followUpDate, setDate]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function add() {
    if (!note.trim()) { setError('Note is required.'); return; }
    setError(null); setSaving(true);
    try {
      await staffApi.post(`/school/admissions/${recordId}/follow-ups`, {
        note: note.trim(),
        followUpDate: followUpDate || null,
      });
      setNote(''); setDate('');
      onAdded();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to add follow-up.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Follow-up history</h3>

      {followUps.length === 0 && (
        <p className="text-sm text-slate-400 italic mb-4">No follow-ups recorded yet.</p>
      )}

      <div className="space-y-3 mb-5">
        {followUps.map((fu, i) => (
          <div key={fu.id} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
              {i < followUps.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-1" />}
            </div>
            <div className="flex-1 pb-3">
              <p className="text-sm text-slate-700">{fu.note}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-400">
                  {new Date(fu.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {fu.followUpDate && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    Follow up: {new Date(fu.followUpDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add follow-up */}
      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add follow-up</p>
        {error && <Alert type="error" message={error} />}
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note what happened or what to do next…"
          rows={2}
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none resize-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs text-slate-500 shrink-0">Follow-up date:</label>
            <input
              type="date"
              value={followUpDate}
              onChange={e => setDate(e.target.value)}
              className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg outline-none"
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''}
            />
          </div>
          <SaveButton loading={saving} onClick={add} label="Add note" />
        </div>
      </div>
    </div>
  );
}

// ── Stage transition panel ────────────────────────────────────────────────────

function StagePanel({ record, onUpdated }: { record: AdmissionRecord; onUpdated: () => void }) {
  const [notes, setNotes]   = useState('');
  const [moving, setMoving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const currentIdx  = STAGE_ORDER.indexOf(record.stage);
  const isWithdrawn = record.stage === 'WITHDRAWN';
  const isEnrolled  = record.stage === 'ENROLLED';

  async function moveTo(stage: AdmissionStage) {
    setAlert(null); setMoving(true);
    try {
      await staffApi.patch(`/school/admissions/${record.id}/stage`, {
        stage, notes: notes || null,
      });
      setNotes('');
      setAlert({ type: 'success', message: stage === 'ENROLLED' ? 'Student profile created and enrolled.' : `Moved to ${STAGE_LABELS[stage]}.` });
      onUpdated();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to move stage.' });
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} />}

      {/* Current stage */}
      <div className="flex items-center gap-2">
        <span
          className="px-3 py-1 rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: STAGE_COLORS[record.stage] }}
        >
          {STAGE_LABELS[record.stage]}
        </span>
        {isEnrolled && record.student && (
          <span className="text-xs text-slate-400">Student profile created</span>
        )}
      </div>

      {!isEnrolled && !isWithdrawn && (
        <>
          <StageProgress stage={record.stage} />

          {/* Notes for move */}
          <FormField label="Notes (optional)" hint="Added to the record when moving to the next stage.">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none resize-none"
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''}
            />
          </FormField>

          {/* Move forward */}
          <div className="flex flex-wrap gap-2">
            {STAGE_ORDER.slice(currentIdx + 1).map(stage => (
              <button
                key={stage}
                onClick={() => moveTo(stage)}
                disabled={moving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: STAGE_COLORS[stage] }}
              >
                {moving ? '…' : `→ ${STAGE_LABELS[stage]}`}
              </button>
            ))}
          </div>

          {/* Withdraw */}
          <button
            onClick={() => moveTo('WITHDRAWN')}
            disabled={moving}
            className="text-sm text-slate-400 hover:text-red-500 transition disabled:opacity-40"
          >
            Withdraw applicant
          </button>
        </>
      )}

      {isWithdrawn && (
        <button
          onClick={() => moveTo('APPLICATION')}
          disabled={moving}
          className="text-sm font-medium transition"
          style={{ color: 'var(--accent)' }}
        >
          Reinstate → Application
        </button>
      )}
    </div>
  );
}

// ── Form data display ─────────────────────────────────────────────────────────

function FormDataCard({ formData }: { formData: Record<string, unknown> }) {
  const entries = Object.entries(formData).filter(([, v]) => v !== '' && v != null);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <p className="text-xs font-medium text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
          <p className="text-sm text-slate-800 mt-0.5">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const fetchRecord = useCallback(() => staffApi.get<AdmissionRecord>(`/school/admissions/${id}`), [id]);
  const { data: record, loading, refetch } = useApi(fetchRecord);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse" />
      <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );

  if (!record) return <p className="text-sm text-slate-400">Record not found.</p>;

  const name = `${record.formData.firstName ?? ''} ${record.formData.lastName ?? ''}`.trim() || 'Unnamed applicant';

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push('/school/admissions')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to pipeline
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Added {new Date(record.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {record.student && (
          <button
            onClick={() => router.push(`/school/students/${record.student!.id}`)}
            className="text-sm font-medium px-4 py-2 rounded-lg border text-white transition"
            style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            View student profile →
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* Left: form data + follow-ups */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Applicant information</h3>
            <FormDataCard formData={record.formData} />
            {record.notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-1">Notes</p>
                <p className="text-sm text-slate-700">{record.notes}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5">
            <FollowUpTimeline followUps={record.followUps} recordId={record.id} onAdded={refetch} />
          </div>
        </div>

        {/* Right: stage panel */}
        <div className="col-span-1">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 sticky top-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pipeline stage</h3>
            <StagePanel record={record} onUpdated={refetch} />
          </div>
        </div>
      </div>
    </div>
  );
}
