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
  if (/\b(yape|yapee|plin|plinear|transferencia|tarjeta|bcp|interbank|bbva|scotiabank|digital|qr)\b/.test(norm)) {
    return 'digital';
  }
  if (/\b(efectivo|cash|en mano|sencillo|monedas|billete)\b/.test(norm)) {
    return 'cash';
  }
  // Smart default: transporte urbano suele ser efectivo
  if (/\b(combi|micro|colectivo|pasaje)\b/.test(norm)) {
    return 'cash';
  }
  return 'digital';
}

/**
 * Extrae el nombre del establecimiento / comercio.
 * Ej: "en el chino", "en tambo", "en la tía veneno", "de don pepe".
 */
export function extractMerchant(text: string): string | undefined {
  const clean = text.replace(/\[REPAIR\].*$/, ''); // Prevenir ruido
  const match = clean.match(/\b(?:en|de)\s+(?:el\s+|la\s+|los\s+|las\s+)?([a-záéíóúñ0-9+]+(?:\s+[a-záéíóúñ0-9+]+)?)\b/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    // Excluir palabras comunes que no son comercios
    const excluded = ['taxi', 'combi', 'micro', 'pasaje', 'efectivo', 'yape', 'plin', 'ayer', 'hoy', 'soles', 'lucas'];
    if (!excluded.includes(candidate.toLowerCase())) {
      // Capitalizar
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }
  return undefined;
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

  // "quince soles", "diez soles", etc.
  const wordsSolesRegex = /\b(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta|cuarenta|cincuenta|cien)\s+soles?\b/gi;
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
  const standaloneDigitsRegex = /\b(\d+(?:\.\d+)?)\b(?!\s+(?:panes|galletas|hamburguesas|cuadernos|lapiceros|unidades|kilos|litros|minutos|horas|dias|soles?|lucas?|pesos?))/gi;
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
 * - Autoaprendizaje adaptativo previo.
 */
export function parseVoiceTranscript(
  rawTranscript: string,
  options: ParseVoiceOptions = {}
): ParsedVoiceExpense[] {
  if (!rawTranscript || !rawTranscript.trim()) {
    return [];
  }

  const { userCategories = [], learnedMatches = [], defaultDate } = options;

  // Fecha por defecto o cálculo de "ayer"
  const today = new Date();
  const normTotal = normalizeText(rawTranscript);
  if (normTotal.includes('ayer')) {
    today.setDate(today.getDate() - 1);
  }
  const occurredOn = defaultDate || today.toISOString().split('T')[0];

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

    // Detectar si el producto/categoría fue corregido
    const cat = matchCategory(repairPart, userCategories, learnedMatches);
    const merchant = extractMerchant(repairPart) || extractMerchant(beforePart);
    const payment = detectPaymentMethod(repairPart) || detectPaymentMethod(beforePart);

    return [
      {
        amountCents: finalAmountCents,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        merchantName: merchant,
        paymentMethod: payment,
        note: repairPart || beforePart,
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
    const merchant = extractMerchant(rawTranscript);
    const payment = detectPaymentMethod(rawTranscript);

    return [
      {
        amountCents: 0,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        merchantName: merchant,
        paymentMethod: payment,
        note: rawTranscript.trim(),
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
    const merchant = extractMerchant(rawTranscript);
    const payment = detectPaymentMethod(rawTranscript);

    return [
      {
        amountCents: single.amountCents,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        merchantName: merchant,
        paymentMethod: payment,
        note: rawTranscript.trim(),
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
    const merchant = extractMerchant(segment);
    const payment = detectPaymentMethod(segment);

    parsedExpenses.push({
      amountCents: curr.amountCents,
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      merchantName: merchant,
      paymentMethod: payment,
      note: segment.replace(new RegExp(curr.rawMatch, 'i'), '').trim() || segment,
      occurredOn,
      confidence: cat.confidence,
      rawSegment: segment,
    });
  }

  return parsedExpenses;
}
