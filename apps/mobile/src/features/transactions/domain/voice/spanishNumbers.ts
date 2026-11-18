import { Token } from './tokenizer';

export interface ParsedSpanishNumber {
  value: number;
  startToken: number;
  endToken: number;
  isIndefiniteSingularOne: boolean;
}

export type MonetaryEvidence =
  | 'explicit_currency'
  | 'slang'
  | 'prepositional_price'
  | 'contextual_bare';

export interface MonetaryMatch {
  amountCents: number;
  rawMatch: string;
  startIndex: number;
  endIndex: number;
  startToken: number;
  endToken: number;
  evidence: MonetaryEvidence;
  priority: number;
}

const UNITS: Record<string, number> = {
  cero: 0,
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
};

const TEENS_AND_TWENTIES: Record<string, number> = {
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
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const TENS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

const CURRENCY_UNITS = new Set(['sol', 'soles', 'peso', 'pesos']);
const CENT_UNITS = new Set(['centimo', 'centimos', 'centavo', 'centavos']);
const SLANG_LUCA = new Set(['luca', 'lucas']);
const SLANG_CHINA = new Set(['china', 'chinas']);
const SLANG_FERRO = new Set(['ferro', 'ferros']);
const SLANG_PESETA = new Set(['peseta', 'pesetas']);
const SLANG_MANGO = new Set(['mango', 'mangos']);
const SLANG_PALO = new Set(['palo', 'palos']);

const STRICT_NON_MONETARY_UNITS = new Set([
  'unidad',
  'unidades',
  'kilo',
  'kilos',
  'kg',
  'gramo',
  'gramos',
  'litro',
  'litros',
  'metro',
  'metros',
  'minuto',
  'minutos',
  'hora',
  'horas',
  'dia',
  'dias',
  'semana',
  'semanas',
  'mes',
  'meses',
  'ano',
  'anos',
  'persona',
  'personas',
  'vez',
  'veces',
  'cuota',
  'cuotas',
  'billete',
  'billetes',
  'moneda',
  'monedas',
  'docena',
  'docenas',
  'par',
  'pares',
  'paquete',
  'paquetes',
  'bolsa',
  'bolsas',
  'botella',
  'botellas',
  'lata',
  'latas',
  'caja',
  'cajas',
  'plato',
  'platos',
  'porcion',
  'porciones',
  'octano',
  'octanos',
  'am',
  'pm',
]);

const COUNTABLE_PRODUCT_UNITS = new Set([
  'pan',
  'panes',
  'galleta',
  'galletas',
  'hamburguesa',
  'hamburguesas',
  'empanada',
  'empanadas',
  'cuaderno',
  'cuadernos',
  'lapicero',
  'lapiceros',
  'hoja',
  'hojas',
  'copia',
  'copias',
  'fotocopia',
  'fotocopias',
  'cafes',
  'jugos',
  'gaseosas',
  'chelas',
  'cervezas',
  'tamales',
  'humitas',
  'anticuchos',
  'entradas',
  'pasajes',
  'chicles',
  'caramelos',
  'chocolates',
  'huevos',
  'manzanas',
  'mandarinas',
  'platanos',
  'paltas',
  'polos',
  'medias',
  'menus',
]);

const IDENTIFIER_PREFIX_WORDS = new Set([
  'ruta',
  'linea',
  'bus',
  'carro',
  'combi',
  'piso',
  'mesa',
  'aula',
  'salon',
  'cuarto',
  'numero',
  'nro',
  'puesto',
  'stand',
  'tienda',
  'pabellon',
  'oficina',
  'paradero',
  'asiento',
  'fila',
  'sala',
  'puerta',
  'cuadra',
  'manzana',
  'lote',
  'etapa',
  'sector',
  'zona',
  'corredor',
  'anden',
  'modulo',
]);

const PRICE_PREFIX_WORDS = new Set([
  'por',
  'a',
  'de',
  'son',
  'fueron',
  'fue',
  'era',
  'eran',
  'costaron',
  'costo',
  'cuesta',
  'vale',
  'valio',
  'salio',
  'salieron',
  'pague',
  'gaste',
  'cobre',
  'recibi',
  'pagaron',
  'dieron',
  'yapee',
  'plinee',
  'transferi',
  'deposite',
  'cobraron',
  'descontaron',
]);

const QUANTITY_PRICE_PREPS = new Set(['por', 'a', 'en', 'de']);

/**
 * Convierte un token simple (dígito o palabra numérica básica) a número.
 */
export function parseNumberToken(token: string): number | null {
  if (!token) return null;
  const clean = token
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (/^\d+(?:[.,]\d+)?$/.test(clean)) {
    return parseFloat(clean.replace(',', '.'));
  }
  if (UNITS[clean] !== undefined) return UNITS[clean];
  if (TEENS_AND_TWENTIES[clean] !== undefined) return TEENS_AND_TWENTIES[clean];
  if (TENS[clean] !== undefined) return TENS[clean];
  if (HUNDREDS[clean] !== undefined) return HUNDREDS[clean];
  if (clean === 'mil') return 1000;
  return null;
}

/**
 * Analiza un grupo nominal 0..999 en palabras españolas a partir de `idx`.
 */
function parseUnderThousandWords(
  tokens: Token[],
  idx: number
): { value: number; endToken: number; isIndefiniteSingularOne: boolean } | null {
  let cursor = idx;
  let total = 0;
  let matchedAny = false;
  let firstWordNorm = '';

  const t0 = tokens[cursor];
  if (!t0 || t0.kind !== 'word') return null;

  // Centenas ("cien", "ciento...", "doscientos...")
  if (HUNDREDS[t0.norm] !== undefined) {
    const hVal = HUNDREDS[t0.norm];
    total += hVal;
    matchedAny = true;
    firstWordNorm = t0.norm;
    cursor++;

    // "cien" exacto no lleva decenas ni unidades después
    if (hVal === 100 && t0.norm === 'cien') {
      return { value: 100, endToken: cursor - 1, isIndefiniteSingularOne: false };
    }
  }

  const tNext = tokens[cursor];
  if (tNext && tNext.kind === 'word') {
    if (TEENS_AND_TWENTIES[tNext.norm] !== undefined) {
      total += TEENS_AND_TWENTIES[tNext.norm];
      matchedAny = true;
      cursor++;
      return { value: total, endToken: cursor - 1, isIndefiniteSingularOne: false };
    }

    if (TENS[tNext.norm] !== undefined) {
      total += TENS[tNext.norm];
      matchedAny = true;
      cursor++;

      // "<decena> y <unidad>"
      if (
        tokens[cursor]?.kind === 'word' &&
        tokens[cursor]?.norm === 'y' &&
        tokens[cursor + 1]?.kind === 'word' &&
        UNITS[tokens[cursor + 1].norm] !== undefined &&
        UNITS[tokens[cursor + 1].norm] > 0
      ) {
        total += UNITS[tokens[cursor + 1].norm];
        cursor += 2;
      }
      return { value: total, endToken: cursor - 1, isIndefiniteSingularOne: false };
    }

    if (UNITS[tNext.norm] !== undefined) {
      const unitVal = UNITS[tNext.norm];
      // Evita consumir "cero" tras una centena ("ciento cero")
      if (!matchedAny || unitVal > 0) {
        total += unitVal;
        if (!matchedAny) firstWordNorm = tNext.norm;
        matchedAny = true;
        cursor++;
      }
    }
  }

  if (!matchedAny) return null;

  const isSingleToken = cursor - 1 === idx;
  const isIndefiniteSingularOne =
    isSingleToken && (firstWordNorm === 'un' || firstWordNorm === 'uno' || firstWordNorm === 'una');

  return {
    value: total,
    endToken: cursor - 1,
    isIndefiniteSingularOne,
  };
}

/**
 * Gramática formal para parsear cualquier expresión numérica española (dígitos o palabras 0..999,999.99).
 */
export function parseSpanishNumber(tokens: Token[], startIdx: number): ParsedSpanishNumber | null {
  const first = tokens[startIdx];
  if (!first) return null;

  // Caso 1: Token numérico escrito ("15", "15.50", "1,200")
  if (first.kind === 'number' && first.numericValue !== undefined) {
    // Soporte "15 mil" / "2 mil quinientos"
    if (tokens[startIdx + 1]?.kind === 'word' && tokens[startIdx + 1].norm === 'mil') {
      let val = first.numericValue * 1000;
      let endToken = startIdx + 1;
      const tail = parseUnderThousandWords(tokens, startIdx + 2);
      if (tail) {
        val += tail.value;
        endToken = tail.endToken;
      }
      return {
        value: val,
        startToken: startIdx,
        endToken,
        isIndefiniteSingularOne: false,
      };
    }

    return {
      value: first.numericValue,
      startToken: startIdx,
      endToken: startIdx,
      isIndefiniteSingularOne: false,
    };
  }

  // Caso 2: "mil ..." (sin prefijo numérico)
  if (first.kind === 'word' && first.norm === 'mil') {
    let val = 1000;
    let endToken = startIdx;
    const tail = parseUnderThousandWords(tokens, startIdx + 1);
    if (tail) {
      val += tail.value;
      endToken = tail.endToken;
    }
    return {
      value: val,
      startToken: startIdx,
      endToken,
      isIndefiniteSingularOne: false,
    };
  }

  // Caso 3: Palabras numéricas ("treinta y cinco", "dos mil quinientos", "un")
  const head = parseUnderThousandWords(tokens, startIdx);
  if (!head) return null;

  const afterHead = head.endToken + 1;
  if (tokens[afterHead]?.kind === 'word' && tokens[afterHead].norm === 'mil') {
    let val = (head.value === 0 ? 1 : head.value) * 1000;
    let endToken = afterHead;
    const tail = parseUnderThousandWords(tokens, afterHead + 1);
    if (tail) {
      val += tail.value;
      endToken = tail.endToken;
    }
    return {
      value: val,
      startToken: startIdx,
      endToken,
      isIndefiniteSingularOne: false,
    };
  }

  return {
    value: head.value,
    startToken: startIdx,
    endToken: head.endToken,
    isIndefiniteSingularOne: head.isIndefiniteSingularOne,
  };
}

function isValidCentsValue(val: number): boolean {
  return Number.isInteger(val) && val >= 0 && val <= 99;
}

function isTimeContext(tokens: Token[], startToken: number, endToken: number, val: number): boolean {
  const prev1 = tokens[startToken - 1]?.norm;
  const prev2 = tokens[startToken - 2]?.norm;
  const next1 = tokens[endToken + 1]?.norm;
  const next2 = tokens[endToken + 2]?.norm;

  if ((prev2 === 'a' || prev2 === 'son') && (prev1 === 'las' || prev1 === 'la')) {
    return true;
  }
  if (prev2 === 'de' && (prev1 === 'las' || prev1 === 'la') && val >= 1 && val <= 12) {
    return true;
  }
  if (next1 === 'am' || next1 === 'pm' || next1 === 'horas' || next1 === 'hora' || next1 === 'minutos') {
    return true;
  }
  if (next1 === 'de' && next2 === 'la' && ['manana', 'tarde', 'noche'].includes(tokens[endToken + 3]?.norm || '')) {
    return true;
  }
  return false;
}

const GASOLINE_OCTANES = new Set([84, 90, 95, 97, 98]);

function isIdentifierContext(tokens: Token[], startToken: number, endToken: number, val: number): boolean {
  const prev1 = tokens[startToken - 1]?.norm;
  const prev2 = tokens[startToken - 2]?.norm;
  if (prev1 && IDENTIFIER_PREFIX_WORDS.has(prev1)) {
    return true;
  }
  // Octanaje de combustible ("gasolina 95", "gasolina de 90")
  if (
    GASOLINE_OCTANES.has(val) &&
    (prev1 === 'gasolina' || (prev1 === 'de' && prev2 === 'gasolina'))
  ) {
    return true;
  }
  // Multiplicadores como "2 x 1" o "3 x 10"
  if (tokens[endToken + 1]?.norm === 'x' && tokens[endToken + 2]?.kind === 'number') {
    return true;
  }
  // Años (1900..2099) precedidos por "en" / "de" / "del"
  if (val >= 1900 && val <= 2099 && (prev1 === 'en' || prev1 === 'de' || prev1 === 'del')) {
    return true;
  }
  return false;
}

/**
 * Extractor formal de expresiones monetarias con desambiguación sintáctica de cantidades,
 * horas, fechas e identificadores.
 */
export function extractMonetaryExpressions(
  rawText: string,
  tokens: Token[],
  excludedTokenIndices: Set<number> = new Set()
): MonetaryMatch[] {
  const candidates: MonetaryMatch[] = [];

  const pushCandidate = (
    startToken: number,
    endToken: number,
    amountCents: number,
    evidence: MonetaryEvidence,
    priority: number
  ) => {
    if (amountCents <= 0) return;
    for (let k = startToken; k <= endToken; k++) {
      if (excludedTokenIndices.has(k)) return;
    }
    const startIndex = tokens[startToken].start;
    const endIndex = tokens[endToken].end;
    candidates.push({
      amountCents,
      rawMatch: rawText.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      startToken,
      endToken,
      evidence,
      priority,
    });
  };

  for (let i = 0; i < tokens.length; i++) {
    if (excludedTokenIndices.has(i)) continue;
    const tok = tokens[i];

    // 1. Prefijo monetario: "S/ 15.50", "S/. 20", "$ 10"
    if (tok.kind === 'currency') {
      const num = parseSpanishNumber(tokens, i + 1);
      if (num && num.value > 0) {
        let endTok = num.endToken;
        if (tokens[endTok + 1]?.kind === 'word' && CURRENCY_UNITS.has(tokens[endTok + 1].norm)) {
          endTok += 1;
        }
        pushCandidate(i, endTok, Math.round(num.value * 100), 'explicit_currency', 11);
      }
      continue;
    }

    // 2. Frases fijas de fracción sin número previo: "media luca", "medio sol", "medio palo", "sol y medio", "luca", "china", "peseta"
    if (tok.kind === 'word') {
      const next = tokens[i + 1];
      const next2 = tokens[i + 2];

      if (tok.norm === 'media' && next && SLANG_LUCA.has(next.norm)) {
        pushCandidate(i, i + 1, 50, 'slang', 10);
        continue;
      }
      if (tok.norm === 'medio' && next?.norm === 'sol') {
        pushCandidate(i, i + 1, 50, 'explicit_currency', 10);
        continue;
      }
      if (tok.norm === 'medio' && next?.norm === 'palo') {
        pushCandidate(i, i + 1, 50000, 'slang', 10);
        continue;
      }
      if (tok.norm === 'sol' && next?.norm === 'y' && next2?.norm === 'medio') {
        pushCandidate(i, i + 2, 150, 'explicit_currency', 10);
        continue;
      }
      if (SLANG_LUCA.has(tok.norm)) {
        pushCandidate(i, i, 100, 'slang', 8);
        continue;
      }
      if (SLANG_CHINA.has(tok.norm)) {
        pushCandidate(i, i, 50, 'slang', 8);
        continue;
      }
      if (SLANG_PESETA.has(tok.norm)) {
        pushCandidate(i, i, 20, 'slang', 8);
        continue;
      }
    }

    // 3. Construcciones iniciadas por un numeral (dígitos o palabras en español)
    const num = parseSpanishNumber(tokens, i);
    if (!num) continue;

    const afterIdx = num.endToken + 1;
    const tA = tokens[afterIdx];
    const tB = tokens[afterIdx + 1];
    const tC = tokens[afterIdx + 2];

    if (tA?.kind === 'word') {
      // 3a. Jergas peruanas con numeral: "X lucas y media", "X lucas con 50", "X palos", "dos chinas", "tres ferros", "10 mangos"
      if (SLANG_PALO.has(tA.norm)) {
        if (tB?.norm === 'y' && tC?.norm === 'medio') {
          pushCandidate(i, afterIdx + 2, Math.round((num.value + 0.5) * 100000), 'slang', 11);
        } else {
          pushCandidate(i, afterIdx, Math.round(num.value * 100000), 'slang', 10);
        }
        continue;
      }

      if (SLANG_LUCA.has(tA.norm)) {
        if (tB?.norm === 'y' && tC?.norm === 'media') {
          pushCandidate(i, afterIdx + 2, Math.round((num.value + 0.5) * 100), 'slang', 11);
        } else if (tB?.norm === 'con') {
          const centsNum = parseSpanishNumber(tokens, afterIdx + 2);
          if (centsNum && isValidCentsValue(centsNum.value) && !centsNum.isIndefiniteSingularOne) {
            let endTok = centsNum.endToken;
            if (tokens[endTok + 1] && CENT_UNITS.has(tokens[endTok + 1].norm)) {
              endTok += 1;
            }
            pushCandidate(i, endTok, Math.round(num.value * 100 + centsNum.value), 'slang', 11);
          } else {
            pushCandidate(i, afterIdx, Math.round(num.value * 100), 'slang', 10);
          }
        } else {
          pushCandidate(i, afterIdx, Math.round(num.value * 100), 'slang', 10);
        }
        continue;
      }

      if (SLANG_CHINA.has(tA.norm)) {
        pushCandidate(i, afterIdx, Math.round(num.value * 50), 'slang', 9);
        continue;
      }

      if (SLANG_FERRO.has(tA.norm)) {
        pushCandidate(i, afterIdx, Math.round(num.value * 10), 'slang', 9);
        continue;
      }

      if (SLANG_PESETA.has(tA.norm)) {
        pushCandidate(i, afterIdx, Math.round(num.value * 20), 'slang', 9);
        continue;
      }

      if (SLANG_MANGO.has(tA.norm)) {
        if (tB?.norm === 'y' && tC?.norm === 'medio') {
          pushCandidate(i, afterIdx + 2, Math.round((num.value + 0.5) * 100), 'slang', 10);
        } else if (tB?.norm === 'con') {
          const centsNum = parseSpanishNumber(tokens, afterIdx + 2);
          if (centsNum && isValidCentsValue(centsNum.value) && !centsNum.isIndefiniteSingularOne) {
            pushCandidate(i, centsNum.endToken, Math.round(num.value * 100 + centsNum.value), 'slang', 10);
          } else {
            pushCandidate(i, afterIdx, Math.round(num.value * 100), 'slang', 9);
          }
        } else {
          pushCandidate(i, afterIdx, Math.round(num.value * 100), 'slang', 9);
        }
        continue;
      }

      // 3b. Moneda explícita: "soles y medio", "soles con 50", "un sol cincuenta", "15 soles"
      if (CURRENCY_UNITS.has(tA.norm)) {
        if (tB?.norm === 'y' && tC?.norm === 'medio') {
          pushCandidate(i, afterIdx + 2, Math.round((num.value + 0.5) * 100), 'explicit_currency', 11);
          continue;
        }

        // "<NUM> soles con <CENTS>"
        if (tB?.norm === 'con') {
          const centsNum = parseSpanishNumber(tokens, afterIdx + 2);
          if (centsNum && isValidCentsValue(centsNum.value) && !centsNum.isIndefiniteSingularOne) {
            let endTok = centsNum.endToken;
            if (tokens[endTok + 1] && CENT_UNITS.has(tokens[endTok + 1].norm)) {
              endTok += 1;
            }
            pushCandidate(
              i,
              endTok,
              Math.round(num.value * 100 + centsNum.value),
              'explicit_currency',
              11
            );
            continue;
          }
        }

        // "<NUM> sol(es) <CENTS>" sin "con" (ej: "un sol cincuenta", "dos soles 20 centimos")
        const directCents = parseSpanishNumber(tokens, afterIdx + 1);
        if (directCents && isValidCentsValue(directCents.value) && !directCents.isIndefiniteSingularOne) {
          const hasCentUnit = tokens[directCents.endToken + 1] && CENT_UNITS.has(tokens[directCents.endToken + 1].norm);
          const isValidImplicitCents = hasCentUnit || directCents.value >= 10;
          if (
            isValidImplicitCents &&
            !(
              tokens[directCents.endToken + 1] &&
              (CURRENCY_UNITS.has(tokens[directCents.endToken + 1].norm) ||
                SLANG_LUCA.has(tokens[directCents.endToken + 1].norm))
            )
          ) {
            const endTok = hasCentUnit ? directCents.endToken + 1 : directCents.endToken;
            pushCandidate(
              i,
              endTok,
              Math.round(num.value * 100 + directCents.value),
              'explicit_currency',
              10
            );
            continue;
          }
        }

        pushCandidate(i, afterIdx, Math.round(num.value * 100), 'explicit_currency', 9);
        continue;
      }

      // 3c. Céntimos / centavos explícitos ("cincuenta céntimos")
      if (CENT_UNITS.has(tA.norm) && num.value > 0 && num.value <= 999) {
        pushCandidate(i, afterIdx, Math.round(num.value), 'explicit_currency', 9);
        continue;
      }

      // 3d. Decimales hablados sin palabra moneda intermedia:
      // "quince con cincuenta", "15 con 50"
      if (tA.norm === 'con' && !num.isIndefiniteSingularOne) {
        const centsNum = parseSpanishNumber(tokens, afterIdx + 1);
        if (centsNum && isValidCentsValue(centsNum.value) && !centsNum.isIndefiniteSingularOne) {
          const nextAfterCents = tokens[centsNum.endToken + 1];
          // No confundir "2 con 3 panes" (contable sin unidad monetaria) si va seguido de sustantivo unidad
          if (
            !nextAfterCents ||
            (!STRICT_NON_MONETARY_UNITS.has(nextAfterCents.norm) &&
              !COUNTABLE_PRODUCT_UNITS.has(nextAfterCents.norm))
          ) {
            let endTok = centsNum.endToken;
            if (nextAfterCents && (CURRENCY_UNITS.has(nextAfterCents.norm) || CENT_UNITS.has(nextAfterCents.norm))) {
              endTok += 1;
            }
            pushCandidate(
              i,
              endTok,
              Math.round(num.value * 100 + centsNum.value),
              'explicit_currency',
              9
            );
            continue;
          }
        }
      }

      // "siete punto cinco" / "tres coma veinticinco"
      if ((tA.norm === 'punto' || tA.norm === 'coma') && !num.isIndefiniteSingularOne) {
        if (tB?.norm === 'cero') {
          const sub = parseSpanishNumber(tokens, afterIdx + 2);
          if (sub && sub.value >= 1 && sub.value <= 9) {
            pushCandidate(
              i,
              sub.endToken,
              Math.round(num.value * 100 + sub.value),
              'explicit_currency',
              9
            );
            continue;
          }
        }
        const decNum = parseSpanishNumber(tokens, afterIdx + 1);
        if (decNum && decNum.value >= 0 && decNum.value <= 99 && !decNum.isIndefiniteSingularOne) {
          const cents =
            decNum.value < 10 && tokens[decNum.startToken].kind === 'word'
              ? decNum.value * 10
              : decNum.value < 10 && tokens[decNum.startToken].raw.length === 1
              ? decNum.value * 10
              : decNum.value;
          pushCandidate(
            i,
            decNum.endToken,
            Math.round(num.value * 100 + cents),
            'explicit_currency',
            9
          );
          continue;
        }
      }
    }

    // 4. Números sin unidad monetaria explícita (sujetos a desambiguación sintáctica)
    if (num.value <= 0 || num.isIndefiniteSingularOne) continue;
    if (isTimeContext(tokens, num.startToken, num.endToken, num.value)) continue;
    if (isIdentifierContext(tokens, num.startToken, num.endToken, num.value)) continue;

    // Excluir si va seguido directamente de unidad física o temporal no monetaria
    if (tA?.kind === 'word' && STRICT_NON_MONETARY_UNITS.has(tA.norm)) continue;

    // Si va seguido de sustantivo contable ("panes", "galletas"):
    // distinguir "compré 2 panes" (cantidad) de "taxi 5 galleta 2 soles" (5 es precio de taxi y "galleta 2 soles" es otro gasto).
    if (tA?.kind === 'word' && COUNTABLE_PRODUCT_UNITS.has(tA.norm)) {
      const nextClauseNum = parseSpanishNumber(tokens, afterIdx + 1);
      const nextClauseUnit = nextClauseNum ? tokens[nextClauseNum.endToken + 1] : undefined;
      const tAStartsNewPriceClause = Boolean(
        nextClauseNum &&
          nextClauseUnit &&
          (CURRENCY_UNITS.has(nextClauseUnit.norm) ||
            SLANG_LUCA.has(nextClauseUnit.norm) ||
            SLANG_CHINA.has(nextClauseUnit.norm) ||
            SLANG_MANGO.has(nextClauseUnit.norm)) &&
          tokens[num.startToken - 1]?.kind === 'word' &&
          !PRICE_PREFIX_WORDS.has(tokens[num.startToken - 1].norm)
      );
      if (!tAStartsNewPriceClause) {
        continue;
      }
    }

    // Desambiguación sintáctica de cantidad antes de precio:
    // "<NUM> <objeto (1..2 palabras)> (por|a|en|de) <PRECIO>" -> ej. "6 panes por 2 soles", "2 cafés de 5 soles"
    let looksLikeQuantity = false;
    for (let look = 1; look <= 2; look++) {
      const prepTok = tokens[num.endToken + 1 + look];
      if (prepTok && QUANTITY_PRICE_PREPS.has(prepTok.norm)) {
        const afterPrepIdx = num.endToken + 2 + look;
        const hasPrefixCurrency = tokens[afterPrepIdx]?.kind === 'currency';
        const followingNum = hasPrefixCurrency
          ? parseSpanishNumber(tokens, afterPrepIdx + 1)
          : parseSpanishNumber(tokens, afterPrepIdx);
        if (followingNum && followingNum.value > 0) {
          const afterFollowingTok = tokens[followingNum.endToken + 1];
          const hasExplicitPriceUnit =
            hasPrefixCurrency ||
            (afterFollowingTok &&
              (CURRENCY_UNITS.has(afterFollowingTok.norm) ||
                SLANG_LUCA.has(afterFollowingTok.norm) ||
                SLANG_CHINA.has(afterFollowingTok.norm) ||
                SLANG_MANGO.has(afterFollowingTok.norm)));
          // Con "de", exigir unidad monetaria explícita después para no confundir "menú de 15"
          if (prepTok.norm === 'de' && !hasExplicitPriceUnit) {
            continue;
          }
          // Confirmar que las palabras intermedias no son verbos ni preposiciones ni conectores
          const midTokens = tokens.slice(num.endToken + 1, num.endToken + 1 + look);
          const allWords = midTokens.every(
            (m) =>
              m.kind === 'word' &&
              !PRICE_PREFIX_WORDS.has(m.norm) &&
              m.norm !== 'y' &&
              m.norm !== 'con'
          );
          if (allWords) {
            looksLikeQuantity = true;
            break;
          }
        }
      }
    }
    if (looksLikeQuantity) continue;

    // Evidencia preposicional / verbal ("por 15", "de 20", "pagué 12", "fueron 8")
    const prevNorm = tokens[num.startToken - 1]?.norm;
    if (prevNorm && PRICE_PREFIX_WORDS.has(prevNorm)) {
      pushCandidate(num.startToken, num.endToken, Math.round(num.value * 100), 'prepositional_price', 6);
      continue;
    }

    // Número suelto contextual (ej. "menú 15", "taxi 5", "almuerzo quince")
    // Para palabras numéricas sueltas sin dígitos, evitar falsos positivos con "cien"/"mil" si no hay contexto o aceptar >= 2
    pushCandidate(num.startToken, num.endToken, Math.round(num.value * 100), 'contextual_bare', 3);
  }

  // Resolver solapamientos por prioridad descendente y span más largo
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
  });

  const accepted: MonetaryMatch[] = [];
  for (const cand of candidates) {
    const overlaps = accepted.some(
      (acc) => Math.max(cand.startIndex, acc.startIndex) < Math.min(cand.endIndex, acc.endIndex)
    );
    if (!overlaps) {
      accepted.push(cand);
    }
  }

  accepted.sort((a, b) => a.startIndex - b.startIndex);
  return accepted;
}
