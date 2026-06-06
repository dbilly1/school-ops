'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useSubFeature } from '@/hooks/use-feature';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type AdmissionStage = 'LEAD' | 'INQUIRY' | 'APPLICATION' | 'INTERVIEW' | 'ACCEPTED' | 'ENROLLED' | 'WITHDRAWN';

type AdmissionRecord = {
  id: string;
  stage: AdmissionStage;
  formData: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConversionStat = { stage: AdmissionStage; count: number };

// ── Stage config — visibility gated by sub-features ───────────────────────────

const STAGE_CONFIG: {
  stage: AdmissionStage;
  label: string;
  subFeature: string | null;
  color: string;
  bg: string;
}[] = [
  { stage: 'LEAD',        label: 'Lead',        subFeature: 'lead_tracking',     color: '#8b5cf6', bg: '#f5f3ff' },
  { stage: 'INQUIRY',     label: 'Inquiry',      subFeature: 'inquiry_stage',     color: '#3b82f6', bg: '#eff6ff' },
  { stage: 'APPLICATION', label: 'Application',  subFeature: null,                color: '#f59e0b', bg: '#fffbeb' },
  { stage: 'INTERVIEW',   label: 'Interview',    subFeature: 'interview_stage',   color: '#ef4444', bg: '#fef2f2' },
  { stage: 'ACCEPTED',    label: 'Accepted',     subFeature: 'acceptance_stage',  color: '#10b981', bg: '#ecfdf5' },
  { stage: 'ENROLLED',    label: 'Enrolled',     subFeature: null,                color: '#065f46', bg: '#d1fae5' },
];

// ── Gated column — hidden if sub-feature is off ───────────────────────────────

function PipelineColumn({
  config, records, stats, onMoveStage, onCardClick,
}: {
  config: typeof STAGE_CONFIG[number];
  records: AdmissionRecord[];
  stats: ConversionStat[];
  onMoveStage: (id: string, stage: AdmissionStage) => void;
  onCardClick: (id: string) => void;
}) {
  const { enabled, loading } = useSubFeature('admissions', config.subFeature ?? 'application_stage');

  // Application and Enrolled are always visible
  const isVisible = config.subFeature === null ? true : enabled;
  if (loading || !isVisible) return null;

  const count = stats.find(s => s.stage === config.stage)?.count ?? 0;

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            {config.label}
          </span>
          <span className="text-xs font-medium text-slate-400">{count}</span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)] pr-1">
        {records.map(record => (
          <AdmissionCard
            key={record.id}
            record={record}
            stageColor={config.color}
            stageBg={config.bg}
            onClick={() => onCardClick(record.id)}
            onMove={stage => onMoveStage(record.id, stage)}
          />
        ))}
        {records.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-300">Empty</div>
        )}
      </div>
    </div>
  );
}

// ── Admission card ────────────────────────────────────────────────────────────

function AdmissionCard({ record, stageColor, stageBg, onClick, onMove }: {
  record: AdmissionRecord;
  stageColor: string;
  stageBg: string;
  onClick: () => void;
  onMove: (stage: AdmissionStage) => void;
}) {
  const [showMove, setShowMove] = useState(false);
  const name = `${record.formData.firstName ?? ''} ${record.formData.lastName ?? ''}`.trim() || 'Unnamed applicant';
  const source = record.formData.source as string | undefined;

  return (
    <div
      className="bg-white rounded-xl border border-slate-100 shadow-sm p-3.5 cursor-pointer hover:border-slate-200 hover:shadow transition-all group relative"
      onClick={onClick}
    >
      {/* Stage dot */}
      <div className="flex items-start justify-between mb-2">
        <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: stageColor }} />
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setShowMove(v => !v); }}
          className="opacity-0 group-hover:opacity-100 transition text-xs text-slate-400 hover:text-slate-700 px-1"
        >
          Move ▾
        </button>
      </div>

      <p className="text-sm font-semibold text-slate-800 leading-tight mb-1">{name}</p>

      {source && <p className="text-xs text-slate-400 mb-1">via {source}</p>}

      <p className="text-xs text-slate-300 mt-2">
        {new Date(record.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </p>

      {/* Quick move dropdown */}
      {showMove && (
        <div
          className="absolute right-2 top-8 z-10 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden w-36"
          onClick={e => e.stopPropagation()}
        >
          {STAGE_CONFIG.filter(s => s.stage !== record.stage && s.stage !== 'ENROLLED').map(s => (
            <button
              key={s.stage}
              onClick={() => { onMove(s.stage); setShowMove(false); }}
              className="w-full text-left px-3.5 py-2 text-xs font-medium hover:bg-slate-50 transition text-slate-700"
            >
              → {s.label}
            </button>
          ))}
          <button
            onClick={() => { onMove('WITHDRAWN'); setShowMove(false); }}
            className="w-full text-left px-3.5 py-2 text-xs font-medium hover:bg-red-50 text-red-500 transition border-t border-slate-100"
          >
            Withdraw
          </button>
        </div>
      )}
    </div>
  );
}

// ── Conversion stats bar ──────────────────────────────────────────────────────

