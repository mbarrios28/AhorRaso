/**
 * AhorRaso Theme - Spacing
 * Cuadrícula base basada en múltiplos de 4px, optimizada para interfaces móviles.
 */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gutter: 16, // Padding lateral estándar de pantalla
} as const;

export type SpacingToken = keyof typeof spacing;
