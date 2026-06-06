'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { WizardShell, WizardNav } from './wizard-shell';

const SUGGESTIONS = ['Day', 'Boarding', 'International', 'New Entrant', 'Returning'];

export function StepCategories({
  onNext, onBack, onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [categories, setCategories] = useState<string[]>(['Day']);
  const [input, setInput]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  function addCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setCategories(c => [...c, trimmed]);
    setInput('');
  }

  function removeCategory(name: string) {
    setCategories(c => c.filter(x => x !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addCategory(input); }
  }

  async function handleSave() {
    if (categories.length === 0) { onNext(); return; }
    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/student-categories/bulk', { names: categories });
      onNext();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save categories.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      title="Student categories"
      description="Define the types of students at your school. Fee structures are set per category, so be specific."
      footer={<WizardNav onBack={onBack} onSkip={onSkip} onNext={handleSave} loading={saving} nextLabel="Save & continue" />}
    >
      {/* Current categories */}
      <div className="flex flex-wrap gap-2 mb-4 min-h-10">
        {categories.map(cat => (
          <div
            key={cat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <span>{cat}</span>
            <button
              type="button"
              onClick={() => removeCategory(cat)}
              className="text-white/70 hover:text-white transition text-base leading-none"
            >
              ×
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-slate-400 italic">No categories added yet</p>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a category name and press Enter"
          className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none transition"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        <button
          type="button"
          onClick={() => addCategory(input)}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
        >
          Add
        </button>
      </div>

      {/* Suggestions */}
      <div className="mt-4">
        <p className="text-xs text-slate-400 mb-2">Common categories:</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.filter(s => !categories.includes(s)).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addCategory(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </WizardShell>
  );
}
