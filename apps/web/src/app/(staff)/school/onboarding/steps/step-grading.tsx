'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { WizardShell, WizardNav } from './wizard-shell';

type ScaleType = 'PERCENTAGE' | 'LETTER' | 'GPA' | 'CUSTOM';

type Band = { label: string; minScore: string; maxScore: string; remark: string };

const SCALE_OPTIONS: { value: ScaleType; label: string; description: string }[] = [
  { value: 'PERCENTAGE', label: 'Percentage', description: 'Scores 0–100, with a configurable pass mark.' },
  { value: 'LETTER',     label: 'Letter grades', description: 'A, B, C, D, F with configurable score ranges.' },
  { value: 'GPA',        label: 'GPA', description: '4.0 or 5.0 scale, configurable.' },
  { value: 'CUSTOM',     label: 'Custom', description: 'Define your own grade labels and score ranges.' },
];

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
    { label: '4.0', minScore: '80', maxScore: '100', remark: 'A'  },
    { label: '3.0', minScore: '70', maxScore: '79',  remark: 'B'  },
    { label: '2.0', minScore: '60', maxScore: '69',  remark: 'C'  },
    { label: '1.0', minScore: '50', maxScore: '59',  remark: 'D'  },
    { label: '0.0', minScore: '0',  maxScore: '49',  remark: 'F'  },
  ],
  CUSTOM: [
    { label: 'Outstanding', minScore: '80', maxScore: '100', remark: '' },
    { label: 'Satisfactory', minScore: '50', maxScore: '79', remark: '' },
    { label: 'Needs Improvement', minScore: '0', maxScore: '49', remark: '' },
  ],
};

export function StepGrading({
  onNext, onBack, onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [scaleType, setScaleType] = useState<ScaleType>('PERCENTAGE');
  const [passMark, setPassMark]   = useState('50');
  const [gpaMax, setGpaMax]       = useState('4.0');
  const [bands, setBands]         = useState<Band[]>(DEFAULT_BANDS.PERCENTAGE);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function selectScale(type: ScaleType) {
    setScaleType(type);
    setBands(DEFAULT_BANDS[type]);
  }

  function updateBand(i: number, field: keyof Band, value: string) {
    setBands(b => b.map((band, idx) => idx === i ? { ...band, [field]: value } : band));
  }

  function addBand() {
    setBands(b => [...b, { label: '', minScore: '', maxScore: '', remark: '' }]);
  }

  function removeBand(i: number) {
    setBands(b => b.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/grading', {
        scaleType,
        passmark:  scaleType === 'PERCENTAGE' ? parseFloat(passMark) : undefined,
        gpaMax:    scaleType === 'GPA' ? parseFloat(gpaMax) : undefined,
        bands: bands.map(b => ({
          label:    b.label,
          minScore: parseFloat(b.minScore),
          maxScore: parseFloat(b.maxScore),
          remark:   b.remark || null,
        })),
      });
      onNext();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save grading scale.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      title="Configure your grading scale"
      description="Raw scores are always stored. The display grade is derived at report time using this scale."
      footer={<WizardNav onBack={onBack} onSkip={onSkip} onNext={handleSave} loading={saving} nextLabel="Save & continue" />}
    >
      {/* Scale type selector */}
      <div className="grid grid-cols-2 gap-2 mb-6">
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

      {/* Extra config per type */}
      {scaleType === 'PERCENTAGE' && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-slate-600 font-medium">Pass mark:</label>
          <input
            type="number"
            value={passMark}
            onChange={e => setPassMark(e.target.value)}
            min={0} max={100}
            className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-800 outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
          <span className="text-sm text-slate-400">/ 100</span>
        </div>
      )}

      {scaleType === 'GPA' && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-slate-600 font-medium">GPA scale:</label>
          {['4.0', '5.0'].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setGpaMax(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                gpaMax === v ? 'text-white' : 'bg-slate-100 text-slate-600'
              }`}
              style={gpaMax === v ? { backgroundColor: 'var(--accent)' } : {}}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Grade bands table */}
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
              <input value={band.label}    onChange={e => updateBand(i, 'label',    e.target.value)} placeholder="A" className="col-span-3 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
              <input value={band.minScore} onChange={e => updateBand(i, 'minScore', e.target.value)} placeholder="0"  type="number" className="col-span-2 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
              <input value={band.maxScore} onChange={e => updateBand(i, 'maxScore', e.target.value)} placeholder="100" type="number" className="col-span-2 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
              <input value={band.remark}   onChange={e => updateBand(i, 'remark',   e.target.value)} placeholder="Optional" className="col-span-4 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none" onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'} onBlur={e => e.currentTarget.style.boxShadow=''} />
              <button type="button" onClick={() => removeBand(i)} className="col-span-1 text-slate-300 hover:text-red-400 transition text-lg leading-none justify-self-center">×</button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addBand}
          className="mt-3 text-sm transition"
          style={{ color: 'var(--accent)' }}
        >
          + Add band
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </WizardShell>
  );
}
