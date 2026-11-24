import { ZodError } from 'zod';
import { DEV_USER_ID } from '@/core/dev/constants';
import { sqliteDb } from '@/core/db';
import { countRows, OTHER_USER_ID, resetDatabase } from '../../../../../test/helpers/test-db';
import { debtsRepository } from '../debts.repository';

const input = {
  name: 'Préstamo',
  outstandingBalanceCents: '19,99',
  annualInterestRateBps: '4.01',
  minimumPaymentCents: '0.07',
};

describe('debtsRepository', () => {
  beforeEach(() => resetDatabase());

  it('guarda y recupera los valores exactos sin afectar el perfil, historial ni outbox', () => {
    const profile = sqliteDb.getAllSync('SELECT * FROM profile');
    const created = debtsRepository.create(DEV_USER_ID, input);
    expect(created).toMatchObject({
      id: expect.stringMatching(/^[\da-f-]{36}$/),
      createdAt: expect.stringMatching(/Z$/),
      userId: DEV_USER_ID,
      outstandingBalanceCents: 1999,
      annualInterestRateBps: 401,
      minimumPaymentCents: 7,
    });
    expect(debtsRepository.list(DEV_USER_ID)).toEqual([created]);
    expect(countRows('transactions')).toBe(0);
    expect(countRows('outbox')).toBe(0);
    expect(sqliteDb.getAllSync('SELECT * FROM profile')).toEqual(profile);
  });

  it('lista exclusivamente las deudas del propietario solicitado', () => {
    const first = debtsRepository.create(DEV_USER_ID, input);
    const other = debtsRepository.create(OTHER_USER_ID, input);
    expect(debtsRepository.list(DEV_USER_ID)).toEqual([first]);
    expect(debtsRepository.list(OTHER_USER_ID)).toEqual([other]);
    expect(debtsRepository.list('usuario sin deudas')).toEqual([]);
  });

  it('rechaza una deuda inválida sin insertar una fila parcial', () => {
    expect(() => debtsRepository.create(DEV_USER_ID, { ...input, annualInterestRateBps: '' })).toThrow(ZodError);
    expect(countRows('debts')).toBe(0);
  });
});
