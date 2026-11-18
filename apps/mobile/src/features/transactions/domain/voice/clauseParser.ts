import { extractAllDateTokenIndices, extractDateFromTokens } from './dateParser';
import { extractMonetaryExpressions, MonetaryMatch } from './spanishNumbers';
import { extractPaymentMethodFromTokens } from './slotExtractor';
import { sliceRawTokens, Token, tokenizeUtterance } from './tokenizer';

export interface RepairTriggerMatch {
  startToken: number;
  endToken: number;
  marker: string[];
  strong: boolean;
}

export interface ScopedRepairResolution {
  hadRepair: boolean;
  frozenPrefixTexts: string[];
  repairChainTexts: string[];
  activeText: string;
}

export interface TransactionClause {
  rawText: string;
  tokens: Token[];
  amount: MonetaryMatch | null;
  leadingSharedText?: string;
}

interface TriggerRule {
  tokens: string[];
  strong: boolean;
}

// Ordenados de más largos a más cortos para evitar coincidencias parciales
const TRIGGER_RULES: TriggerRule[] = [
  { tokens: ['o', 'sea', 'no', 'fueron'], strong: true },
  { tokens: ['o', 'sea', 'no', 'eran'], strong: true },
  { tokens: ['ah', 'no', 'espera'], strong: true },
  { tokens: ['perdon', 'quise', 'decir'], strong: true },
  { tokens: ['no', 'quise', 'decir'], strong: true },
  { tokens: ['o', 'sea', 'no'], strong: true },
  { tokens: ['quise', 'decir'], strong: true },
  { tokens: ['mejor', 'dicho'], strong: true },
  { tokens: ['no', 'espera'], strong: true },
  { tokens: ['no', 'perdon'], strong: true },
  { tokens: ['no', 'mentira'], strong: true },
  { tokens: ['no', 'fueron'], strong: true },
  { tokens: ['no', 'eran'], strong: true },
  { tokens: ['no', 'fue'], strong: true },
  { tokens: ['no', 'era'], strong: true },
  { tokens: ['me', 'equivoque'], strong: true },
  { tokens: ['me', 'confundi'], strong: true },
  { tokens: ['correccion'], strong: true },
  { tokens: ['mentira'], strong: true },
  { tokens: ['ah', 'no'], strong: true },
  { tokens: ['en', 'realidad'], strong: false },
  { tokens: ['en', 'verdad'], strong: false },
  { tokens: ['espera'], strong: false },
  { tokens: ['perdon'], strong: false },
  { tokens: ['disculpa'], strong: false },
  { tokens: ['digo'], strong: false },
];

const CLAUSE_COORDINATORS = new Set([
  'y',
  'e',
  'ademas',
  'luego',
  'tambien',
  'despues',
]);

const FILLER_AND_VERB_WORDS = new Set([
  'gaste',
  'compre',
  'pague',
  'consumi',
  'cobre',
  'recibi',
  'hice',
  'una',
  'un',
  'compra',
  'gasto',
  'pago',
  'en',
  'de',
  'del',
  'por',
  'para',
  'a',
  'al',
  'fue',
  'fueron',
  'son',
  'era',
  'eran',
  'me',
  'se',
  'el',
  'la',
  'los',
  'las',
  'y',
  'e',
]);

const MODIFIER_PREP_WORDS = new Set(['por', 'al', 'en', 'con', 'via', 'a']);
const PAYMENT_MODIFIER_WORDS = new Set([
  'yape',
  'yapear',
  'yapee',
  'yapeado',
  'yapeo',
  'plin',
  'plinear',
  'plinee',
  'plineado',
  'agora',
  'tunki',
  'lukita',
  'bim',
  'izipay',
  'niubiz',
  'visa',
  'mastercard',
  'cmr',
  'pos',
  'transferencia',
  'tarjeta',
  'debito',
  'credito',
  'bcp',
  'interbank',
  'bbva',
  'scotiabank',
  'digital',
  'qr',
  'efectivo',
  'cash',
  'contado',
  'sencillo',
  'monedas',
  'billete',
  'billetes',
  'mano',
  'fisico',
]);
const RELATIVE_DATE_SINGLE_WORDS = new Set([
  'hoy',
  'ayer',
  'anoche',
  'anteayer',
  'antier',
]);

function hasCorrectionPayload(tailTokens: Token[], rawSliceText: string): boolean {
  const nonPunct = tailTokens.filter((t) => t.kind !== 'punct');
  if (nonPunct.length === 0) return false;

  const dateExcluded = extractAllDateTokenIndices(tailTokens);
  const monetary = extractMonetaryExpressions(rawSliceText, tailTokens, dateExcluded);
  if (monetary.length > 0) return true;

  const payment = extractPaymentMethodFromTokens(tailTokens);
  if (payment.explicit) return true;

  const date = extractDateFromTokens(tailTokens);
  if (date.explicit) return true;

  return nonPunct.some((t) =>
    ['no', 'fue', 'fueron', 'son', 'era', 'eran', 'cambio'].includes(t.norm)
  );
}

