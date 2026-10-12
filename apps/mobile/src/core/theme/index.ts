/**
 * AhorRaso Theme - Central Design System
 * 
 * Regla: Toda la app importa tokens desde este módulo único.
 * No hardcodear colores ni métricas en pantallas ni componentes.
 */

export * from './colors';
export * from './spacing';
export * from './radius';
export * from './typography';
export * from './useAppFonts';

import { colors } from './colors';
import { spacing } from './spacing';
import { radius } from './radius';
import { typography, fontFamilies } from './typography';

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  fontFamilies,
} as const;

export type Theme = typeof theme;
