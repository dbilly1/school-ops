'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Modal } from '@/components/ui/modal';
import { Input, Alert } from '@/components/ui/settings-card';
import type { ExpenseCategory, TermOption } from './expense-form-modal';

type Budget = { categoryId: string; amount: number };

export function BudgetEditorModal({
  open, categories, termId, termName, onClose, onSaved,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  termId: string;
  termName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const live = categories.filter(c => !c.isArchived);

  const fetchBudgets = useCallback(
    () => termId ? staffApi.get<Budget[]>(`/school/finance/expense-budgets?termId=${termId}`).catch(() => []) : Promise.resolve([]),
    [termId],
  );
  const { data: budgets, loading } = useApi(fetchBudgets, `${open}|${termId}`);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Seed inputs from fetched budgets once they arrive (keyed on open+term).
  const seedKey = `${open ? '1' : '0'}:${termId}:${budgets ? 'd' : 'l'}`;
  const [lastSeed, setLastSeed] = useState('');
  if (open && budgets && seedKey !== lastSeed) {
    setLastSeed(seedKey);
    const map: Record<string, string> = {};
    for (const b of budgets) map[b.categoryId] = String(b.amount);
    setAmounts(map);
    setAlert(null);
  }

  if (!open) return null;

  async function save() {
    setAlert(null); setSaving(true);
    const cells = live.map(c => ({ categoryId: c.id, amount: parseFloat(amounts[c.id] || '0') || 0 }));
    try {
      await staffApi.post('/school/finance/expense-budgets', { termId, cells });
      onSaved();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save budgets.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Budgets — ${termName}`} width="max-w-md">
      {alert && <div className="mb-3"><Alert type={alert.type} message={alert.message} /></div>}
      <p className="text-xs text-slate-500 mb-4">Set a spending budget per category for this term. Leave blank or 0 for no budget.</p>

      <div className="space-y-2.5 max-h-80 overflow-y-auto">
        {loading && <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>}
        {!loading && live.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No active categories.</p>}
        {!loading && live.map(c => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-700">{c.name}</span>
            <div className="w-40">
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                value={amounts[c.id] ?? ''}
                onChange={e => setAmounts(a => ({ ...a, [c.id]: e.target.value }))} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}>
          {saving ? 'Saving…' : 'Save budgets'}
        </button>
      </div>
    </Modal>
  );
}
