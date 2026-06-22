// Planner task colours. A small, friendly palette — keys are stored on the
// PlannerEntry (`color`); class names are written out in full so Tailwind keeps
// them in the build (no dynamic class construction).

// `fill`/`text` tint the whole task cell; `dot`/`swatch` are the solid accents
// used in pickers and small indicators. All class names written out in full so
// Tailwind keeps them in the build.
export const PLANNER_PALETTE = {
  slate:   { label: 'Slate',   dot: 'bg-slate-400',   swatch: 'bg-slate-400',   fill: 'bg-slate-100',   text: 'text-slate-700'   },
  emerald: { label: 'Green',   dot: 'bg-emerald-500', swatch: 'bg-emerald-500', fill: 'bg-emerald-100', text: 'text-emerald-800' },
  blue:    { label: 'Blue',    dot: 'bg-blue-500',    swatch: 'bg-blue-500',    fill: 'bg-blue-100',    text: 'text-blue-800'    },
  amber:   { label: 'Amber',   dot: 'bg-amber-500',   swatch: 'bg-amber-500',   fill: 'bg-amber-100',   text: 'text-amber-900'   },
  rose:    { label: 'Rose',    dot: 'bg-rose-500',    swatch: 'bg-rose-500',    fill: 'bg-rose-100',    text: 'text-rose-800'    },
  violet:  { label: 'Violet',  dot: 'bg-violet-500',  swatch: 'bg-violet-500',  fill: 'bg-violet-100',  text: 'text-violet-800'  },
} as const;

export type PlannerColor = keyof typeof PLANNER_PALETTE;
export const PLANNER_COLOR_KEYS = Object.keys(PLANNER_PALETTE) as PlannerColor[];

export function plannerStyle(color?: string | null) {
  return (color && color in PLANNER_PALETTE) ? PLANNER_PALETTE[color as PlannerColor] : null;
}
