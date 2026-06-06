'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { label: 'Fee Structures', href: '/school/finance/fee-structures' },
  { label: 'Invoices',       href: '/school/finance/invoices'       },
  { label: 'Outstanding',    href: '/school/finance/outstanding'    },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(tab => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active ? 'border-current' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
              style={active ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}>
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
