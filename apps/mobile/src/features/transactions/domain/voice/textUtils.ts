/**
 * Utilidades lingüísticas puras y deterministas para español (es-PE).
 */

/**
 * Normaliza texto eliminando acentos y puntuación separadora irrelevante.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza una palabra o frase manteniendo su estructura interna de espacios.
 */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Lematizador morfológico ligero para sustantivos/adjetivos en español
 * (ej. "galletas" -> "galleta", "panes" -> "pan", "zapatillas" -> "zapatilla",
 * "luces" -> "luz", evitando truncar raíces cortas o confundir "pan" con "pantalon").
 */
export function spanishStem(word: string): string {
  const clean = normalizeWord(word).replace(/[^a-z0-9]/g, '');
  if (clean.length <= 3) return clean;

  if (clean.endsWith('ces') && clean.length >= 5) {
    return `${clean.slice(0, -3)}z`;
  }
  if (
    clean.endsWith('es') &&
    clean.length >= 5 &&
    !/[aeiou]es$/.test(clean) &&
    !clean.endsWith('tes') &&
    !clean.endsWith('les') &&
    !clean.endsWith('res')
  ) {
    // ej. "panes" -> "pan", "botones" -> "boton", "meses" -> "mes", "soles" -> "sol"
    return clean.slice(0, -2);
  }
  if (clean.endsWith('es') && (clean.endsWith('nes') || clean.endsWith('ses') || clean.endsWith('res') || clean.endsWith('les')) && clean.length >= 5) {
    // ej. "impresiones" -> "impresion", "exámenes" -> "examen", "colores" -> "color", "soles" -> "sol"
    const base = clean.slice(0, -2);
    // Conservar palabras cuya raíz termina en 'e' (ej. "cafes" -> "cafe", "chicles" -> "chicle", "bebes" -> "bebe")
    if (clean.endsWith('fes') || clean.endsWith('cles') || clean.endsWith('tles') || clean.endsWith('jes') || clean.endsWith('tes')) {
      return clean.slice(0, -1);
    }
    return base;
  }
  if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length >= 4) {
    return clean.slice(0, -1);
  }
  return clean;
}

/**
 * Normalización fonética canónica del español latinoamericano/peruano.
 * Reduce errores de transcripción acústica (s/z/c, b/v, y/ll, qu/k, h muda, consonantes dobladas)
 * preservando el dígrafo "ch".
 */
export function phoneticNormalize(word: string): string {
  const clean = normalizeWord(word).replace(/[^a-z0-9]/g, '');
  if (!clean) return '';

  return clean
    .replace(/ch/g, '\u0001')
    .replace(/qu([ei])/g, 'k$1')
    .replace(/qu/g, 'k')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/g([ei])/g, 'j$1')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/ll/g, 'y')
    .replace(/h/g, '')
    .replace(/\u0001/g, 'ch')
    .replace(/([a-z])\1+/g, '$1');
}

/**
 * Genera n-gramas de caracteres con delimitadores de inicio/fin de palabra (^...$).
 * Evita colisiones por subcadena (ej. "pan" vs "pantalon").
 */
export function charNgrams(word: string, n = 3): string[] {
  const clean = phoneticNormalize(word);
  if (!clean) return [];
  const padded = `^${clean}$`;
  if (padded.length <= n) return [padded];
  const grams: string[] = [];
  for (let i = 0; i <= padded.length - n; i++) {
    grams.push(padded.slice(i, i + n));
  }
  return grams;
}

/**
 * Distancia de Levenshtein para comparación de cadenas.
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
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[m][n];
}

/**
 * Similitud normalizada entre 0 y 1 basada en distancia de edición.
 */
export function stringSimilarity(a: string, b: string): number {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - dist / maxLen;
}

/**
 * Similitud Jaccard sobre trigramas fonéticos con fronteras de palabra.
 */
export function phoneticTrigramSimilarity(a: string, b: string): number {
  const g1 = charNgrams(a, 3);
  const g2 = charNgrams(b, 3);
  if (g1.length === 0 || g2.length === 0) return 0;
  const set1 = new Set(g1);
  const set2 = new Set(g2);
  let intersection = 0;
  for (const g of set1) {
    if (set2.has(g)) intersection++;
  }
  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Formatea una fecha en YYYY-MM-DD usando la zona horaria LOCAL del dispositivo
 * (evita desfases de fecha en UTC durante las noches en Perú UTC-5).
 */
export function formatLocalDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Capitaliza la primera letra preservando el resto del texto.
 */
export function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Formatea un nombre de comercio en Title Case respetando conectores menores internos.
 */
export function toMerchantTitleCase(text: string): string {
  const minor = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y']);
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && minor.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