/**
 * Localiza todos los marcadores de reparación del habla sobre secuencia de tokens
 * (tolerando comas insertadas por puntuación automática, ej. "no, eran 18"),
 * aplicando guardas contextuales para evitar falsos positivos ("sala de espera", "en verdad estaba rico").
 */
export function findRepairTriggers(rawText: string, tokens: Token[]): RepairTriggerMatch[] {
  const matches: RepairTriggerMatch[] = [];
  let i = 0;

  while (i < tokens.length) {
    let matchedRule: TriggerRule | null = null;
    let matchedEndIdx = i;

    for (const rule of TRIGGER_RULES) {
      let cursor = i;
      let exact = true;
      for (let j = 0; j < rule.tokens.length; j++) {
        // Permitir una coma opcional entre palabras de un mismo marcador (ej: "no, eran", "ah no, espera")
        if (j > 0 && tokens[cursor]?.kind === 'punct' && tokens[cursor].raw === ',') {
          cursor++;
        }
        const tok = tokens[cursor];
        if (!tok || tok.kind !== 'word' || tok.norm !== rule.tokens[j]) {
          exact = false;
          break;
        }
        matchedEndIdx = cursor;
        cursor++;
      }
      if (!exact) continue;

      const prevWord = (() => {
        for (let k = i - 1; k >= 0; k--) {
          if (tokens[k].kind !== 'punct') return tokens[k];
        }
        return undefined;
      })();
      const hasPrecedingPunct = i > 0 && tokens[i - 1].kind === 'punct';

      // Guardas para marcadores ambiguos
      if (rule.tokens.length === 1 && rule.tokens[0] === 'espera') {
        if (prevWord && ['de', 'en', 'la', 'una', 'a', 'tiempo'].includes(prevWord.norm)) {
          continue;
        }
      }
      if (rule.tokens.length === 1 && (rule.tokens[0] === 'perdon' || rule.tokens[0] === 'disculpa')) {
        if (prevWord && ['de', 'sin', 'pedi', 'pido', 'con'].includes(prevWord.norm)) {
          continue;
        }
      }
      if (rule.tokens.length === 1 && rule.tokens[0] === 'digo') {
        if (prevWord && ['te', 'le', 'les', 'nos', 'si', 'que', 'lo'].includes(prevWord.norm)) {
          continue;
        }
      }

      const afterStart = matchedEndIdx + 1;
      const tailTokens = tokens.slice(afterStart);
      if (tailTokens.filter((t) => t.kind !== 'punct').length === 0) {
        continue;
      }

      const offsetBase = tailTokens[0].start;
      const reindexedTail = tailTokens.map((t, idx) => ({
        ...t,
        index: idx,
        start: t.start - offsetBase,
        end: t.end - offsetBase,
      }));
      const tailSlice = rawText.slice(offsetBase);

      if (!rule.strong) {
        const hasCue = hasCorrectionPayload(reindexedTail, tailSlice);
        if (!hasCue && !hasPrecedingPunct) {
          continue;
        }
        // "en verdad" / "en realidad" requiere obligatoriamente señal de monto/pago/fecha/negación
        if (
          (rule.tokens[0] === 'en' && (rule.tokens[1] === 'verdad' || rule.tokens[1] === 'realidad')) &&
          !hasCue
        ) {
          continue;
        }
      }

      matchedRule = rule;
      break;
    }

    if (matchedRule) {
      matches.push({
        startToken: i,
        endToken: matchedEndIdx,
        marker: matchedRule.tokens,
        strong: matchedRule.strong,
      });
      i = matchedEndIdx + 1;
    } else {
      i++;
    }
  }

  return matches;
}

function trimPunctTokens(tokens: Token[], startIdx: number, endIdx: number): { s: number; e: number } | null {
  let s = startIdx;
  let e = endIdx;
  while (s <= e && tokens[s].kind === 'punct') s++;
  while (e >= s && tokens[e].kind === 'punct') e--;
  if (s > e) return null;
  return { s, e };
}

/**
 * Resuelve disfluencias y reparaciones del habla respetando el alcance (scope)
 * en dictados multi-gasto y encadenados ("Menú 15 soles y taxi 5, ah no espera, 7 soles").
 */
