import { PaymentMethod, ParsedVoiceExpense } from './types';
import { LearnedMatch } from '../data/voiceLearning.repository';

export interface CategoryLookupItem {
  id: string;
  name: string;
  icon?: string;
}

/**
 * Distancia de Levenshtein para comparación difusa (fuzzy matching)
 * tolerante a errores ortográficos ("almuerso", "tasi", "chiffa").
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const matrix: number[][] = [];
  for (let i = 0; i <= m; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // eliminación
        matrix[i][j - 1] + 1, // inserción
        matrix[i - 1][j - 1] + cost // sustitución
      );
    }
  }

  return matrix[m][n];
}

/**
 * Retorna similitud normalizada entre 0 y 1.
 */
export function stringSimilarity(a: string, b: string): number {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - dist / maxLen;
}

/**
 * Normaliza texto eliminando acentos y puntuación irrelevante.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes
    .replace(/[,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Diccionario de números en palabras en español.
 */
const SPANISH_NUMBERS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
};

/**
 * Vocabulario de jerga peruana para dinero y montos.
 */
const PERUVIAN_SLANG_AMOUNTS: Array<{ regex: RegExp; resolve: (match: RegExpMatchArray) => number }> = [
  // "media luca" = 0.50 soles
  {
    regex: /\bmedia\s+luca\b/i,
    resolve: () => 0.5,
  },
  // "X lucas y media" / "X luca y media" = X + 0.50
  {
    regex: /\b(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cuarenta|cincuenta)\s+lucas?\s+y\s+media\b/i,
    resolve: (m) => {
      const base = parseNumberToken(m[1]) ?? 1;
      return base + 0.5;
    },
  },
  // "X lucas" / "X luca"
  {
    regex: /\b(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veinticinco|treinta|cuarenta|cincuenta|cien)\s+lucas?\b/i,
    resolve: (m) => parseNumberToken(m[1]) ?? 1,
  },
  // "una luca" / "luca" sola
  {
    regex: /\b(?:una\s+)?luca\b/i,
    resolve: () => 1.0,
  },
  // "una china" = 0.50
  {
    regex: /\buna\s+china\b/i,
    resolve: () => 0.5,
  },
  // "dos chinas" = 1.00
  {
    regex: /\bdos\s+chinas\b/i,
    resolve: () => 1.0,
  },
  // "china" sola
  {
    regex: /\bchina\b/i,
    resolve: () => 0.5,
  },
  // "peseta" = 0.20
  {
    regex: /\bpeseta\b/i,
    resolve: () => 0.2,
  },
  // "ferro" / "ferros" (10 centimos c/u)
  {
    regex: /\b(\d+|un|dos|tres|cuatro|cinco)\s+ferros?\b/i,
    resolve: (m) => {
      const count = parseNumberToken(m[1]) ?? 1;
      return count * 0.1;
    },
  },
  // "medio palo" = 0.50 o 500 según contexto; en presupuesto diario universitario = 0.50
  {
    regex: /\bmedio\s+palo\b/i,
    resolve: () => 0.5,
  },
  // "X mangos" = X soles
  {
    regex: /\b(\d+|un|una|uno|dos|tres|cuatro|cinco|diez|veinte|cincuenta)\s+mangos?\b/i,
    resolve: (m) => parseNumberToken(m[1]) ?? 1,
  },
];

/**
 * Convierte un token de texto o dígitos a número.
 */
export function parseNumberToken(token: string): number | null {
  if (!token) return null;
  const clean = token.toLowerCase().trim();
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean);
  }
  if (SPANISH_NUMBERS[clean] !== undefined) {
    return SPANISH_NUMBERS[clean];
  }
  return null;
}

/**
 * Patrones de reparación del habla (Speech repairs / Disfluencias).
 * Ejemplos: "ah no espera", "mentira", "no espera", "digo", "o sea no", "perdón", "me equivoqué".
 */
const SPEECH_REPAIR_TRIGGERS = [
  'ah no espera',
  'no espera',
  'espera',
  'ah no',
  'no perdon',
  'perdon',
  'me equivoque',
  'mentira',
  'o sea no',
  'digo',
  'correccion',
  'mejor dicho',
  'en verdad',
];

/**
 * Procesa disfluencias y reparaciones de habla.
 * Si el usuario dice "Gasté 2 soles en el chino, ah no espera, fueron 3 soles y una coca cola",
 * extrae la sección corregida con mayor prioridad.
 */
export function resolveSpeechRepair(rawText: string): { activeText: string; hadRepair: boolean } {
  const norm = normalizeText(rawText);

  for (const trigger of SPEECH_REPAIR_TRIGGERS) {
    const idx = norm.indexOf(trigger);
    if (idx !== -1) {
      const before = rawText.substring(0, idx).trim();
      const after = rawText.substring(idx + trigger.length).trim();
      // Si la parte posterior tiene información, combinamos priorizando la posterior
      return {
        activeText: `${before} [REPAIR] ${after}`,
        hadRepair: true,
      };
    }
  }

  return { activeText: rawText, hadRepair: false };
}

