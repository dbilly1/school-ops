'use client';

// Shared class-tab strip (matches the finance/feeding tab pattern). Horizontal
// scroll handles schools with many classes. Pass includeAll to prepend an
// "All Classes" tab (value ''); omit it for per-class pages that need a concrete
// class selected.
export function ClassTabs({
  classes,
  value,
  onChange,
  includeAll = false,
  allLabel = 'All Classes',
}: {
  classes: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  includeAll?: boolean;
  allLabel?: string;
}) {
  const tabs = includeAll ? [{ id: '', name: allLabel }, ...classes] : classes;
  if (tabs.length === 0) return null;

  return (
    <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto scrollbar-none">
      {tabs.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id || 'all'}
            onClick={() => onChange(c.id)}
            className="shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
            style={active
              ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
              : { color: '#64748b', borderColor: 'transparent' }}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