function ConversionBar({ stats }: { stats: ConversionStat[] }) {
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-4 mb-6 bg-white rounded-2xl border border-slate-100 px-5 py-3.5">
      {STAGE_CONFIG.map(c => {
        const count = stats.find(s => s.stage === c.stage)?.count ?? 0;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={c.stage} className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: c.color }}>{c.label}</span>
            <span className="text-sm font-bold text-slate-800">{count}</span>
            <span className="text-xs text-slate-400">({pct}%)</span>
          </div>
        );
      })}
      <div className="ml-auto text-xs text-slate-400">Total: {total}</div>
    </div>
  );
}

// ── New admission modal ───────────────────────────────────────────────────────

function NewAdmissionModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '',
    gender: '', address: '', source: '', stage: 'APPLICATION' as AdmissionStage,
  });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(v => ({ ...v, [field]: e.target.value }));
  }

  async function create() {
    if (!form.firstName || !form.lastName) {
      setAlert({ type: 'error', message: 'First and last name are required.' }); return;
    }
    setAlert(null); setSaving(true);
    try {
      await staffApi.post('/school/admissions', {
        stage: form.stage,
        formData: {
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, phone: form.phone,
          dateOfBirth: form.dateOfBirth, gender: form.gender,
          address: form.address, source: form.source,
        },
      });
      setForm({ firstName:'', lastName:'', email:'', phone:'', dateOfBirth:'', gender:'', address:'', source:'', stage:'APPLICATION' });
      onCreated();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to create record.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New admission record" width="max-w-xl">
      <div className="space-y-4">
        {alert && <Alert type={alert.type} message={alert.message} />}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name" required>
            <Input value={form.firstName} onChange={f('firstName')} placeholder="Kofi" />
          </FormField>
          <FormField label="Last name" required>
            <Input value={form.lastName} onChange={f('lastName')} placeholder="Mensah" />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Email">
            <Input type="email" value={form.email} onChange={f('email')} placeholder="parent@email.com" />
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone} onChange={f('phone')} placeholder="+233 20 000 0000" />
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Date of birth">
            <Input type="date" value={form.dateOfBirth} onChange={f('dateOfBirth')} />
          </FormField>
          <FormField label="Gender">
            <select value={form.gender} onChange={f('gender')}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Not specified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </FormField>
          <FormField label="Starting stage">
            <select value={form.stage} onChange={f('stage')}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              {STAGE_CONFIG.filter(s => s.stage !== 'ENROLLED').map(s => (
                <option key={s.stage} value={s.stage}>{s.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Address">
            <Input value={form.address} onChange={f('address')} placeholder="Home address" />
          </FormField>
          <FormField label="How they heard about us">
            <Input value={form.source} onChange={f('source')} placeholder="e.g. Referral, Walk-in" />
          </FormField>
        </div>

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={create} label="Create record" />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdmissionsPage() {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch]   = useState('');

  const fetchRecords = useCallback(() => staffApi.get<AdmissionRecord[]>('/school/admissions'), []);
  const fetchStats   = useCallback(() => staffApi.get<ConversionStat[]>('/school/admissions/stats/conversion'), []);

  const { data: records, loading, refetch } = useApi(fetchRecords);
  const { data: stats }                     = useApi(fetchStats);

  async function moveStage(id: string, stage: AdmissionStage) {
    await staffApi.patch(`/school/admissions/${id}/stage`, { stage });
    refetch();
  }

  const filtered = records?.filter(r => {
    if (!search) return true;
    const name = `${r.formData.firstName ?? ''} ${r.formData.lastName ?? ''}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function recordsByStage(stage: AdmissionStage) {
    return filtered?.filter(r => r.stage === stage) ?? [];
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Admissions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track applicants from first contact through to enrolment.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/school/admissions/settings')}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            Form settings
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
          >
            + New record
          </button>
        </div>
      </div>

      {/* Conversion stats */}
      {stats && stats.length > 0 && <ConversionBar stats={stats} />}

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search applicants…"
          className="w-64 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
      </div>

      {/* Pipeline board */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="min-w-[220px] h-64 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGE_CONFIG.map(config => (
            <PipelineColumn
              key={config.stage}
              config={config}
              records={recordsByStage(config.stage)}
              stats={stats ?? []}
              onMoveStage={moveStage}
              onCardClick={id => router.push(`/school/admissions/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Withdrawn — collapsed row at bottom */}
      {(() => {
        const withdrawn = recordsByStage('WITHDRAWN');
        if (withdrawn.length === 0) return null;
        return (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-400 mb-2">
              Withdrawn ({withdrawn.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {withdrawn.map(r => {
                const name = `${r.formData.firstName ?? ''} ${r.formData.lastName ?? ''}`.trim() || 'Unnamed';
                return (
                  <button
                    key={r.id}
                    onClick={() => router.push(`/school/admissions/${r.id}`)}
                    className="px-3 py-1.5 text-xs text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      <NewAdmissionModal open={showNew} onClose={() => setShowNew(false)} onCreated={refetch} />
    </div>
  );
}