/**
 * Categorías semánticas por defecto con palabras clave y jergas comunes.
 */
export const DEFAULT_CATEGORY_SEEDS: Array<{
  name: string;
  keywords: string[];
}> = [
  {
    name: 'Alimentación',
    keywords: [
      'almuerzo',
      'almuerso',
      'menu',
      'menú',
      'comida',
      'cena',
      'desayuno',
      'hamburguesa',
      'salchipapa',
      'broaster',
      'chifa',
      'chiffa',
      'pollo',
      'galleta',
      'gaseosa',
      'coca cola',
      'tambo',
      'snack',
      'pan',
      'cafe',
      'jugo',
      'empanada',
      'sanguchito',
      'tia veneno',
      'don pepe',
      'kfc',
      'bembos',
      'pizza',
      'fruta',
      'agua',
      'chicha',
    ],
  },
  {
    name: 'Transporte',
    keywords: [
      'taxi',
      'tasi',
      'taxii',
      'taxy',
      'combi',
      'comvi',
      'micro',
      'colectivo',
      'pasaje',
      'gasolina',
      'uber',
      'didi',
      'indrive',
      'metro',
      'bus',
      'transporte',
      'carrera',
    ],
  },
  {
    name: 'Educación',
    keywords: [
      'copias',
      'fotocopia',
      'fotocopias',
      'impresion',
      'impresiones',
      'cuaderno',
      'lapicero',
      'libro',
      'unsa',
      'universidad',
      'tramite',
      'constancia',
      'facultad',
      'folder',
      'hojas',
      'examen',
      'matricula',
    ],
  },
  {
    name: 'Servicios',
    keywords: [
      'luz',
      'agua',
      'internet',
      'recarga',
      'saldo',
      'alquiler',
      'cuarto',
      'gas',
      'celular',
      'bitel',
      'claro',
      'movistar',
      'entel',
      'pension',
    ],
  },
  {
    name: 'Diversión',
    keywords: [
      'cine',
      'fiesta',
      'chelas',
      'cerveza',
      'trago',
      'juegos',
      'billar',
      'salida',
      'bar',
      'discoteca',
      'juerga',
      'steam',
      'canchita',
      'concierto',
    ],
  },
  {
    name: 'Salud',
    keywords: [
      'farmacia',
      'panadol',
      'pastilla',
      'medicina',
      'doctor',
      'consulta',
      'curita',
      'jarabe',
      'inkafarma',
      'mifarma',
      'dentista',
      'hospital',
      'botica',
    ],
  },
];

/**
 * Detecta método de pago en el segmento.
 */
export function detectPaymentMethod(text: string): PaymentMethod {
  const norm = normalizeText(text);
  if (/\b(yape|yapee|yapeado|al\s+yape|plin|plinear|plinee|transferencia|tarjeta|debito|credito|bcp|interbank|bbva|scotiabank|digital|qr)\b/.test(norm)) {
    return 'digital';
  }
  if (/\b(efectivo|cash|al\s+contado|contado|en\s+mano|en\s+fisico|sencillo|monedas|billete|billetes)\b/.test(norm)) {
    return 'cash';
  }
  // Smart default: transporte urbano suele ser efectivo
  if (/\b(combi|micro|colectivo|pasaje)\b/.test(norm)) {
    return 'cash';
  }
  return 'digital';
}

/**
 * Expresiones conversacionales y muletillas de relleno que no aportan valor contable.
 */
export const CONVERSATIONAL_STOP_PHRASES = [
  'el dia de hoy hice una compra de',
  'el dia de hoy compre',
  'el dia de hoy gaste',
  'el dia de hoy pague',
  'el dia de hoy',
  'hoy dia hice una compra de',
  'hoy dia compre',
  'hoy dia gaste',
  'hoy dia pague',
  'hoy dia',
  'hice una compra de',
  'hice una compra en',
  'hice una compra',
  'hice un gasto de',
  'hice un gasto en',
  'hice un gasto',
  'acabo de comprar',
  'acabo de gastar',
  'acabo de pagar',
  'se me fue en',
  'me compre un',
  'me compre una',
  'me compre',
  'compre un',
  'compre una',
  'compre',
  'gaste en',
  'gaste',
  'pague por',
  'pague en',
  'pague',
  'hace un rato',
  'hace poco',
];

/**
 * Catálogo de comercios, cadenas y locales populares peruanos por defecto.
 */
export const POPULAR_PERUVIAN_MERCHANTS: string[] = [
  'Tambo+',
  'Tambo',
  'Oxxo',
  'Mass',
  'Metro',
  'Plaza Vea',
  'Tottus',
  'Wong',
  'Makro',
  'Vivanda',
  'Franco',
  'Inkafarma',
  'Mifarma',
  'Bembos',
  'KFC',
  'McDonalds',
  'Burger King',
  'Pardos Chicken',
  'Rokys',
  'Norkys',
  'China Wok',
  'Starbucks',
  'Don Pepe',
  'Tía Veneno',
  'Menú UNSA',
  'Comedor UNSA',
  'Grifo Primax',
  'Primax',
  'Repsol',
  'Petroperú',
  'Claro',
  'Movistar',
  'Entel',
  'Bitel',
];

