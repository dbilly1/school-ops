'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Input, Alert } from '@/components/ui/settings-card';
import type { ExpenseCategory } from './expense-form-modal';

export function ManageCategoriesModal({
  open, categories, endpointBase = '/school/finance', onClose, onChanged,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  endpointBase?: string;   // '/school/finance' | '/school/transport' | '/school/feeding'
  onClose: () => void;
  onChanged: () => void;   // refetch categories in the parent
}) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState('');
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  if (!open) return null;

  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    setAlert(null); setBusy(true);
    try {
      await fn();
      onChanged();
      if (successMsg) setAlert({ type: 'success', message: successMsg });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    await run(async () => { await staffApi.post(`${endpointBase}/expense-categories`, { name }); }, 'Category added.');
    setNewName('');
  }

  async function rename(id: string) {
    const name = editName.trim();
    if (!name) return;
    await run(async () => { await staffApi.patch(`${endpointBase}/expense-categories/${id}`, { name }); });
    setEditingId(null);
  }

  async function setArchived(id: string, isArchived: boolean) {
    await run(async () => { await staffApi.patch(`${endpointBase}/expense-categories/${id}`, { isArchived }); });
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? If it has expenses it will be archived instead.`)) return;
    await run(async () => {
      const res = await staffApi.delete<{ archived?: boolean; message?: string }>(`${endpointBase}/expense-categories/${id}`);
      if (res?.message) setAlert({ type: 'success', message: res.message });
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage categories" width="max-w-md">
      {alert && <div className="mb-3"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Add */}
      <div className="flex items-center gap-2 mb-4">
        <Input value={newName} placeholder="New category name"
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <button onClick={add} disabled={busy || !newName.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}>
          Add
        </button>
      </div>

      {/* List */}
      <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {categories.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No categories yet.</p>
        )}
        {categories.map(c => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2.5">
            {editingId === c.id ? (
              <>
                <Input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') rename(c.id); }} />
                <button onClick={() => rename(c.id)} disabled={busy}
                  className="text-xs font-semibold px-2 py-1.5 rounded-md text-white shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                  Save
                </button>
                <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 px-1 shrink-0">Cancel</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${c.isArchived ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {c.name}{c.isArchived && <span className="ml-2 text-[10px] uppercase tracking-wide no-underline">archived</span>}
                </span>
                <button onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 px-1.5">Rename</button>
                <button onClick={() => setArchived(c.id, !c.isArchived)} disabled={busy}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 px-1.5">
                  {c.isArchived ? 'Restore' : 'Archive'}
                </button>
                <button onClick={() => remove(c.id, c.name)} disabled={busy}
                  className="text-xs font-medium text-red-500 hover:text-red-700 px-1.5">Delete</button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-5">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Done
        </button>
      </div>
    </Modal>
  );
}
