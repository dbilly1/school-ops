// Shared date-range presets — used by the Reports period bar and (potentially)
// the attendance coverage filter. Keep the resolution logic in one place.

export type Preset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'term' | 'custom';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'this-week',  label: 'This week' },
  { key: 'last-week',  label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'term',       label: 'Entire term' },
  { key: 'custom',     label: 'Custom' },
];

export function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 0 = Monday
  return x;
}

// Resolve a preset to a concrete {start, end}. End is clamped to today.
// "Entire term" needs the selected term's bounds.
export function presetRange(
  preset: Preset,
  custom: { start: string; end: string },
  term: { start: string | null; end: string | null },
): { start: string; end: string } {
  const now = new Date();
  const todayKey = localKey(now);
  switch (preset) {
    case 'this-week':
      return { start: localKey(mondayOf(now)), end: todayKey };
    case 'last-week': {
      const thisMon = mondayOf(now);
      const lastMon = new Date(thisMon); lastMon.setDate(lastMon.getDate() - 7);
      const lastSun = new Date(thisMon); lastSun.setDate(lastSun.getDate() - 1);
      return { start: localKey(lastMon), end: localKey(lastSun) };
    }
    case 'this-month':
      return { start: localKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: todayKey };
    case 'last-month':
      return {
        start: localKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: localKey(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'term':
      return { start: term.start ?? todayKey, end: term.end && term.end < todayKey ? term.end : todayKey };
    case 'custom':
      return { start: custom.start, end: custom.end };
  }
}