export function resolveScopedRepairs(
  rawText: string,
  referenceDate: Date = new Date()
): ScopedRepairResolution {
  const tokens = tokenizeUtterance(rawText);
  const triggers = findRepairTriggers(rawText, tokens);

  if (triggers.length === 0) {
    return {
      hadRepair: false,
      frozenPrefixTexts: [],
      repairChainTexts: [rawText],
      activeText: rawText,
    };
  }

  const beforeBounds = trimPunctTokens(tokens, 0, triggers[0].startToken - 1);
  const beforeRaw = beforeBounds ? sliceRawTokens(rawText, tokens, beforeBounds.s, beforeBounds.e) : '';

  const afterChunks: string[] = [];
  for (let k = 0; k < triggers.length; k++) {
    const startTok = triggers[k].endToken + 1;
    const endTok = (k + 1 < triggers.length ? triggers[k + 1].startToken : tokens.length) - 1;
    const bounds = trimPunctTokens(tokens, startTok, endTok);
    if (bounds) {
      const slice = sliceRawTokens(rawText, tokens, bounds.s, bounds.e);
      if (slice.trim()) afterChunks.push(slice.trim());
    }
  }

  if (afterChunks.length === 0) {
    return {
      hadRepair: false,
      frozenPrefixTexts: [],
      repairChainTexts: [rawText],
      activeText: rawText,
    };
  }

  // Verificar si el texto antes de la primera corrección contiene múltiples gastos completos;
  // si es así y la corrección final corrige un único ítem, congelamos los ítems previos intactos.
  let frozenPrefixTexts: string[] = [];
  let localBefore = beforeRaw;

  if (beforeRaw.trim()) {
    const beforeClauses = segmentTransactionClauses(beforeRaw, undefined, referenceDate);
    const lastTail = afterChunks[afterChunks.length - 1];
    const lastTailTokens = tokenizeUtterance(lastTail);
    const lastTailAmounts = extractMonetaryExpressions(
      lastTail,
      lastTailTokens,
      extractAllDateTokenIndices(lastTailTokens, undefined, referenceDate)
    );

    if (beforeClauses.length >= 2 && lastTailAmounts.length <= 1) {
      frozenPrefixTexts = beforeClauses.slice(0, -1).map((c) => c.rawText);
      localBefore = beforeClauses[beforeClauses.length - 1].rawText;
    }
  }

  const repairChainTexts = [localBefore, ...afterChunks].filter((s) => s.trim().length > 0);
  const activeText =
    frozenPrefixTexts.length > 0
      ? `${frozenPrefixTexts.join(', ')} | ${localBefore} [REPAIR] ${afterChunks.join(' [REPAIR] ')}`
      : `${beforeRaw} [REPAIR] ${afterChunks.join(' [REPAIR] ')}`;

  return {
    hadRepair: true,
    frozenPrefixTexts,
    repairChainTexts,
    activeText,
  };
}

/**
 * Avanza más allá de modificadores post-monto que pertenecen sintácticamente a la ancla anterior
 * (ej: "... 15 soles por yape ..." o "... 15 soles al contado ...").
 */
function consumePostAmountModifiers(
  tokens: Token[],
  startIdx: number,
  maxExclusiveIdx: number
): number {
  let cursor = startIdx;

  // Caso 1: Pago inmediato tras el monto -> "por yape", "en efectivo", "al contado", "yape"
  if (cursor < maxExclusiveIdx) {
    const t0 = tokens[cursor];
    const t1 = tokens[cursor + 1];
    if (t0.kind === 'word' && MODIFIER_PREP_WORDS.has(t0.norm) && t1?.kind === 'word') {
      if (
        (t0.norm === 'al' && t1.norm === 'contado') ||
        (t0.norm === 'en' && (t1.norm === 'mano' || t1.norm === 'fisico')) ||
        PAYMENT_MODIFIER_WORDS.has(t1.norm)
      ) {
        cursor += 2;
      }
    } else if (t0.kind === 'word' && PAYMENT_MODIFIER_WORDS.has(t0.norm)) {
      cursor += 1;
    }
  }

  // Caso 2: Fecha relativa corta inmediatamente después -> "ayer", "hoy"
  if (cursor < maxExclusiveIdx) {
    const t0 = tokens[cursor];
    if (t0.kind === 'word' && RELATIVE_DATE_SINGLE_WORDS.has(t0.norm)) {
      cursor += 1;
    }
  }

  return cursor;
}

/**
 * Segmenta una transcripción libre de reparaciones en cláusulas independientes de transacción
 * usando anclas monetarias, puntuación, conectores y modificadores sintácticos.
 */
