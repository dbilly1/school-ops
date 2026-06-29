'use client';

import { ExpensesPanel } from '@/components/finance/expenses-panel';

export default function TransportExpensesPage() {
  return (
    <ExpensesPanel
      endpointBase="/school/transport"
      ownCenter="TRANSPORT"
      perm={{ featureKey: 'transport' }}
      summaryEndpoint="/school/transport/expense-summary"
      streamLabel="Transport"
    />
  );
}
