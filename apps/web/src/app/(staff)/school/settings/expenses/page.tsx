'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SettingsCard, Alert, SaveButton } from '@/components/ui/settings-card';

type ExpenseMode = 'UNIFIED' | 'SEPARATED';

const MODES: { key: ExpenseMode; label: string; blurb: string }[] = [
  {
    key: 'SEPARATED',
    label: 'Separated',
    blurb: 'Feeding and transport are run separately. Their expenses live only on their own pages, and the General Expenses page shows school-wide (general) expenses only.',
  },
  {
    key: 'UNIFIED',
    label: 'Unified',
    blurb: 'One person manages all funds. The General Expenses page pools everything — general, feeding and transport expenses together. Feeding and transport still have their own pages for entry.',
  },
];

export default function ExpenseModeSettingsPage() {
  const fetchMode = useCallback(() =>
    staffApi.get<{ mode: ExpenseMode }>('/school/finance/expense-mode').then(r => r.mode),
    [],
  );
  const { data: saved, loading } = useApi(fetchMode);

  const [mode, setMode]   = useState<ExpenseMode>('SEPARATED');
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  useEffect(() => { if (saved) setMode(saved); }, [saved]);

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.patch('/school/finance/expense-mode', { mode });
      setAlert({ type: 'success', message: 'Expense mode saved.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Expenses</h2>
        <p className="text-sm text-slate-500 mt-0.5">Choose how the General Expenses page treats feeding and transport spending.</p>
      </div>

      <SettingsCard title="Expense mode" footer={<SaveButton loading={saving} onClick={save} />}>
        {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

        <div className="space-y-3">
          {MODES.map(m => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`w-full text-left p-4 rounded-xl border transition ${active ? 'border-transparent ring-2' : 'border-slate-200 hover:border-slate-300'}`}
                style={active ? { boxShadow: '0 0 0 2px var(--accent)' } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <span className="relative shrink-0 w-4 h-4 rounded-full border-2"
                    style={{ borderColor: active ? 'var(--accent)' : '#cbd5e1' }}>
                    {active && <span className="absolute inset-0.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{m.label}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 ml-[26px]">{m.blurb}</p>
              </button>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
