'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScaleType = 'PERCENTAGE' | 'LETTER' | 'GPA' | 'CUSTOM';

type Band = { id?: string; label: string; minScore: string; maxScore: string; remark: string };

type GradingScale = {
  id: string;
  scaleType: ScaleType;
  passmark: number | null;
  gpaMax: number | null;
  isActive: boolean;
  appliesToGradeLevelIds: string[];
  bands: (Band & { id: string })[];
};

type GradeLevel = { id: string; name: string };

// GES-approved presets for Ghanaian basic schools.
const GES_PRESETS: { key: string; label: string; scaleType: ScaleType; bands: Band[] }[] = [
  {
    key: 'GES_PRIMARY', label: 'GES Primary (A–F)', scaleType: 'LETTER',
    bands: [
      { label: 'A', minScore: '80', maxScore: '100', remark: 'Excellent' },
      { label: 'B', minScore: '70', maxScore: '79',  remark: 'Very Good' },
      { label: 'C', minScore: '60', maxScore: '69',  remark: 'Good'      },
      { label: 'D', minScore: '45', maxScore: '59',  remark: 'Pass'      },
      { label: 'E', minScore: '35', maxScore: '44',  remark: 'Weak'      },
      { label: 'F', minScore: '0',  maxScore: '34',  remark: 'Fail'      },
    ],
  },
  {
    key: 'GES_JHS', label: 'GES JHS (1–9)', scaleType: 'CUSTOM',
    bands: [
      { label: '1', minScore: '90', maxScore: '100', remark: 'Highest'      },
      { label: '2', minScore: '80', maxScore: '89',  remark: 'Higher'       },
      { label: '3', minScore: '70', maxScore: '79',  remark: 'High'         },
      { label: '4', minScore: '60', maxScore: '69',  remark: 'High Average' },
      { label: '5', minScore: '55', maxScore: '59',  remark: 'Average'      },
      { label: '6', minScore: '50', maxScore: '54',  remark: 'Low Average'  },
      { label: '7', minScore: '40', maxScore: '49',  remark: 'Low'          },
      { label: '8', minScore: '35', maxScore: '39',  remark: 'Lower'        },
      { label: '9', minScore: '0',  maxScore: '34',  remark: 'Lowest'       },
    ],
  },
];

const SCALE_OPTIONS: { value: ScaleType; label: string; description: string }[] = [
  { value: 'PERCENTAGE', label: 'Percentage',    description: 'Scores 0–100, with a configurable pass mark.' },
  { value: 'LETTER',     label: 'Letter grades', description: 'A, B, C, D, F with configurable score ranges.' },
  { value: 'GPA',        label: 'GPA',           description: '4.0 or 5.0 scale, configurable.' },
  { value: 'CUSTOM',     label: 'Custom',        description: 'Define your own grade labels and score ranges.' },
];

const TYPE_LABELS: Record<ScaleType, string> = {
  PERCENTAGE: 'Percentage',
  LETTER:     'Letter grades',
  GPA:        'GPA',
  CUSTOM:     'Custom',
};

const DEFAULT_BANDS: Record<ScaleType, Band[]> = {
  PERCENTAGE: [
    { label: 'Excellent', minScore: '80', maxScore: '100', remark: 'Distinction' },
    { label: 'Very Good', minScore: '70', maxScore: '79',  remark: 'Merit'       },
    { label: 'Good',      minScore: '60', maxScore: '69',  remark: 'Pass'        },
    { label: 'Pass',      minScore: '50', maxScore: '59',  remark: 'Pass'        },
    { label: 'Fail',      minScore: '0',  maxScore: '49',  remark: 'Fail'        },
  ],
  LETTER: [
    { label: 'A', minScore: '80', maxScore: '100', remark: 'Excellent' },
    { label: 'B', minScore: '70', maxScore: '79',  remark: 'Very Good' },
    { label: 'C', minScore: '60', maxScore: '69',  remark: 'Good'      },
    { label: 'D', minScore: '50', maxScore: '59',  remark: 'Pass'      },
    { label: 'F', minScore: '0',  maxScore: '49',  remark: 'Fail'      },
  ],
  GPA: [
    { label: '4.0', minScore: '80', maxScore: '100', remark: 'A' },
    { label: '3.0', minScore: '70', maxScore: '79',  remark: 'B' },
    { label: '2.0', minScore: '60', maxScore: '69',  remark: 'C' },
    { label: '1.0', minScore: '50', maxScore: '59',  remark: 'D' },
    { label: '0.0', minScore: '0',  maxScore: '49',  remark: 'F' },
  ],
  CUSTOM: [
    { label: 'Outstanding',        minScore: '80', maxScore: '100', remark: '' },
    { label: 'Satisfactory',       minScore: '50', maxScore: '79',  remark: '' },
    { label: 'Needs Improvement',  minScore: '0',  maxScore: '49',  remark: '' },
  ],
};

