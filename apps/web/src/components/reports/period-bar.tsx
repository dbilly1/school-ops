'use client';

import { PRESETS, type Preset } from '@/lib/date-range';
import { cn } from '@/lib/cn';

export type PeriodTerm = { id: string; name: string; isActive?: boolean; startDate?: string | null; endDate?: string | null };
export type PeriodYear = { id: string; name: string; isActive?: boolean; terms?: PeriodTerm[] };
export type ReportPeriod = {
  academicYearId: string;
  termId: string;
  range: { start: string; end: string };
};

const field = 'px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none';

// All presets as pills (md+), collapsing to a dropdown below md. Custom reveals
// two date inputs. Mirrors the attendance-coverage range control.
function RangeControl({ preset, onPreset, custom, onCustom, termAvailable }: {
  preset: Preset;
  onPreset: (p: Preset) => void;
  custom: { start: string; end: string };
  onCustom: (c: { start: string; end: string }) => void;
  termAvailable: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const small = 'px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none';
  const presets = PRESETS.filter(p => p.key !== 'term' || termAvailable);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={custom.start} max={today}
            onChange={e => onCustom({ ...custom, start: e.target.value })} className={small} />
          <span className="text-xs text-slate-400">–</span>
          <input type="date" value={custom.end} max={today}
            onChange={e => onCustom({ ...custom, end: e.target.value })} className={small} />
        </div>
      )}

      <div className="hidden md:flex flex-wrap gap-1.5">
        {presets.map(p => {
          const active = preset === p.key;
          return (
            <button key={p.key} type="button" onClick={() => onPreset(p.key)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition whitespace-nowrap',
                active ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              style={active ? { backgroundColor: 'var(--accent)' } : undefined}>
              {p.label}
            </button>
          );
        })}
      </div>

      <select value={preset} onChange={e => onPreset(e.target.value as Preset)}
        className={cn(small, 'md:hidden font-medium cursor-pointer pr-7')}>
        {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
    </div>
  );
}

// Controlled period bar — Academic Year + Term + date-range presets. The parent
// owns the selections and derives the resolved range via presetRange().
// `mode` tunes which controls are relevant to the active tab (purely cosmetic
// emphasis — all controls stay visible so switching tabs keeps one filter row).
export function PeriodBar({
  years, yearId, termId, preset, custom, termAvailable,
  onYear, onTerm, onPreset, onCustom,
}: {
  years: PeriodYear[] | null;
  yearId: string;
  termId: string;
  preset: Preset;
  custom: { start: string; end: string };
  termAvailable: boolean;
  onYear: (id: string) => void;
  onTerm: (id: string) => void;
  onPreset: (p: Preset) => void;
  onCustom: (c: { start: string; end: string }) => void;
}) {
  const terms = years?.find(y => y.id === yearId)?.terms ?? [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
      <select value={yearId} onChange={e => onYear(e.target.value)} className={field}>
        {!yearId && <option value="">Select year…</option>}
        {years?.map(y => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (Active)' : ''}</option>)}
      </select>

      <select value={termId} onChange={e => onTerm(e.target.value)} className={field}>
        {!termId && <option value="">Select term…</option>}
        {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
      </select>

      <div className="ml-auto">
        <RangeControl preset={preset} onPreset={onPreset} custom={custom} onCustom={onCustom} termAvailable={termAvailable} />
      </div>
    </div>
  );
}
