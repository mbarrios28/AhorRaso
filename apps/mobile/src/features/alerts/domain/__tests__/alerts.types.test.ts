import {
  updateNotificationPrefsSchema,
  parseThresholdsSafely,
  DEFAULT_ALERT_THRESHOLDS,
  toAlertValidationError,
} from '../types';
import { AlertError } from '../errors';

describe('updateNotificationPrefsSchema', () => {
  it('valida preferencias válidas con umbrales canónicos', () => {
    const input = {
      enabled: true,
      thresholds: [50, 80, 100],
      channelInApp: true,
      channelPush: false,
    };

    const result = updateNotificationPrefsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thresholds).toEqual([50, 80, 100]);
    }
  });

  it('ordena y elimina umbrales duplicados automáticamente', () => {
    const input = {
      enabled: true,
      thresholds: [100, 50, 80, 50],
      channelInApp: true,
      channelPush: false,
    };

    const result = updateNotificationPrefsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thresholds).toEqual([50, 80, 100]);
    }
  });

  it('rechaza umbrales fuera del rango permitido (1% a 200%)', () => {
    const invalidZero = updateNotificationPrefsSchema.safeParse({
      enabled: true,
      thresholds: [0, 80],
      channelInApp: true,
      channelPush: false,
    });
    expect(invalidZero.success).toBe(false);

    const invalidTooHigh = updateNotificationPrefsSchema.safeParse({
      enabled: true,
      thresholds: [50, 250],
      channelInApp: true,
      channelPush: false,
    });
    expect(invalidTooHigh.success).toBe(false);
  });

  it('rechaza lista vacía de umbrales', () => {
    const emptyList = updateNotificationPrefsSchema.safeParse({
      enabled: true,
      thresholds: [],
      channelInApp: true,
      channelPush: false,
    });
    expect(emptyList.success).toBe(false);
  });
});

describe('parseThresholdsSafely (Protección con valor por defecto RNF-010)', () => {
  it('parsea correctamente JSON válido', () => {
    const parsed = parseThresholdsSafely('[50, 80, 100]');
    expect(parsed).toEqual([50, 80, 100]);
  });

  it('retorna valor por defecto [50, 80, 100] ante JSON corrupto o malformado', () => {
    const result1 = parseThresholdsSafely('{corrupted_json');
    expect(result1).toEqual([...DEFAULT_ALERT_THRESHOLDS]);

    const result2 = parseThresholdsSafely('not_a_json');
    expect(result2).toEqual([...DEFAULT_ALERT_THRESHOLDS]);
  });

  it('retorna valor por defecto ante valores nulos, vacíos o indefinidos', () => {
    expect(parseThresholdsSafely(null)).toEqual([...DEFAULT_ALERT_THRESHOLDS]);
    expect(parseThresholdsSafely(undefined)).toEqual([...DEFAULT_ALERT_THRESHOLDS]);
    expect(parseThresholdsSafely('')).toEqual([...DEFAULT_ALERT_THRESHOLDS]);
  });

  it('retorna valor por defecto si el JSON contiene números inválidos (menores a 1 o mayores a 200)', () => {
    const parsed = parseThresholdsSafely('[-10, 0, 500]');
    expect(parsed).toEqual([...DEFAULT_ALERT_THRESHOLDS]);
  });
});

describe('toAlertValidationError', () => {
  it('convierte un error de Zod a AlertError con código VALIDATION', () => {
    const result = updateNotificationPrefsSchema.safeParse({
      enabled: 'not-a-bool',
      thresholds: [],
    });
    if (!result.success) {
      const err = toAlertValidationError(result.error);
      expect(err).toBeInstanceOf(AlertError);
      expect(err.code).toBe('VALIDATION');
    }
  });
});
