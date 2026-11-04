import { SavingsFrequency, SavingsSimulationResult } from './types';

/**
 * Formatea una instancia Date a 'YYYY-MM-DD' en tiempo local evitando desfasajes de zona horaria.
 */
export function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parsea un string 'YYYY-MM-DD' o Date a Date local a las 00:00:00.
 */
export function parseLocalReferenceDate(ref: string | Date = new Date()): Date {
  if (typeof ref === 'string') {
    const [y, m, d] = ref.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d);
    }
    const parsed = new Date(ref);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
}

/**
 * Suma meses a una fecha respetando los días de cierre de mes (evita saltos por meses de 28/30/31 días).
 */
export function addMonths(date: Date, count: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const originalDay = date.getDate();
  result.setMonth(result.getMonth() + count);

  // Si el mes resultante saltó más allá del objetivo (ej. 31 de enero + 1 mes -> marzo)
  if (result.getDate() !== originalDay) {
    result.setDate(0); // Último día del mes anterior
  }
  return result;
}

export interface CalculateSavingsSimulationParams {
  targetAmountCents: number;
  currentAmountCents?: number;
  periodicSavingsCents: number;
  frequency: SavingsFrequency;
  startDate?: Date | string;
}

/**
 * Función pura de simulación de proyección de ahorro (HU-08 / RF-014).
 *
 * Calcula reactivamente:
 * - El saldo restante requerido para la meta.
 * - El número de periodos (semanas, quincenas o meses) necesarios según la cuota periódica.
 * - La fecha estimada de cumplimiento proyectada partiendo de la fecha de inicio.
 * - El porcentaje de avance acumulado actual.
 */
export function calculateSavingsSimulation({
  targetAmountCents,
  currentAmountCents = 0,
  periodicSavingsCents,
  frequency,
  startDate = new Date(),
}: CalculateSavingsSimulationParams): SavingsSimulationResult {
  const start = parseLocalReferenceDate(startDate);
  const current = Math.max(0, currentAmountCents);
  const target = Math.max(0, targetAmountCents);
  const periodic = Math.max(0, periodicSavingsCents);

  const remaining = Math.max(0, target - current);
  const isCompleted = target > 0 && remaining === 0;

  let progressPercentage = 0;
  if (target > 0) {
    progressPercentage = Math.min(100, Math.floor((current / target) * 100));
  }

  // Caso: Meta ya alcanzada o sin saldo restante
  if (remaining === 0) {
    return {
      targetAmountCents: target,
      currentAmountCents: current,
      remainingAmountCents: 0,
      periodicSavingsCents: periodic,
      frequency,
      periodsNeeded: 0,
      estimatedDate: formatDateToYMD(start),
      progressPercentage: 100,
      isCompleted: true,
    };
  }

  // Caso: Ahorro periódico no configurado o cero
  if (periodic === 0) {
    return {
      targetAmountCents: target,
      currentAmountCents: current,
      remainingAmountCents: remaining,
      periodicSavingsCents: 0,
      frequency,
      periodsNeeded: 0,
      estimatedDate: formatDateToYMD(start),
      progressPercentage,
      isCompleted: false,
    };
  }

  // Número exacto de cuotas/periodos requeridos redondeados hacia arriba
  const periodsNeeded = Math.ceil(remaining / periodic);

  const estimated = new Date(start.getTime());
  if (frequency === 'weekly') {
    estimated.setDate(estimated.getDate() + periodsNeeded * 7);
  } else if (frequency === 'biweekly') {
    estimated.setDate(estimated.getDate() + periodsNeeded * 14);
  } else if (frequency === 'monthly') {
    const monthlyDate = addMonths(start, periodsNeeded);
    estimated.setTime(monthlyDate.getTime());
  }

  return {
    targetAmountCents: target,
    currentAmountCents: current,
    remainingAmountCents: remaining,
    periodicSavingsCents: periodic,
    frequency,
    periodsNeeded,
    estimatedDate: formatDateToYMD(estimated),
    progressPercentage,
    isCompleted,
  };
}

/**
 * Genera una etiqueta legible para el número de periodos proyectados (RF-014).
 * Ejemplo: "4 semanas", "2 quincenas", "6 meses".
 */
export function formatSimulationPeriodLabel(periodsNeeded: number, frequency: SavingsFrequency): string {
  if (periodsNeeded === 0) return 'Meta alcanzada';
  if (frequency === 'weekly') {
    return periodsNeeded === 1 ? '1 semana' : `${periodsNeeded} semanas`;
  }
  if (frequency === 'biweekly') {
    return periodsNeeded === 1 ? '1 quincena' : `${periodsNeeded} quincenas`;
  }
  return periodsNeeded === 1 ? '1 mes' : `${periodsNeeded} meses`;
}