/**
 * Palabras que representan productos, categorías, unidades monetarias o conectores
 * y que NUNCA deben confundirse con un nombre de local o establecimiento.
 */
export const NON_MERCHANT_WORDS = new Set([
  // Comida y bebidas
  'galleta', 'galletas', 'almuerzo', 'almuerso', 'menu', 'menú', 'comida', 'cena', 'desayuno',
  'hamburguesa', 'salchipapa', 'broaster', 'chifa', 'chiffa', 'pollo', 'snack', 'pan', 'panes',
  'cafe', 'jugo', 'gaseosa', 'coca cola', 'agua', 'empanada', 'sanguchito', 'pizza', 'fruta',
  'chelas', 'cerveza', 'trago', 'canchita',
  // Transporte
  'taxi', 'tasi', 'taxii', 'combi', 'micro', 'colectivo', 'pasaje', 'pasajes', 'gasolina', 'carrera',
  // Educación
  'fotocopia', 'fotocopias', 'copia', 'copias', 'impresion', 'impresiones', 'cuaderno', 'cuadernos',
  'lapicero', 'lapiceros', 'libro', 'libros', 'hojas', 'examen', 'matricula',
  // Servicios y salud
  'luz', 'agua', 'internet', 'recarga', 'saldo', 'gas', 'pastilla', 'pastillas', 'medicina',
  'panadol', 'paracetamol', 'jarabe', 'curita',
  // Monedas y jergas monetarias
  'sol', 'soles', 'luca', 'lucas', 'china', 'chinas', 'ferro', 'ferros', 'peseta', 'pesetas',
  'mango', 'mangos', 'palo', 'palos', 'plata', 'dinero', 'sencillo', 'billete', 'moneda', 'monedas',
  // Métodos de pago
  'efectivo', 'cash', 'yape', 'plin', 'tarjeta', 'transferencia', 'digital', 'debito', 'credito',
  // Tiempo y fechas
  'ayer', 'hoy', 'anoche', 'anteayer', 'antier', 'ahora', 'dia', 'tarde', 'noche', 'mañana',
  // Números y pronombres
  'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veinticinco', 'treinta', 'cuarenta', 'cincuenta', 'cien', 'media',
  // Palabras varias
  'gasto', 'compra', 'pago', 'algo', 'nada', 'cosa', 'cosas'
]);

/**
 * Extrae el nombre del establecimiento / comercio aplicando Named Entity Recognition ligero.
 * Reconoce:
 * - Comercios conocidos (Tambo+, Franco, Don Pepe, Menú UNSA, KFC, etc.) por coincidencia difusa.
 * - Patrones sintácticos peruanos:
 *   - "donde [Persona/Local]" -> "donde don pepe", "donde la tía veneno", "donde el chino"
 *   - "en la tienda de ...", "en el grifo ...", "en la botica ..."
 *   - "compré en ...", "gasté en ...", "hice una compra en ..."
 */
