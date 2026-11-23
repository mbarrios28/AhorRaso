import * as Crypto from 'expo-crypto';
import { eq } from 'drizzle-orm';
import { db, debts, type Debt } from '@/core/db';
import { createDebtSchema, type CreateDebtInput } from '../domain/types';

export const debtsRepository = {
  create(userId: string, input: CreateDebtInput): Debt {
    const values = createDebtSchema.parse(input);
    const debt = {
      ...values,
      id: Crypto.randomUUID(),
      userId,
      createdAt: new Date().toISOString(),
    };
    db.insert(debts).values(debt).run();
    return debt;
  },

  list(userId: string): Debt[] {
    return db.select().from(debts).where(eq(debts.userId, userId)).all();
  },
};
