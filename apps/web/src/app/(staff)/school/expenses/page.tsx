'use client';

import { ExpensesPanel } from '@/components/finance/expenses-panel';

export default function ExpensesPage() {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Expenses</h2>
        <p className="text-sm text-slate-500 mt-0.5">School outflow — salaries, utilities, supplies and more.</p>
      </div>

      {/* What this page includes (General only, or all streams pooled) is driven
          by the school's Expense Mode setting — see Settings → Expenses. */}
      <ExpensesPanel
        endpointBase="/school/finance"
        ownCenter="GENERAL"
        perm={{ featureKey: 'finance', subFeatureKey: 'expense_management' }}
        showBudgets
      />
    </div>
  );
}
