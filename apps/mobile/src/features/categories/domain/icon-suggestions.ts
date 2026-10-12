/**
 * Mapeo inteligente de palabras clave peruanas / estudiantiles
 * a nombres de iconos curados de Lucide para sugerencia automática.
 */

const KEYWORD_MAP: Array<{ keywords: string[]; icon: string }> = [
  {
    keywords: ['comida', 'menu', 'menú', 'almuerzo', 'desayuno', 'cena', 'restaurante', 'hamburguesa', 'pizza', 'tacos', 'pollo', 'chifa', 'pan', 'comedor'],
    icon: 'Utensils',
  },
  {
    keywords: ['bus', 'combi', 'cúster', 'pasaje', 'taxi', 'colectivo', 'uber', 'didi', 'transporte', 'viaje', 'metropolitano'],
    icon: 'Bus',
  },
  {
    keywords: ['juego', 'gaming', 'diversion', 'diversión', 'cine', 'fiesta', 'salida', 'chelas', 'bar', 'tragos', 'discoteca', 'evento', 'steam', 'play'],
    icon: 'Gamepad2',
  },
  {
    keywords: ['luz', 'agua', 'gas', 'electricidad', 'servicio', 'recibo', 'mensualidad', 'alquiler', 'cuota', 'mantenimiento'],
    icon: 'Lightbulb',
  },
  {
    keywords: ['unsa', 'universidad', 'facultad', 'fotocopia', 'copias', 'libro', 'cuaderno', 'matricula', 'matrícula', 'curso', 'examen', 'educacion', 'educación'],
    icon: 'GraduationCap',
  },
  {
    keywords: ['salud', 'farmacia', 'pastilla', 'medicina', 'doctor', 'clinica', 'clínica', 'hospital', 'dentista', 'optica', 'óptica'],
    icon: 'Heart',
  },
  {
    keywords: ['cafe', 'café', 'snack', 'galleta', 'starbucks', 'tambo', 'tienda', 'bodega'],
    icon: 'Coffee',
  },
  {
    keywords: ['ropa', 'zapatillas', 'polo', 'pantalon', 'pantalón', 'compras', 'tienda', 'shopping', 'mall', 'real plaza'],
    icon: 'ShoppingBag',
  },
  {
    keywords: ['celular', 'recarga', 'plan', 'claro', 'movistar', 'entel', 'bitel', 'telefono', 'teléfono', 'saldo'],
    icon: 'Smartphone',
  },
  {
    keywords: ['gasolina', 'combustible', 'grifo', 'petroleo', 'petróleo', 'gnv'],
    icon: 'Fuel',
  },
  {
    keywords: ['netflix', 'spotify', 'disney', 'pelicula', 'película', 'serie', 'streaming'],
    icon: 'Film',
  },
  {
    keywords: ['gym', 'gimnasio', 'deporte', 'pesas', 'futbol', 'fútbol', 'cancha'],
    icon: 'Dumbbell',
  },
  {
    keywords: ['concierto', 'musica', 'música', 'show'],
    icon: 'Music',
  },
];

/**
 * Catálogo acotado de iconos seleccionables para el usuario.
 */
export const CURATED_ICONS = [
  'Utensils',
  'Bus',
  'Gamepad2',
  'Lightbulb',
  'GraduationCap',
  'Heart',
  'Coffee',
  'ShoppingBag',
  'Smartphone',
  'Fuel',
  'Film',
  'Dumbbell',
  'Music',
  'Tag',
  'Home',
  'Gift',
] as const;

/**
 * Paleta acotada de colores curados para categorías según Stitch.
 */
export const CURATED_COLORS = [
  '#F97316', // Naranja cálido (Comida)
  '#3B82F6', // Azul tecnológico (Transporte)
  '#A855F7', // Púrpura (Diversión)
  '#14B8A6', // Turquesa (Servicios)
  '#6366F1', // Índigo (Educación)
  '#EF4444', // Rojo semántico (Salud)
  '#EC4899', // Rosa (Personal/Compras)
  '#0EA371', // Verde primary (Ahorro/General)
  '#F59E0B', // Ámbar (Alerta/Varios)
  '#64748B', // Pizarra neutral
] as const;

/**
 * Sugiere un icono automáticamente a partir del nombre escrito.
 */
export function suggestCategoryIcon(name: string): string {
  if (!name || !name.trim()) return 'Tag';

  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const entry of KEYWORD_MAP) {
    const match = entry.keywords.some((kw) => {
      const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalized.includes(normalizedKw);
    });
    if (match) return entry.icon;
  }

  return 'Tag';
}