export function segmentTransactionClauses(
  rawText: string,
  defaultDate?: string,
  referenceDate: Date = new Date()
): TransactionClause[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const tokens = tokenizeUtterance(trimmed);
  if (tokens.length === 0) return [];

  const dateExcluded = extractAllDateTokenIndices(tokens, defaultDate, referenceDate);
  const amounts = extractMonetaryExpressions(trimmed, tokens, dateExcluded);

  if (amounts.length <= 1) {
    return [
      {
        rawText: trimmed,
        tokens,
        amount: amounts[0] ?? null,
      },
    ];
  }

  // Determinar índices de corte (primer token de cada cláusula)
  const clauseStartTokens: number[] = [0];

  for (let i = 0; i < amounts.length - 1; i++) {
    const curr = amounts[i];
    const next = amounts[i + 1];
    const betweenStart = curr.endToken + 1;
    const betweenEnd = next.startToken - 1; // inclusivo

    let splitTokenIdx = next.startToken;

    if (betweenStart <= betweenEnd) {
      // 1. Puntuación fuerte (",", ";") entre anclas
      let firstPunctIdx = -1;
      for (let k = betweenStart; k <= betweenEnd; k++) {
        if (tokens[k].kind === 'punct' && (tokens[k].raw === ',' || tokens[k].raw === ';')) {
          firstPunctIdx = k;
          break;
        }
      }

      if (firstPunctIdx !== -1) {
        // Cortar justo después de la puntuación (saltando coordinadores redundantes si siguen)
        splitTokenIdx = Math.min(betweenEnd + 1, firstPunctIdx + 1);
      } else {
        // 2. Buscar el ÚLTIMO coordinador clausular ("y", "e", "además", "luego", "también")
        // De esta forma "15 soles en menú y bebida y 5 en taxi" corta en el segundo "y",
        // mientras "15 soles en menú y café 8 soles" corta antes de "café".
        let lastCoordIdx = -1;
        for (let k = betweenStart; k <= betweenEnd; k++) {
          if (tokens[k].kind === 'word' && CLAUSE_COORDINATORS.has(tokens[k].norm)) {
            lastCoordIdx = k;
          }
        }

        if (lastCoordIdx !== -1) {
          splitTokenIdx = lastCoordIdx;
        } else {
          // 3. Sin delimitadores explícitos: verificar si el monto actual ya tiene concepto previo
          const currentClauseStart = clauseStartTokens[clauseStartTokens.length - 1];
          const hasConceptBeforeCurr = tokens
            .slice(currentClauseStart, curr.startToken)
            .some(
              (t) =>
                t.kind === 'word' &&
                !FILLER_AND_VERB_WORDS.has(t.norm) &&
                !dateExcluded.has(t.index) &&
                !RELATIVE_DATE_SINGLE_WORDS.has(t.norm)
            );

          if (hasConceptBeforeCurr) {
            // El monto actual ya tiene concepto previo ("menú 15 soles taxi 5"):
            // absorbe modificadores post-monto y asigna el resto al siguiente ítem
            splitTokenIdx = consumePostAmountModifiers(tokens, betweenStart, next.startToken);
          } else {
            // El monto actual no tenía concepto previo ("15 soles almuerzo 5 soles taxi"):
            // todo lo intermedio pertenece al monto actual
            splitTokenIdx = next.startToken;
          }
        }
      }
    }

    if (splitTokenIdx <= clauseStartTokens[clauseStartTokens.length - 1]) {
      splitTokenIdx = Math.min(curr.endToken + 1, next.startToken);
    }
    clauseStartTokens.push(splitTokenIdx);
  }

  const clauses: TransactionClause[] = [];

  for (let i = 0; i < amounts.length; i++) {
    const startTok = clauseStartTokens[i];
    const endTok = (i + 1 < amounts.length ? clauseStartTokens[i + 1] : tokens.length) - 1;

    // Limpiar coordinador o puntuación inicial huérfana para evitar ruido en el slice
    let cleanStart = startTok;
    while (
      cleanStart <= endTok &&
      (tokens[cleanStart].kind === 'punct' ||
        (cleanStart === startTok &&
          i > 0 &&
          tokens[cleanStart].kind === 'word' &&
          CLAUSE_COORDINATORS.has(tokens[cleanStart].norm)))
    ) {
      cleanStart++;
    }

    let cleanEnd = endTok;
    while (cleanEnd >= cleanStart && tokens[cleanEnd].kind === 'punct') {
      cleanEnd--;
    }

    const bounds =
      cleanStart <= cleanEnd ? { s: cleanStart, e: cleanEnd } : { s: startTok, e: Math.max(startTok, endTok) };

    const clauseRaw = sliceRawTokens(trimmed, tokens, bounds.s, bounds.e).trim();
    const clauseTokens = tokenizeUtterance(clauseRaw);
    const clauseDateExcluded = extractAllDateTokenIndices(clauseTokens, defaultDate, referenceDate);
    const clauseAmounts = extractMonetaryExpressions(clauseRaw, clauseTokens, clauseDateExcluded);

    clauses.push({
      rawText: clauseRaw,
      tokens: clauseTokens,
      amount: clauseAmounts[0] ?? amounts[i],
    });
  }

  return clauses;
}

