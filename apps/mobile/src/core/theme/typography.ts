import { TextStyle } from 'react-native';
import { colors } from './colors';

/**
 * AhorRaso Theme - Typography
 * 
 * Jerarquía tipográfica:
 * - Manrope: Títulos y titulares de alto impacto
 * - Hanken Grotesk: Texto de lectura, descripciones y controles
 * - JetBrains Mono: Cifras financieras, monedas (S/), fechas y tags cuantitativos
 */

export const fontFamilies = {
  display: 'Manrope_600SemiBold',
  displayBold: 'Manrope_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemiBold: 'HankenGrotesk_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_600SemiBold',
} as const;

export const typography = {
  // Montos Hero
  amountHero: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 52,
    lineHeight: 56,
    color: colors.ink,
    letterSpacing: -1.5,
  } satisfies TextStyle,

  amountLarge: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
    letterSpacing: -0.5,
  } satisfies TextStyle,

  // Titulares
  titleLarge: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    letterSpacing: -0.3,
  } satisfies TextStyle,

  titleMedium: {
    fontFamily: fontFamilies.display,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
    letterSpacing: -0.2,
  } satisfies TextStyle,

  titleSmall: {
    fontFamily: fontFamilies.display,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  } satisfies TextStyle,

  // Texto de lectura (Body)
  bodyLarge: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  } satisfies TextStyle,

  bodyMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink2,
  } satisfies TextStyle,

  bodySmall: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  } satisfies TextStyle,

  // Etiquetas y botones (Labels)
  labelLarge: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  } satisfies TextStyle,

  labelMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  } satisfies TextStyle,

  labelSmall: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.ink3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } satisfies TextStyle,

  // Moneda / Monospace
  monoMedium: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  } satisfies TextStyle,

  monoSmall: {
    fontFamily: fontFamilies.mono,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