export function extractMerchant(
  text: string,
  knownPlaces: string[] = []
): string | undefined {
  const clean = text.replace(/\[REPAIR\].*$/, '').trim();
  const norm = normalizeText(clean);

  // 1. Cruce prioritario con catálogo de comercios conocidos del usuario + comercios populares peruanos
  const allKnown = Array.from(new Set([...knownPlaces, ...POPULAR_PERUVIAN_MERCHANTS]));
  for (const place of allKnown) {
    if (!place || place.length < 3) continue;
    const normPlace = normalizeText(place);
    const placeRegex = new RegExp(`\\b${normPlace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (placeRegex.test(norm)) {
      return place;
    }
  }

  // 2. Patrones sintácticos de alta fidelidad:
  // Patrón A: "donde [Persona/Lugar]" -> "donde don pepe", "donde la tía veneno", "donde el chino", "donde doña mary"
  const dondeMatch = clean.match(
    /\b(?:donde|dónde)\s+(?:la\s+|el\s+|los\s+|las\s+|don\s+|doña\s+)?([a-záéíóúñ0-9+]+(?:\s+[a-záéíóúñ0-9+]+){0,2})\b/i
  );
  if (dondeMatch && dondeMatch[1]) {
    const cand = dondeMatch[1].trim();
    const normCand = normalizeText(cand);
    const firstWord = normCand.split(/\s+/)[0];
    if (!NON_MERCHANT_WORDS.has(firstWord) && cand.length >= 2) {
      return cand
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // Patrón B: Expresiones explícitas de negocio:
  // "en la tienda de don pepe", "en el grifo primax", "en la botica san pablo", "en la bodega doña mary"
  const storeTypeMatch = clean.match(
    /\b(?:en|de)\s+(?:el\s+puesto\s+de\s+|la\s+tienda\s+de\s+|la\s+bodega\s+de\s+|el\s+local\s+de\s+|el\s+grifo\s+|la\s+botica\s+|la\s+farmacia\s+|el\s+restaurante\s+|la\s+cafeteria\s+|la\s+panaderia\s+|la\s+libreria\s+|el\s+comedor\s+de\s+)([a-záéíóúñ0-9+]+(?:\s+[a-záéíóúñ0-9+]+)?)\b/i
  );
  if (storeTypeMatch && storeTypeMatch[1]) {
    const cand = storeTypeMatch[1].trim();
    const normCand = normalizeText(cand);
    const firstWord = normCand.split(/\s+/)[0];
    if (!NON_MERCHANT_WORDS.has(firstWord) && cand.length >= 2) {
      return cand
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // Patrón C: Verbo de compra + en + local:
  // "compré en tambo", "hice una compra en don pepe", "gasté en el chino"
  const verbEnMatch = clean.match(
    /\b(?:compre|compré|gaste|gasté|pague|pagué|hice\s+una\s+compra|hice\s+un\s+gasto|consumi|consumí)\s+en\s+(?:el\s+|la\s+|los\s+|las\s+|don\s+|doña\s+)?([a-záéíóúñ0-9+]+(?:\s+[a-záéíóúñ0-9+]+)?)\b/i
  );
  if (verbEnMatch && verbEnMatch[1]) {
    const cand = verbEnMatch[1].trim();
    const normCand = normalizeText(cand);
    const firstWord = normCand.split(/\s+/)[0];
    if (!NON_MERCHANT_WORDS.has(firstWord) && cand.length >= 2) {
      return cand
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // Patrón D: Locaciones y establecimientos genéricos: "en el chino", "en la unsa", "en la facultad", "en la bodega"
  const genericPlaceMatch = clean.match(
    /\b(?:en)\s+(?:el\s+|la\s+)?(chino|mercado|facultad|unsa|bodega|bazar|supermercado|minimarket)\b/i
  );
  if (genericPlaceMatch && genericPlaceMatch[1]) {
    const cand = genericPlaceMatch[1].trim();
    return cand.charAt(0).toUpperCase() + cand.slice(1).toLowerCase();
  }

  // Patrón E: "en [Local]" antes del método de pago o conector:
  // Ej: "15 soles en almuerzo en Tambo por yape", "en Don Mario por plin", "en El Paisita al contado"
  const enBeforePaymentMatch = clean.match(
    /\ben\s+(?:el\s+|la\s+|los\s+|las\s+)?((?:don\s+|doña\s+)?[a-záéíóúñ0-9+]+(?:\s+[a-záéíóúñ0-9+]+)?)\s+(?:por\s+(?:yape|plin|tarjeta|efectivo)|al\s+contado|en\s+efectivo|en\s+digital)\b/i
  );
  if (enBeforePaymentMatch && enBeforePaymentMatch[1]) {
    const cand = enBeforePaymentMatch[1].trim();
    const normCand = normalizeText(cand);
    const firstWord = normCand.split(/\s+/)[0];
    if (!NON_MERCHANT_WORDS.has(firstWord) && cand.length >= 2) {
      return cand
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // Patrón F: Doble "en": "... en [Concepto] en [Local]"
  // Ej: "15 soles en almuerzo en El Paisita", "en Don Mario"
  const doubleEnMatch = clean.match(
    /\ben\s+[a-záéíóúñ0-9+]+\s+en\s+(?:el\s+|la\s+|los\s+|las\s+)?((?:don\s+|doña\s+)?[a-záéíóúñ0-9+]+(?:\s+[a-záéíóúñ0-9+]+)?)\b/i
  );
  if (doubleEnMatch && doubleEnMatch[1]) {
    const cand = doubleEnMatch[1].trim();
    const normCand = normalizeText(cand);
    const firstWord = normCand.split(/\s+/)[0];
    if (!NON_MERCHANT_WORDS.has(firstWord) && cand.length >= 2) {
      return cand
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // 3. Fuzzy match de respaldo contra comercios conocidos
  const words = norm.split(/\s+/);
  for (const w of words) {
    if (w.length >= 4 && !NON_MERCHANT_WORDS.has(w)) {
      for (const place of allKnown) {
        const normPlace = normalizeText(place);
        if (stringSimilarity(w, normPlace) >= 0.82) {
          return place;
        }
      }
    }
  }

  return undefined;
}

/**
 * Extrae la fecha relativa mencionada en la locución (hoy, ayer, anoche, anteayer).
 */
export function extractRelativeDate(text: string, defaultDate?: string): string {
  const norm = normalizeText(text);
  const now = new Date();

  if (/\b(anteayer|antier)\b/i.test(norm)) {
    now.setDate(now.getDate() - 2);
    return now.toISOString().split('T')[0];
  }
  if (/\b(ayer|anoche|el\s+dia\s+de\s+ayer|ayer\s+en\s+la\s+noche)\b/i.test(norm)) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split('T')[0];
  }
  if (/\b(hoy|hoy\s+dia|el\s+dia\s+de\s+hoy)\b/i.test(norm)) {
    return now.toISOString().split('T')[0];
  }

  return defaultDate || now.toISOString().split('T')[0];
}

/**
 * Limpia la nota del gasto eliminando el monto, comercio, método de pago y muletillas conversacionales.
 */
export function cleanExpenseNote(
  segment: string,
  rawAmountMatch?: string,
  merchantName?: string,
  categoryName?: string
): string {
  let cleaned = segment.replace(/\[REPAIR\].*$/, '');

  // 1. Quitar el monto detectado
  if (rawAmountMatch) {
    cleaned = cleaned.replace(
      new RegExp(rawAmountMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      ' '
    );
  }

  // 2. Quitar expresiones de comercio ("en don pepe", "donde la tía veneno", "en tambo")
  if (merchantName) {
    const merchantNorm = normalizeText(merchantName);
    const merchantRx = new RegExp(
      `\\b(?:en|de|donde|dónde)\\s+(?:el\\s+|la\\s+|los\\s+|las\\s+|don\\s+|doña\\s+)?${merchantNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi'
    );
    cleaned = cleaned.replace(merchantRx, ' ');
    cleaned = cleaned.replace(
      new RegExp(`\\b${merchantNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
      ' '
    );
  }

  // 3. Quitar método de pago ("por yape", "al yape", "en efectivo", "al contado", "con plin", "por transferencia")
  cleaned = cleaned.replace(
    /\b(?:pagado\s+en|pagado\s+con|al|por|con|en)?\s*(?:yape|yapeado|plin|efectivo|cash|contado|tarjeta|debito|credito|transferencia)\b/gi,
    ' '
  );

  // 4. Quitar expresiones temporales tolerando tildes ("el día de hoy", "ayer", "anoche", "hoy día", "hace un rato")
  cleaned = cleaned.replace(
    /\b(?:el\s+d[ií]a\s+de\s+hoy|hoy\s+d[ií]a|el\s+d[ií]a\s+de\s+ayer|ayer\s+en\s+la\s+noche|anteayer|anoche|ayer|hoy)\b/gi,
    ' '
  );

  // 5. Quitar frases conversacionales de relleno con soporte insensible a tildes
  for (const phrase of CONVERSATIONAL_STOP_PHRASES) {
    const pattern = phrase
      .replace(/a/g, '[aá]')
      .replace(/e/g, '[eé]')
      .replace(/i/g, '[ií]')
      .replace(/o/g, '[oó]')
      .replace(/u/g, '[uú]');
    const rx = new RegExp(`\\b${pattern}\\b`, 'gi');
    cleaned = cleaned.replace(rx, ' ');
  }

  // 6. Quitar conectores sueltos y preposiciones huérfanas al inicio o fin
  cleaned = cleaned
    .replace(/\b(?:soles?|sol|pesos?|lucas?|ferros?|chinas?|por|de|en|y|ademas|además|tambien|también|con)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Si quedó vacío o demasiado corto (ej. el usuario solo dijo "15 soles en tambo"), dar un fallback legible
  if (!cleaned || cleaned.length < 2) {
    if (merchantName) {
      return `Compra en ${merchantName}`;
    }
    return categoryName || 'Gasto';
  }

  // Capitalizar primera letra
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Detecta la categoría usando:
 * 1. Aprendizaje adaptativo previo (mayor prioridad).
 * 2. Categorías personalizadas del usuario con fuzzy match.
 * 3. Semillas por defecto con fuzzy match.
 */
export function matchCategory(
  segment: string,
  userCategories: CategoryLookupItem[] = [],
  learnedMatches: LearnedMatch[] = []
): { categoryId?: string; categoryName: string; confidence: number } {
  const normSegment = normalizeText(segment);

  // 1. Prioridad: Autoaprendizaje adaptativo (voice_learning)
  for (const learned of learnedMatches) {
    const learnedNorm = normalizeText(learned.phrase);
    if (learnedNorm.length >= 3 && normSegment.includes(learnedNorm)) {
      const matchedUserCat = userCategories.find((c) => c.id === learned.categoryId);
      return {
        categoryId: learned.categoryId,
        categoryName: matchedUserCat ? matchedUserCat.name : 'Alimentación',
        confidence: 0.98,
      };
    }
  }

  // 2. Coincidencia con categorías existentes del usuario (exacta o fuzzy)
  for (const cat of userCategories) {
    const normCatName = normalizeText(cat.name);
    // Coincidencia exacta o contenida
    if (normSegment.includes(normCatName)) {
      return { categoryId: cat.id, categoryName: cat.name, confidence: 0.95 };
    }
    // Fuzzy con cada palabra del segmento
    const words = normSegment.split(/\s+/);
    for (const word of words) {
      if (word.length >= 4 && stringSimilarity(word, normCatName) >= 0.8) {
        return { categoryId: cat.id, categoryName: cat.name, confidence: 0.85 };
      }
    }
  }

  // 3. Coincidencia con semillas por defecto
  let bestMatch: { name: string; score: number } | null = null;

  for (const seed of DEFAULT_CATEGORY_SEEDS) {
    for (const kw of seed.keywords) {
      const normKw = normalizeText(kw);
      if (normSegment.includes(normKw)) {
        // Enlace con userCategories si existe
        const userCat = userCategories.find(
          (c) => normalizeText(c.name) === normalizeText(seed.name)
        );
        return {
          categoryId: userCat?.id,
          categoryName: seed.name,
          confidence: 0.9,
        };
      }

      // Fuzzy check
      const words = normSegment.split(/\s+/);
      for (const word of words) {
        if (word.length >= 4 && stringSimilarity(word, normKw) >= 0.8) {
          if (!bestMatch || 0.8 > bestMatch.score) {
            bestMatch = { name: seed.name, score: 0.8 };
          }
        }
      }
    }
  }

  if (bestMatch) {
    const userCat = userCategories.find(
      (c) => normalizeText(c.name) === normalizeText(bestMatch!.name)
    );
    return {
      categoryId: userCat?.id,
      categoryName: bestMatch.name,
      confidence: bestMatch.score,
    };
  }

  // Fallback razonable si no se identificó
  const defaultCat = userCategories[0];
  return {
    categoryId: defaultCat?.id,
    categoryName: defaultCat?.name || 'Alimentación',
    confidence: 0.5,
  };
}

/**
 * Extrae montos monetarios en un texto, distinguiendo cantidades ("6 panes por 2 soles").
 */
export interface ExtractedAmount {
  amountCents: number;
  rawMatch: string;
  startIndex: number;
  endIndex: number;
  priority: number;
}

/**
 * Extrae montos monetarios en un texto, distinguiendo cantidades ("6 panes por 2 soles").
 */
export function extractMonetaryAmounts(text: string): Array<{ amountCents: number; rawMatch: string; index: number }> {
  const norm = normalizeText(text);
  const candidates: ExtractedAmount[] = [];

  // 1. Jergas peruanas (prioridad alta)
  for (const slang of PERUVIAN_SLANG_AMOUNTS) {
    const matches = Array.from(norm.matchAll(new RegExp(slang.regex, 'gi')));
    for (const m of matches) {
      if (m.index !== undefined) {
        const val = slang.resolve(m);
        if (val > 0) {
          const matchLen = m[0].length;
          // Asignar prioridad según especificidad ("lucas y media" > "lucas" > "china")
          const prio = m[0].includes('media') ? 10 : m[0].includes('lucas') ? 9 : 8;
          candidates.push({
            amountCents: Math.round(val * 100),
            rawMatch: m[0],
            startIndex: m.index,
            endIndex: m.index + matchLen,
            priority: prio,
          });
        }
      }
    }
  }

  // 2. Patrones monetarios explícitos (soles, con cincuenta, etc.)
  // "15 con cincuenta", "quince con cincuenta", "15 con 50"
  const conDecimalsRegex = /\b(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta|cuarenta|cincuenta)\s+con\s+(\d+|cincuenta|veinte|diez|ochenta|noventa|treinta|cuarenta)\b/gi;
  for (const m of Array.from(norm.matchAll(conDecimalsRegex))) {
    if (m.index !== undefined) {
      const p1 = parseNumberToken(m[1]) ?? 0;
      const p2 = parseNumberToken(m[2]) ?? 0;
      const val = p1 + p2 / 100;
      if (val > 0) {
        candidates.push({
          amountCents: Math.round(val * 100),
          rawMatch: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          priority: 7,
        });
      }
    }
  }

  // "15 soles", "15.50 soles", "15 sol"
  const digitsSolesRegex = /\b(\d+(?:\.\d+)?)\s*(?:soles?|pesos?|sol)\b/gi;
  for (const m of Array.from(norm.matchAll(digitsSolesRegex))) {
    if (m.index !== undefined) {
      const val = parseFloat(m[1]);
      if (val > 0) {
        candidates.push({
          amountCents: Math.round(val * 100),
          rawMatch: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          priority: 7,
        });
      }
    }
  }

  // "medio sol" = 0.50 soles
  const medioSolRegex = /\bmedio\s+sol\b/gi;
  for (const m of Array.from(norm.matchAll(medioSolRegex))) {
    if (m.index !== undefined) {
      candidates.push({
        amountCents: 50,
        rawMatch: m[0],
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        priority: 9,
      });
    }
  }

  // "sol y medio", "un sol y medio", "X soles y medio", "X sol y medio"
  const solYMedioRegex = /\b(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cuarenta|cincuenta)?\s*(?:soles?|sol)\s+y\s+medio\b/gi;
  for (const m of Array.from(norm.matchAll(solYMedioRegex))) {
    if (m.index !== undefined) {
      const base = m[1] ? (parseNumberToken(m[1]) ?? 1) : 1;
      candidates.push({
        amountCents: Math.round((base + 0.5) * 100),
        rawMatch: m[0],
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        priority: 9,
      });
    }
  }

  // "un sol cincuenta", "dos soles cincuenta", "X soles/sol con Y"
  const solWithCentsRegex = /\b(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|veinticinco|treinta|cuarenta|cincuenta)\s+(?:soles?|sol)\s+(?:con\s+)?(\d+|cincuenta|veinte|diez|ochenta|noventa|treinta|cuarenta)\b/gi;
  for (const m of Array.from(norm.matchAll(solWithCentsRegex))) {
    if (m.index !== undefined) {
      const p1 = parseNumberToken(m[1]) ?? 0;
      const p2 = parseNumberToken(m[2]) ?? 0;
      const val = p1 + p2 / 100;
      if (val > 0) {
        candidates.push({
          amountCents: Math.round(val * 100),
          rawMatch: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          priority: 8,
        });
      }
    }
  }

  // "un sol", "dos soles", "quince soles", "diez soles", etc.
  const wordsSolesRegex = /\b(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta|cuarenta|cincuenta|cien)\s+(?:soles?|sol)\b/gi;
  for (const m of Array.from(norm.matchAll(wordsSolesRegex))) {
    if (m.index !== undefined) {
      const val = parseNumberToken(m[1]);
      if (val && val > 0) {
        candidates.push({
          amountCents: Math.round(val * 100),
          rawMatch: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          priority: 7,
        });
      }
    }
  }

  // "a X soles", "por X soles", "de X", "fueron X", "son X", "pague X", "gaste X"
  const prepRegex = /\b(?:por|a|de|pague|gaste|fueron|son)\s+(\d+(?:\.\d+)?)\b/gi;
  for (const m of Array.from(norm.matchAll(prepRegex))) {
    if (m.index !== undefined) {
      const val = parseFloat(m[1]);
      if (val > 0) {
        candidates.push({
          amountCents: Math.round(val * 100),
          rawMatch: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          priority: 5,
        });
      }
    }
  }

  // 3. Dígitos independientes (e.g. en multi-gasto "menú 15 soles taxi 5 galleta 2 soles")
  // Excluir si va seguido de unidad/artículo plural (e.g. "6 panes")
  const standaloneDigitsRegex = /\b(\d+(?:\.\d+)?)\b(?!\s+(?:panes|galletas|hamburguesas|cuadernos|lapiceros|unidades|kilos|litros|minutos|horas|dias|soles?|sol|lucas?|pesos?))/gi;
  for (const m of Array.from(norm.matchAll(standaloneDigitsRegex))) {
    if (m.index !== undefined) {
      const val = parseFloat(m[1]);
      if (val > 0) {
        candidates.push({
          amountCents: Math.round(val * 100),
          rawMatch: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          priority: 2,
        });
      }
    }
  }

  // 4. Filtrar y desduplicar candidatos que se solapan (overlap)
  // Ordenar por prioridad descendente, y luego por longitud descendente
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
  });

  const accepted: ExtractedAmount[] = [];
  for (const cand of candidates) {
    const overlaps = accepted.some((acc) => {
      return Math.max(cand.startIndex, acc.startIndex) < Math.min(cand.endIndex, acc.endIndex);
    });
    if (!overlaps) {
      accepted.push(cand);
    }
  }

  // Ordenar cronológicamente por aparición en el texto
  accepted.sort((a, b) => a.startIndex - b.startIndex);

  return accepted.map((item) => ({
    amountCents: item.amountCents,
    rawMatch: item.rawMatch,
    index: item.startIndex,
  }));
}

export interface ParseVoiceOptions {
  userCategories?: CategoryLookupItem[];
  learnedMatches?: LearnedMatch[];
  knownPlaces?: string[];
  defaultDate?: string; // YYYY-MM-DD
}

/**
 * Función principal del dominio NLP para procesar dictado por voz (HU-10 / RF-003).
 *
 * Soporta:
 * - Reparaciones del habla ("ah no espera, son 3 soles").
 * - Multi-gasto con conectores ("y", "además") o SIN conectores mediante anclas monetarias.
 * - Jerga peruana ("lucas", "ferros", "chinas", "con cincuenta").
 * - Distinción de cantidades ("6 panes por 2 soles").
 * - Coincidencia difusa (fuzzy Levenshtein).
 * - Identificación robusta de comercios y establecimientos peruanos.
 * - Limpieza inteligente de notas eliminando muletillas y conectores.
 * - Detección de fechas relativas (hoy, ayer, anoche, anteayer).
 * - Autoaprendizaje adaptativo previo.
 */
export function parseVoiceTranscript(
  rawTranscript: string,
  options: ParseVoiceOptions = {}
): ParsedVoiceExpense[] {
  if (!rawTranscript || !rawTranscript.trim()) {
    return [];
  }

  const {
    userCategories = [],
    learnedMatches = [],
    knownPlaces = [],
    defaultDate,
  } = options;

  // Fecha por defecto o inferida de expresiones relativas ("ayer", "anoche", "anteayer", "hoy")
  const occurredOn = extractRelativeDate(rawTranscript, defaultDate);

  // 1. Manejo de auto-corrección / speech repair
  const { activeText, hadRepair } = resolveSpeechRepair(rawTranscript);

  // Si hubo un speech repair dentro de una sola frase:
  // e.g.: "Compre una black de 2 soles en el chino [REPAIR] son 3 soles y fue una coca cola"
  if (hadRepair && activeText.includes('[REPAIR]')) {
    const parts = activeText.split('[REPAIR]');
    const beforePart = parts[0].trim();
    const repairPart = parts[1].trim();

    // Extraer montos en la parte corregida
    const repairAmounts = extractMonetaryAmounts(repairPart);
    const beforeAmounts = extractMonetaryAmounts(beforePart);

    const finalAmountCents =
      repairAmounts.length > 0
        ? repairAmounts[0].amountCents
        : beforeAmounts.length > 0
        ? beforeAmounts[0].amountCents
        : 100;

    const chosenPart = repairPart || beforePart;
    const cat = matchCategory(repairPart, userCategories, learnedMatches);
    const merchant =
      extractMerchant(repairPart, knownPlaces) ||
      extractMerchant(beforePart, knownPlaces);
    const payment = detectPaymentMethod(repairPart) || detectPaymentMethod(beforePart);
    const rawAmt = repairAmounts[0]?.rawMatch || beforeAmounts[0]?.rawMatch;
    const note = cleanExpenseNote(chosenPart, rawAmt, merchant, cat.categoryName);

    return [
      {
        amountCents: finalAmountCents,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        merchantName: merchant,
        paymentMethod: payment,
        note,
        occurredOn,
        confidence: 0.95,
        rawSegment: rawTranscript,
      },
    ];
  }

  // 2. Multi-gasto: Detección por Anclas Monetarias
  const amounts = extractMonetaryAmounts(rawTranscript);

  // Si no se detectó ningún monto, generamos un borrador con 0 para que el usuario complete
  if (amounts.length === 0) {
    const cat = matchCategory(rawTranscript, userCategories, learnedMatches);
    const merchant = extractMerchant(rawTranscript, knownPlaces);
    const payment = detectPaymentMethod(rawTranscript);
    const note = cleanExpenseNote(rawTranscript, undefined, merchant, cat.categoryName);

    return [
      {
        amountCents: 0,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        merchantName: merchant,
        paymentMethod: payment,
        note,
        occurredOn,
        confidence: 0.5,
        rawSegment: rawTranscript,
      },
    ];
  }

  // Si hay exactamente 1 monto
  if (amounts.length === 1) {
    const single = amounts[0];
    const cat = matchCategory(rawTranscript, userCategories, learnedMatches);
    const merchant = extractMerchant(rawTranscript, knownPlaces);
    const payment = detectPaymentMethod(rawTranscript);
    const note = cleanExpenseNote(rawTranscript, single.rawMatch, merchant, cat.categoryName);

    return [
      {
        amountCents: single.amountCents,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        merchantName: merchant,
        paymentMethod: payment,
        note,
        occurredOn,
        confidence: cat.confidence,
        rawSegment: rawTranscript,
      },
    ];
  }

  // Si hay MÚLTIPLES montos (con o sin conectores)
  // Dividimos el texto en segmentos según los límites y anclas de los montos
  const parsedExpenses: ParsedVoiceExpense[] = [];

  // Calcular puntos de corte entre montos consecutivos
  const splitPoints: number[] = [0];

  for (let i = 0; i < amounts.length - 1; i++) {
    const curr = amounts[i];
    const next = amounts[i + 1];
    const currEnd = curr.index + curr.rawMatch.length;
    const nextStart = next.index;
    const betweenText = rawTranscript.substring(currEnd, nextStart);

    // Si hay un conector explícito ("y", "además", ",") en el texto intermedio
    const connectorMatch = betweenText.match(/\b(?:y|ademas|además|luego|tambien|también)\b|,/i);
    if (connectorMatch && connectorMatch.index !== undefined) {
      splitPoints.push(currEnd + connectorMatch.index);
    } else {
      // Si no hay conector: ver si el monto actual ya tiene descripción previa
      const currentStart = splitPoints[splitPoints.length - 1];
      const wordsBeforeCurr = rawTranscript.substring(currentStart, curr.index).trim();
      if (wordsBeforeCurr.length > 0) {
        // El monto actual ya tiene su palabra clave antes (ej. "menú 15 soles"),
        // por lo que el texto intermedio ("taxi") le pertenece al siguiente monto
        splitPoints.push(currEnd);
      } else {
        // El monto actual no tiene descripción antes (ej. "15 almuerzo"),
        // por lo que el texto intermedio ("almuerzo") le pertenece al monto actual
        splitPoints.push(nextStart);
      }
    }
  }
  splitPoints.push(rawTranscript.length);

  for (let i = 0; i < amounts.length; i++) {
    const curr = amounts[i];
    const startIdx = splitPoints[i];
    const endIdx = splitPoints[i + 1];

    const segment = rawTranscript.substring(startIdx, endIdx).trim();

    const cat = matchCategory(segment, userCategories, learnedMatches);
    const merchant = extractMerchant(segment, knownPlaces) || extractMerchant(rawTranscript, knownPlaces);
    const payment = detectPaymentMethod(segment);
    const segmentDate = extractRelativeDate(segment, occurredOn);
    const note = cleanExpenseNote(segment, curr.rawMatch, merchant, cat.categoryName);

    parsedExpenses.push({
      amountCents: curr.amountCents,
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      merchantName: merchant,
      paymentMethod: payment,
      note,
      occurredOn: segmentDate,
      confidence: cat.confidence,
      rawSegment: segment,
    });
  }

  return parsedExpenses;
}
