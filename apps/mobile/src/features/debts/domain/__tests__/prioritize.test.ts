import type { Debt } from '@/core/db/schema';
import type { DebtStrategy } from '../types';
import { prioritizeDebts } from '../prioritize';

function debt(id: string, balance: number, rate: number, date = '2026-01-01T00:00:00.000Z'): Debt {
  return {
    id,
    name: id,
    userId: 'test-user',
    outstandingBalanceCents: balance,
    annualInterestRateBps: rate,
    minimumPaymentCents: 0,
    createdAt: date,
  };
}

const strategies: DebtStrategy[] = ['snowball', 'avalanche'];

describe('priorización de deudas', () => {
  it('produce órdenes diferentes y no modifica la entrada', () => {
    const input = Object.freeze([debt('alta', 200, 1500), debt('baja', 100, 0)]);
    expect(prioritizeDebts(input, 'snowball').map(({ id }) => id)).toEqual(['baja', 'alta']);
    expect(prioritizeDebts(input, 'avalanche').map(({ id }) => id)).toEqual(['alta', 'baja']);
    expect(input.map(({ id }) => id)).toEqual(['alta', 'baja']);
  });

  it('desempata por tasa en bola de nieve y por saldo en avalancha', () => {
    const input = [debt('a', 100, 0), debt('b', 100, 100), debt('c', 80, 100)];
    expect(prioritizeDebts(input, 'snowball').map(({ id }) => id)).toEqual(['c', 'b', 'a']);
    expect(prioritizeDebts(input, 'avalanche').map(({ id }) => id)).toEqual(['c', 'b', 'a']);
  });

  it.each(strategies)('desempata por fecha y luego UUID con %s', (strategy) => {
    const input = [debt('c', 100, 0), debt('b', 100, 0), debt('z', 100, 0, '2025-12-31T00:00:00.000Z')];
    expect(prioritizeDebts(input, strategy).map(({ id }) => id)).toEqual(['z', 'b', 'c']);
    expect(prioritizeDebts([...input].reverse(), strategy)).toEqual(prioritizeDebts(input, strategy));
  });

  it.each(strategies)('admite cero o una deuda con %s', (strategy) => {
    const input = [debt('única', 100, 0)];
    expect(prioritizeDebts([], strategy)).toEqual([]);
    expect(prioritizeDebts(input, strategy)).toEqual(input);
    expect(prioritizeDebts(input, strategy)).not.toBe(input);
  });
});
