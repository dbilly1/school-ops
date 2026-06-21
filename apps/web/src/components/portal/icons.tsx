import { cn } from '@/lib/cn';

// Inline stroke icons (Feather/Lucide-style) — no icon-library dependency, and
// they inherit currentColor so the school accent flows through.

export type PortalIconName =
  | 'home' | 'attendance' | 'timetable' | 'grades' | 'reports'
  | 'notices' | 'transport' | 'feeding' | 'logout';

const PATHS: Record<PortalIconName, string> = {
  home:       'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  attendance: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M9 16l2 2 4-4',
  timetable:  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  grades:     'M3 3v18h18 M7 15l3-3 3 2 5-6',
  reports:    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  notices:    'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  transport:  'M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  feeding:    'M3 2v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2 M5 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2z M16 22V15',
  logout:     'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
};

export function PortalIcon({ name, className, style }: { name: PortalIconName; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={cn('w-[18px] h-[18px] shrink-0', className)}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
