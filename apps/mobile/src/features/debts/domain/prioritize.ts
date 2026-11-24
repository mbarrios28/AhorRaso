import type { Debt } from '@/core/db/schema';
import type { DebtStrategy } from './types';

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a === b ? 0 : 1;
}

export function prioritizeDebts(debts: readonly Debt[], strategy: DebtStrategy): Debt[] {
  return [...debts].sort((a, b) => {
    const byBalance = a.outstandingBalanceCents - b.outstandingBalanceCents;
    const byRate = b.annualInterestRateBps - a.annualInterestRateBps;
    const byStrategy = strategy === 'snowball' ? byBalance || byRate : byRate || byBalance;
    return byStrategy || compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id);
  });
}
