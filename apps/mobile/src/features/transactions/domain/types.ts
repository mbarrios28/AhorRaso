import { z } from 'zod';
import { Transaction } from '@/core/db';

export const paymentMethodSchema = z.enum(['cash', 'digital']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const createExpenseSchema = z.object({
  amountCents: z.number().int().positive('El monto debe ser mayor a 0'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  categoryId: z.string().min(1, 'La categoría es obligatoria'),
  merchantName: z.string().trim().max(80, 'Máximo 80 caracteres').optional(),
  paymentMethod: paymentMethodSchema,
  note: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  entryMethod: z.enum(['manual', 'voice']).default('manual'),
});

export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export const createIncomeSchema = z.object({
  amountCents: z.number().int().positive('El monto debe ser mayor a 0'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  categoryId: z.string().min(1, 'La categoría es obligatoria'),
  source: z
    .string()
    .trim()
    .min(1, 'La fuente del ingreso es obligatoria')
    .max(100, 'Máximo 100 caracteres'),
  note: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  entryMethod: z.enum(['manual', 'voice']).default('manual'),
});

export type CreateIncomeInput = z.input<typeof createIncomeSchema>;

export interface ParsedVoiceExpense {
  amountCents: number;
  categoryName?: string;
  categoryId?: string;
  merchantName?: string;
  paymentMethod: PaymentMethod;
  note?: string;
  occurredOn: string; // YYYY-MM-DD
  confidence: number;
  rawSegment: string;
}

export type { Transaction };

