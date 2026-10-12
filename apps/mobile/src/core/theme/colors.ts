/**
 * AhorRaso Theme - Palette
 * Basado estrictamente en el Design System oficial de Stitch para AhorRaso (Dark Mode).
 * 
 * Reglas de diseño:
 * - Dark mode nativo
 * - Uso restringido del verde (solo acciones afirmativas / montos positivos)
 * - Bordes sutiles de 1px sin resplandores ni sombras agresivas
 */

export const colors = {
  // Fondos principales
  bg: '#0D0D0F',          // Base Screen Canvas (near-black)
  surface: '#18181B',     // Surface Level 1 (tarjetas, inputs, containers)
  surface2: '#1F1F23',    // Surface Level 2 (elementos elevados, chips activos)
  surface3: '#26262B',    // Surface Level 3 (estados presionados, dropdowns)

  // Bordes estructurales
  line: '#2A2A2F',        // Borde estándar hairline de 1px
  lineFocus: '#3F3F46',   // Borde al enfocar

  // Textos y jerarquía óptica (Ink)
  ink: '#FAFAFA',         // Texto primario, alta legibilidad
  ink2: '#A1A1AA',        // Texto secundario / metadatos
  ink3: '#71717A',        // Texto terciario / placeholders / prefijo moneda
  inkDisabled: '#52525B', // Texto deshabilitado

  // Acentos y acciones de marca
  primary: '#0EA371',     // Acción principal / confirmaciones
  secondary: '#10B981',   // Acento de balance positivo y ahorro
  tertiary: '#DF6C6B',    // Acento terciario / alertas suaves
  neutral: '#18181B',     // Contenedor neutro

  // Semántica
  danger: '#EF4444',      // Alerta crítica / egreso negativo / sobregiro
  warning: '#F59E0B',     // Advertencia de presupuesto
  info: '#3B82F6',        // Información y notas del sistema
  
  // Utilidades
  overlay: 'rgba(13, 13, 15, 0.75)',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;
