import { PortalIcon, type PortalIconName } from './icons';

// Consistent empty/zero-data panel used across the portal pages.
export function EmptyState({
  icon, title, subtitle,
}: {
  icon: PortalIconName;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 px-4 py-12 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
        <PortalIcon name={icon} className="w-6 h-6" />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">{subtitle}</p>}
    </div>
  );
}
