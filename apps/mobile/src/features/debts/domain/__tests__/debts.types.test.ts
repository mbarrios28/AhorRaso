import { createDebtSchema, formatDebtDecimal } from '../types';

const valid = {
  name: '  Préstamo  ',
  outstandingBalanceCents: ' 32,07 ',
  annualInterestRateBps: '19.15',
  minimumPaymentCents: '0.01',
};

describe('validación de deudas', () => {
  it('convierte ambos separadores a enteros exactos', () => {
    expect(createDebtSchema.parse(valid)).toEqual({
      name: 'Préstamo',
      outstandingBalanceCents: 3207,
      annualInterestRateBps: 1915,
      minimumPaymentCents: 1,
    });
  });

  it('admite tasa y pago mínimo cero si se ingresan explícitamente', () => {
    expect(createDebtSchema.parse({ ...valid, annualInterestRateBps: '0', minimumPaymentCents: '0,00' }))
      .toMatchObject({ annualInterestRateBps: 0, minimumPaymentCents: 0 });
  });

  it.each([
    ['name', '  '],
    ['name', 'a'.repeat(81)],
    ['outstandingBalanceCents', ''],
    ['outstandingBalanceCents', '0'],
    ['outstandingBalanceCents', '-1'],
    ['outstandingBalanceCents', '1,002'],
    ['outstandingBalanceCents', 'Infinity'],
    ['outstandingBalanceCents', '90071992547409.92'],
    ['outstandingBalanceCents', '1.000,00'],
    ['annualInterestRateBps', ''],
    ['annualInterestRateBps', '-0.01'],
    ['annualInterestRateBps', '1e2'],
    ['annualInterestRateBps', '1.2 %'],
    ['minimumPaymentCents', ''],
    ['minimumPaymentCents', '-1'],
    ['minimumPaymentCents', '32.08'],
  ])('rechaza %s con valor %s', (field, value) => {
    expect(createDebtSchema.safeParse({ ...valid, [field]: value }).error?.issues)
      .toContainEqual(expect.objectContaining({ path: [field] }));
  });

  it('puede almacenar y mostrar el máximo entero seguro sin redondear', () => {
    const debt = createDebtSchema.parse({ ...valid, outstandingBalanceCents: '90071992547409.91' });
    expect(debt.outstandingBalanceCents).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatDebtDecimal(debt.outstandingBalanceCents)).toBe('90071992547409,91');
  });
});
