import React from 'react';
import { ColorValue } from 'react-native';
import * as LucideIcons from 'lucide-react-native';
import { colors } from '../theme/colors';

// Mapeo seguro y catálogo curado de nombres de iconos soportados
export type LucideIconName = keyof typeof LucideIcons | string;

export interface IconProps {
  name: string;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

/**
 * Normaliza nombres a PascalCase para resolver nombres guardados en DB
 * Ej: "utensils" -> "Utensils", "bus" -> "Bus", "gamepad-2" -> "Gamepad2"
 */
function toPascalCase(str: string): string {
  if (!str) return 'Circle';
  // Si ya tiene mayúsculas internas o es PascalCase directo
  if (str in LucideIcons) return str;

  const cleaned = str
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());

  return cleaned;
}

/**
 * Componente central para renderizar iconos de Lucide a partir de un string.
 * Se utiliza para categorías y elementos desacoplados guardados en la base de datos.
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  color = colors.ink,
  strokeWidth = 1.8,
}) => {
  const normalizedName = toPascalCase(name);
  const IconComponent = (LucideIcons as Record<string, any>)[normalizedName] || LucideIcons.CircleHelp || LucideIcons.Tag;

  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
};

export default Icon;
