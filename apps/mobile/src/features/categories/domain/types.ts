import { z } from 'zod';
import { Category } from '@/core/db';

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(40, 'Máximo 40 caracteres'),
  type: z.enum(['income', 'expense']),
  icon: z.string().min(1, 'El icono es obligatorio'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato hexadecimal inválido (#RRGGBB)'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export type { Category };
