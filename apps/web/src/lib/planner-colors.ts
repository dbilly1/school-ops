// Planner task colours. A small, friendly palette — keys are stored on the
// PlannerEntry (`color`); class names are written out in full so Tailwind keeps
// them in the build (no dynamic class construction).

export const PLANNER_PALETTE = {
  slate:   { label: 'Slate',   dot: 'bg-slate-400',   bar: 'bg-slate-300',   swatch: 'bg-slate-400'   },
  emerald: { label: 'Green',   dot: 'bg-emerald-500', bar: 'bg-emerald-400', swatch: 'bg-emerald-500' },
  blue:    { label: 'Blue',    dot: 'bg-blue-500',    bar: 'bg-blue-400',    swatch: 'bg-blue-500'    },
  amber:   { label: 'Amber',   dot: 'bg-amber-500',   bar: 'bg-amber-400',   swatch: 'bg-amber-500'   },
  rose:    { label: 'Rose',    dot: 'bg-rose-500',    bar: 'bg-rose-400',    swatch: 'bg-rose-500'    },
  violet:  { label: 'Violet',  dot: 'bg-violet-500',  bar: 'bg-violet-400',  swatch: 'bg-violet-500'  },
} as const;

export type PlannerColor = keyof typeof PLANNER_PALETTE;
export const PLANNER_COLOR_KEYS = Object.keys(PLANNER_PALETTE) as PlannerColor[];

export function plannerStyle(color?: string | null) {
  return (color && color in PLANNER_PALETTE) ? PLANNER_PALETTE[color as PlannerColor] : null;
}