// ── Bands table (shared between existing-scale card and new-scale form) ────────

function BandsTable({ bands, onChange }: { bands: Band[]; onChange: (bands: Band[]) => void }) {
  function update(i: number, field: keyof Band, value: string) {
    onChange(bands.map((b, idx) => idx === i ? { ...b, [field]: value } : b));
  }

  return (
    <div>
      <div className="grid grid-cols-12 gap-2 mb-1 px-1">
        <p className="col-span-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Label</p>
        <p className="col-span-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Min</p>
        <p className="col-span-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Max</p>
        <p className="col-span-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Remark</p>
      </div>
      <div className="space-y-2">
        {bands.map((band, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input value={band.label}    onChange={e => update(i, 'label',    e.target.value)} placeholder="A"        className="col-span-3 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
            <input value={band.minScore} onChange={e => update(i, 'minScore', e.target.value)} placeholder="0"   type="number" className="col-span-2 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
            <input value={band.maxScore} onChange={e => update(i, 'maxScore', e.target.value)} placeholder="100" type="number" className="col-span-2 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
            <input value={band.remark}   onChange={e => update(i, 'remark',   e.target.value)} placeholder="Optional" className="col-span-4 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
            <button type="button" onClick={() => onChange(bands.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-300 hover:text-red-400 transition text-lg leading-none justify-self-center">×</button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...bands, { label: '', minScore: '', maxScore: '', remark: '' }])}
        className="mt-3 text-sm transition"
        style={{ color: 'var(--accent)' }}
      >
        + Add band
      </button>
    </div>
  );
}

// ── Existing scale card ────────────────────────────────────────────────────────

function ScaleCard({ scale, onRefetch, gradeLevels }: { scale: GradingScale; onRefetch: () => void; gradeLevels: GradeLevel[] }) {
  const targetNames = (scale.appliesToGradeLevelIds ?? [])
    .map(id => gradeLevels.find(g => g.id === id)?.name)
    .filter(Boolean) as string[];
  const [bands, setBands]       = useState<Band[]>(
    scale.bands.map(b => ({ ...b, minScore: String(b.minScore), maxScore: String(b.maxScore) })),
  );
  const [expanded, setExpanded] = useState(scale.isActive);
  const [saving, setSaving]     = useState(false);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function saveBands() {
    setAlert(null);
    setSaving(true);
    try {
      await staffApi.patch(`/school/grading/${scale.id}/bands`, {
        bands: bands.map(b => ({
          label:    b.label,
          minScore: parseFloat(b.minScore) || 0,
          maxScore: parseFloat(b.maxScore) || 0,
          remark:   b.remark || undefined,
        })),
      });
      setAlert({ type: 'success', message: 'Bands saved.' });
      onRefetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    await staffApi.patch(`/school/grading/${scale.id}/activate`);
    onRefetch();
  }

  return (
    <div
      className="border rounded-xl overflow-hidden mb-3"
      style={scale.isActive ? { borderColor: 'var(--accent)' } : { borderColor: '#e2e8f0' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{TYPE_LABELS[scale.scaleType]}</span>
          {scale.passmark !== null && (
            <span className="text-xs text-slate-400">Pass: {scale.passmark}</span>
          )}
          {scale.gpaMax !== null && (
            <span className="text-xs text-slate-400">Max GPA: {scale.gpaMax}</span>
          )}
          {scale.isActive && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
              Active
            </span>
          )}
          <span className="text-xs text-slate-400">
            {targetNames.length > 0 ? targetNames.join(', ') : 'All grade levels'}
          </span>
        </div>
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {!scale.isActive && (
            <button onClick={activate} className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
              Set active
            </button>
          )}
          <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Bands editor */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4">
          {alert && (
            <p className={`mb-3 text-sm ${alert.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
              {alert.message}
            </p>
          )}
          <BandsTable bands={bands} onChange={setBands} />
          <div className="mt-4 flex justify-end">
            <button
              onClick={saveBands}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              {saving ? 'Saving…' : 'Save bands'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New scale form ─────────────────────────────────────────────────────────────

function NewScaleForm({ onCreated, gradeLevels }: { onCreated: () => void; gradeLevels: GradeLevel[] }) {
  const [open, setOpen]           = useState(false);
  const [scaleType, setScaleType] = useState<ScaleType>('PERCENTAGE');
  const [passmark, setPassmark]   = useState('50');
  const [gpaMax, setGpaMax]       = useState('4.0');
  const [bands, setBands]         = useState<Band[]>(DEFAULT_BANDS.PERCENTAGE);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function selectScale(type: ScaleType) {
    setScaleType(type);
    setBands(DEFAULT_BANDS[type]);
  }

  function applyPreset(key: string) {
    const preset = GES_PRESETS.find(p => p.key === key);
    if (!preset) return;
    setScaleType(preset.scaleType);
    setBands(preset.bands);
  }

  function toggleTarget(id: string) {
    setTargetIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  async function create() {
    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/grading', {
        scaleType,
        passmark:  scaleType === 'PERCENTAGE' ? parseFloat(passmark) : undefined,
        gpaMax:    scaleType === 'GPA'        ? parseFloat(gpaMax)   : undefined,
        appliesToGradeLevelIds: targetIds,
        bands: bands.map(b => ({
          label:    b.label,
          minScore: parseFloat(b.minScore) || 0,
          maxScore: parseFloat(b.maxScore) || 0,
          remark:   b.remark || undefined,
        })),
      });
      setOpen(false);
      setTargetIds([]);
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create grading scale.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-slate-400 hover:text-slate-500 transition mt-2"
      >
        + Add grading scale
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl px-4 py-4 mt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-800">New grading scale</p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {/* GES presets */}
      <div className="mb-4">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Quick start — GES presets</p>
        <div className="flex flex-wrap gap-2">
          {GES_PRESETS.map(p => (
            <button
              key={p.key} type="button" onClick={() => applyPreset(p.key)}
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-700 hover:border-slate-300 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scale type selector */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {SCALE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => selectScale(opt.value)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition ${
              scaleType === opt.value
                ? 'border-transparent text-white'
                : 'border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
            style={scaleType === opt.value ? { backgroundColor: 'var(--accent)' } : {}}
          >
            <p className="font-semibold">{opt.label}</p>
            <p className={`text-xs mt-0.5 ${scaleType === opt.value ? 'text-white/70' : 'text-slate-400'}`}>
              {opt.description}
            </p>
          </button>
        ))}
      </div>

      {/* Extra config */}
      {scaleType === 'PERCENTAGE' && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Pass mark:</label>
          <input
            type="number" value={passmark} onChange={e => setPassmark(e.target.value)} min={0} max={100}
            className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none"
            onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow=''}
          />
          <span className="text-sm text-slate-400">/ 100</span>
        </div>
      )}
      {scaleType === 'GPA' && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">GPA scale:</label>
          {['4.0', '5.0'].map(v => (
            <button
              key={v} type="button" onClick={() => setGpaMax(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${gpaMax === v ? 'text-white' : 'bg-slate-100 text-slate-600'}`}
              style={gpaMax === v ? { backgroundColor: 'var(--accent)' } : {}}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Grade-level targeting */}
      {gradeLevels.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-600 mb-1">Applies to</p>
          <p className="text-xs text-slate-400 mb-2">Pick the grade levels that use this scale (e.g. JHS classes). Leave all unselected to make it the school-wide default.</p>
          <div className="flex flex-wrap gap-2">
            {gradeLevels.map(gl => (
              <button
                key={gl.id} type="button" onClick={() => toggleTarget(gl.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${targetIds.includes(gl.id) ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                style={targetIds.includes(gl.id) ? { backgroundColor: 'var(--accent)' } : {}}
              >
                {gl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bands */}
      <BandsTable bands={bands} onChange={setBands} />

      <div className="mt-4 flex items-center justify-end gap-3">
        <button onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
        <button
          onClick={create}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        >
          {saving ? 'Creating…' : 'Create scale'}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GradingPage() {
  const fetchScales = useCallback(() => staffApi.get<GradingScale[]>('/school/grading'), []);
  const fetchGradeLevels = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);
  const { data: scales, loading, error, refetch } = useApi(fetchScales);
  const { data: gradeLevels } = useApi(fetchGradeLevels);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Grading Scale</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Raw scores are always stored. The active scale is used to derive display grades on report cards.
        </p>
      </div>

      {loading && (
        <div className="space-y-3 mb-4">
          {[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          Could not load grading scales: {error.message}
        </div>
      )}

      {!loading && scales && (
        <>
          {scales.map(scale => <ScaleCard key={scale.id} scale={scale} onRefetch={refetch} gradeLevels={gradeLevels ?? []} />)}
          {scales.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">
              No grading scales configured yet. Add one below.
            </p>
          )}
        </>
      )}

      {!loading && <NewScaleForm onCreated={refetch} gradeLevels={gradeLevels ?? []} />}
    </div>
  );
}
