'use client';

import { useState, useEffect } from 'react';
import { staffApi } from '@/lib/api';

// The saved end-of-day cash count for a day (shape from getDailyReconciliation
// → cashCount, and the POST /cash-count response).
export type CashCount = {
  date: string;
  expectedCash: number;
  countedCash: number;
  variance: number;
  cashCollected: number;
  cashPaidOut: number;
  note: string | null;
  reconciledBy: string | null;
  recordedAt: string;
};

function fmt(n: number) {
  return Number(n).toFixed(2);
}

/**
 * "Close the day" card — sits beside the expected-cash breakdown on a stream's
 * Reconciliation page. The officer counts the physical cash, enters it, and the
 * card surfaces whether the drawer balanced (or is over/short) so they can
 * recheck before recording. Submitting persists a snapshot for the audit trail.
 */
export function CashCountCard({
  endpointBase,
  date,
  expected,
  existing,
  onRecorded,
}: {
  endpointBase: string;          // '/school/transport-fees' | '/school/feeding'
  date: string;                  // YYYY-MM-DD
  expected: number;              // current expectedCashInHand
  existing: CashCount | null;    // a previously recorded count for this date
  onRecorded: () => void;        // refetch the reconciliation
}) {
  const [counted, setCounted] = useState('');
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Reset the form whenever the day (or its saved count) changes.
  useEffect(() => {
    setCounted(existing ? String(existing.countedCash) : '');
    setNote(existing?.note ?? '');
    setError('');
  }, [date, existing]);

  const parsed = counted.trim() === '' ? null : Number(counted);
  const valid  = parsed !== null && Number.isFinite(parsed) && parsed >= 0;
  const variance = valid ? (parsed as number) - expected : 0;
  const status: 'balanced' | 'over' | 'short' =
    Math.abs(variance) < 0.005 ? 'balanced' : variance > 0 ? 'over' : 'short';

  // The expected figure can drift after a count is recorded (a late expense or
  // payment). Flag it so the officer knows to re-record against the new total.
  const stale = !!existing && Math.abs(existing.expectedCash - expected) >= 0.005;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      await staffApi.post(`${endpointBase}/cash-count`, { date, countedCash: parsed, note: note.trim() || undefined });
      onRecorded();
    } catch {
      setError('Could not save the cash count. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const statusColor = status === 'balanced' ? '#22c55e' : status === 'over' ? '#3b82f6' : '#ef4444';
  const statusBg    = status === 'balanced' ? '#f0fdf4' : status === 'over' ? '#eff6ff' : '#fef2f2';
  const statusLabel = status === 'balanced'
    ? 'Balances ✓'
    : `${status === 'over' ? 'Over' : 'Short'} by GHS ${fmt(Math.abs(variance))}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Count the drawer</h3>
      <p className="text-xs text-slate-500 mb-4">
        Enter the actual cash counted in hand. It’s checked against the expected figure.
      </p>

      <label className="block text-xs font-medium text-slate-500 mb-1">Actual cash counted (GHS)</label>
      <input
        type="number" inputMode="decimal" min={0} step="0.01"
        value={counted} onChange={e => setCounted(e.target.value)}
        placeholder="0.00"
        className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none mb-3"
        onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
        onBlur={e => e.currentTarget.style.boxShadow = ''} />

      {valid && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg mb-3"
          style={{ backgroundColor: statusBg }}>
          <span className="text-xs font-medium text-slate-500">Difference vs expected</span>
          <span className="text-sm font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      )}

      {valid && status !== 'balanced' && (
        <p className="text-xs text-slate-500 mb-3">
          Recheck your cash, or record it as-is — the {status === 'over' ? 'surplus' : 'shortage'} is kept on the day’s record.
        </p>
      )}

      <input
        type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none mb-3"
        onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
        onBlur={e => e.currentTarget.style.boxShadow = ''} />

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <button onClick={submit} disabled={!valid || saving}
        className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)' }}>
        {saving ? 'Saving…' : existing ? 'Update count' : 'Record count'}
      </button>

      {existing && (
        <p className="text-xs text-slate-400 mt-3">
          Last recorded: GHS {fmt(existing.countedCash)} counted
          {existing.reconciledBy ? ` by ${existing.reconciledBy}` : ''} ·{' '}
          {new Date(existing.recordedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {stale && (
        <p className="text-xs text-amber-600 mt-2">
          Expected has changed since this was recorded (was GHS {fmt(existing!.expectedCash)}, now GHS {fmt(expected)}). Re-record to update the day’s figures.
        </p>
      )}
    </div>
  );
}
