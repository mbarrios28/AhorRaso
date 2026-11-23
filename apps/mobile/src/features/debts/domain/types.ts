import { z } from 'zod';

export type DebtStrategy = 'snowball' | 'avalanche';

function decimalField(label: string) {
  return z.string().trim().transform((value, ctx) => {
    const parts = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value);
    if (!parts) {
      ctx.addIssue({
        code: 'custom',
        message: value ? 'Ingresa un número con hasta dos decimales.' : `Ingresa ${label}.`,
      });
      return z.NEVER;
    }

    const units = Number(parts[1] + (parts[2] ?? '').padEnd(2, '0'));
    if (!Number.isSafeInteger(units)) {
      ctx.addIssue({ code: 'custom', message: 'El valor supera el límite admitido.' });
      return z.NEVER;
    }
    return units;
  });
}

export const createDebtSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa el nombre de la deuda.').max(80, 'Usa hasta 80 caracteres.'),
  outstandingBalanceCents: decimalField('el saldo pendiente').pipe(
    z.number().positive('El saldo pendiente debe ser mayor que cero.'),
  ),
  annualInterestRateBps: decimalField('la tasa anual'),
  minimumPaymentCents: decimalField('el pago mínimo'),
}).refine(({ minimumPaymentCents, outstandingBalanceCents }) =>
  minimumPaymentCents <= outstandingBalanceCents, {
  path: ['minimumPaymentCents'],
  message: 'El pago mínimo no puede superar el saldo pendiente.',
});

export type CreateDebtInput = z.input<typeof createDebtSchema>;

export function formatDebtDecimal(units: number): string {
  const digits = String(units).padStart(3, '0');
  return `${digits.slice(0, -2)},${digits.slice(-2)}`;
}
