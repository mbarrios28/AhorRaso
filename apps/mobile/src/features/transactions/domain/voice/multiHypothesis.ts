import { LearnedMatch } from '../../data/voiceLearning.repository';
import {
  ParsedVoiceExpense,
  ParsedVoiceIncome,
  PaymentMethod,
  SpeechAlternative,
} from '../types';
import {
  CategoryClassifier,
  CategoryLookupItem,
  HistoricalCategorySample,
  TransactionDomainType,
} from './categoryClassifier';
import { resolveScopedRepairs, segmentTransactionClauses } from './clauseParser';
import { extractAllDateTokenIndices, extractDateFromTokens } from './dateParser';
import {
  extractIncomeSource,
  extractMerchantFromTokens,
  extractPaymentMethodFromTokens,
} from './slotExtractor';
import { extractMonetaryExpressions, MonetaryMatch } from './spanishNumbers';
import { formatLocalDateISO, normalizeText } from './textUtils';
import { tokenizeUtterance } from './tokenizer';

export interface VoiceParseContext {
  type?: TransactionDomainType;
  userCategories?: CategoryLookupItem[];
  learnedMatches?: LearnedMatch[];
  knownPlaces?: string[];
  historicalSamples?: HistoricalCategorySample[];
  defaultDate?: string;
  referenceDate?: Date;
}

export interface VoiceNluInterpreter {
  readonly id: string;
  parseExpenses(
    rawTranscript: string,
    alternatives: SpeechAlternative[],
    context: VoiceParseContext
  ): ParsedVoiceExpense[];
  parseIncome(
    rawTranscript: string,
    alternatives: SpeechAlternative[],
    context: VoiceParseContext
  ): ParsedVoiceIncome | null;
}

const NOTE_FILLER_TOKENS = new Set([
  'gaste',
  'compre',
  'pague',
  'consumi',
  'cobre',
  'recibi',
  'hice',
  'acabo',
  'de',
  'del',
  'una',
  'un',
  'compra',
  'gasto',
  'pago',
  'ingreso',
  'en',
  'por',
  'para',
  'a',
  'al',
  'con',
  'fue',
  'fueron',
  'son',
  'es',
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
  'ademas',
  'luego',
  'tambien',
  'despues',
]);

interface DetailedExpenseParse {
  expense: ParsedVoiceExpense;
  hasAmount: boolean;
  explicitCurrency: boolean;
  explicitPayment: boolean;
  explicitDate: boolean;
  hasMerchant: boolean;
  hasConceptWords: boolean;
  matchedBy: 'learned' | 'classifier' | 'none';
  merchantBeforeAmount: boolean;
}

function parseSingleExpenseClause(
  clauseRaw: string,
  classifier: CategoryClassifier,
  options: {
    knownPlaces: string[];
    learnedMatches: LearnedMatch[];
    defaultDate: string;
    referenceDate: Date;
    defaultPayment?: PaymentMethod;
  }
): DetailedExpenseParse {
  const tokens = tokenizeUtterance(clauseRaw);
  const dateMatch = extractDateFromTokens(tokens, options.defaultDate, options.referenceDate);
  const dateExcluded = extractAllDateTokenIndices(tokens, options.defaultDate, options.referenceDate);

  const amounts = extractMonetaryExpressions(clauseRaw, tokens, dateExcluded);
  const primaryAmount: MonetaryMatch | null = amounts[0] ?? null;

  const paymentInfo = extractPaymentMethodFromTokens(tokens);

  const consumedIndices = new Set<number>();
  for (const idx of dateExcluded) consumedIndices.add(idx);
  for (const idx of paymentInfo.matchedTokenIndices) consumedIndices.add(idx);
  if (primaryAmount) {
    for (let k = primaryAmount.startToken; k <= primaryAmount.endToken; k++) {
      consumedIndices.add(k);
    }
  }

  const merchantInfo = extractMerchantFromTokens(tokens, options.knownPlaces, consumedIndices);
  for (const idx of merchantInfo.matchedTokenIndices) {
    consumedIndices.add(idx);
  }

  // Tokens que quedan disponibles como señal semántica/producto/lugar (sin dígitos ni fechas ni pago)
  const classifierInputTokens = tokens.filter((t) => {
    if (t.kind === 'punct') return false;
    if (dateExcluded.has(t.index)) return false;
    if (paymentInfo.matchedTokenIndices.includes(t.index)) return false;
    if (primaryAmount && t.index >= primaryAmount.startToken && t.index <= primaryAmount.endToken) {
      return false;
    }
    return true;
  });
  const classifierText = classifierInputTokens.map((t) => t.raw).join(' ').trim() || clauseRaw;
  const cat = classifier.classify(classifierText);

  let resolvedMerchant = merchantInfo.merchantName;
  if (!resolvedMerchant && cat.matchedBy === 'learned' && cat.categoryId) {
    const matchingLearned = options.learnedMatches.find(
      (l) =>
        l.categoryId === cat.categoryId &&
        l.merchantName &&
        normalizeText(clauseRaw).includes(normalizeText(l.phrase))
    );
    if (matchingLearned?.merchantName) {
      resolvedMerchant = matchingLearned.merchantName;
    }
  }

  // Comprobar si la cláusula aporta palabras reales de concepto/producto tras quitar montos, fechas, pago y comercio
  const remainingConceptWords = tokens.filter(
    (t) =>
      !consumedIndices.has(t.index) &&
      t.kind === 'word' &&
      !NOTE_FILLER_TOKENS.has(t.norm) &&
      t.norm.length >= 2
  );
  const hasConceptWords = remainingConceptWords.length > 0 || cat.matchedBy !== 'none';

  const paymentMethod: PaymentMethod = paymentInfo.explicit
    ? paymentInfo.method
    : options.defaultPayment ?? paymentInfo.method;

  const merchantBeforeAmount = Boolean(
    resolvedMerchant &&
      primaryAmount &&
      merchantInfo.matchedTokenIndices.length > 0 &&
      Math.max(...merchantInfo.matchedTokenIndices) < primaryAmount.startToken
  );

  const confidence =
    cat.matchedBy === 'none'
      ? 0
      : primaryAmount
      ? cat.confidence
      : Math.min(0.55, cat.confidence);

  return {
    expense: {
      amountCents: primaryAmount ? primaryAmount.amountCents : 0,
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      merchantName: resolvedMerchant,
      paymentMethod,
      note: undefined,
      occurredOn: dateMatch.occurredOn,
      confidence,
      rawSegment: clauseRaw,
    },
    hasAmount: primaryAmount !== null,
    explicitCurrency: Boolean(
      primaryAmount &&
        (primaryAmount.evidence === 'explicit_currency' || primaryAmount.evidence === 'slang')
    ),
    explicitPayment: paymentInfo.explicit,
    explicitDate: dateMatch.explicit,
    hasMerchant: Boolean(resolvedMerchant),
    hasConceptWords,
    matchedBy: cat.matchedBy,
    merchantBeforeAmount,
  };
}

function parseExpenseHypothesis(
  rawTranscript: string,
  classifier: CategoryClassifier,
  context: VoiceParseContext
): { expenses: ParsedVoiceExpense[]; details: DetailedExpenseParse[]; hadRepair: boolean } {
  const trimmed = rawTranscript.trim();
  const refDate = context.referenceDate ?? new Date();
  const baseDate = context.defaultDate ?? formatLocalDateISO(refDate);

  if (!trimmed) {
    return { expenses: [], details: [], hadRepair: false };
  }

  const knownPlaces = context.knownPlaces ?? [];
  const learnedMatches = context.learnedMatches ?? [];

  const scoped = resolveScopedRepairs(trimmed, refDate);

  if (scoped.hadRepair) {
    const details: DetailedExpenseParse[] = [];
    let sessionDate = baseDate;

    // 1. Mantener intactos los ítems previos a la cláusula corregida
    for (const prefixText of scoped.frozenPrefixTexts) {
      const parsed = parseSingleExpenseClause(prefixText, classifier, {
        knownPlaces,
        learnedMatches,
        defaultDate: sessionDate,
        referenceDate: refDate,
      });
      if (parsed.explicitDate) {
        sessionDate = parsed.expense.occurredOn;
      }
      details.push(parsed);
    }

    // 2. Plegar secuencialmente la cadena de reparación [localBefore, tail_1, ...]
    if (scoped.repairChainTexts.length > 0) {
      let state = parseSingleExpenseClause(scoped.repairChainTexts[0], classifier, {
        knownPlaces,
        learnedMatches,
        defaultDate: sessionDate,
        referenceDate: refDate,
      });

      let replacedByMulti = false;
      const multiTailResults: DetailedExpenseParse[] = [];

      for (let i = 1; i < scoped.repairChainTexts.length; i++) {
        const tailText = scoped.repairChainTexts[i];
        const tailClauses = segmentTransactionClauses(tailText, state.expense.occurredOn, refDate);

        if (tailClauses.length >= 2) {
          replacedByMulti = true;
          multiTailResults.length = 0;
          let runningDate = state.expense.occurredOn;
          for (const tc of tailClauses) {
            const p = parseSingleExpenseClause(tc.rawText, classifier, {
              knownPlaces,
              learnedMatches,
              defaultDate: runningDate,
              referenceDate: refDate,
            });
            if (p.explicitDate) runningDate = p.expense.occurredOn;
            multiTailResults.push(p);
          }
          state = multiTailResults[multiTailResults.length - 1];
          continue;
        }

        replacedByMulti = false;
        const patch = parseSingleExpenseClause(tailText, classifier, {
          knownPlaces,
          learnedMatches,
          defaultDate: state.expense.occurredOn,
          referenceDate: refDate,
        });

        const mergedAmountCents = patch.hasAmount
          ? patch.expense.amountCents
          : state.expense.amountCents;

        const mergedPayment = patch.explicitPayment
          ? patch.expense.paymentMethod
          : state.expense.paymentMethod;

        const mergedDate = patch.explicitDate
          ? patch.expense.occurredOn
          : state.expense.occurredOn;

        const mergedMerchant = patch.expense.merchantName ?? state.expense.merchantName;

        const keepPreviousConcept = !patch.hasConceptWords && state.hasConceptWords;

        const mergedCategoryId = keepPreviousConcept
          ? state.expense.categoryId
          : patch.expense.categoryId;
        const mergedCategoryName = keepPreviousConcept
          ? state.expense.categoryName
          : patch.expense.categoryName;

        const mergedMatchedBy = keepPreviousConcept ? state.matchedBy : patch.matchedBy;
        const baseConfidence = keepPreviousConcept
          ? state.expense.confidence
          : patch.expense.confidence;
        const mergedConfidence =
          mergedMatchedBy === 'none' ? 0 : Math.max(0.92, baseConfidence);

        state = {
          expense: {
            amountCents: mergedAmountCents,
            categoryId: mergedCategoryId,
            categoryName: mergedCategoryName,
            merchantName: mergedMerchant,
            paymentMethod: mergedPayment,
            note: undefined,
            occurredOn: mergedDate,
            confidence: Number(Math.min(0.99, mergedConfidence).toFixed(3)),
            rawSegment: trimmed,
          },
          hasAmount: state.hasAmount || patch.hasAmount,
          explicitCurrency: state.explicitCurrency || patch.explicitCurrency,
          explicitPayment: state.explicitPayment || patch.explicitPayment,
          explicitDate: state.explicitDate || patch.explicitDate,
          hasMerchant: Boolean(mergedMerchant),
          hasConceptWords: state.hasConceptWords || patch.hasConceptWords,
          matchedBy: mergedMatchedBy,
          merchantBeforeAmount: state.merchantBeforeAmount || patch.merchantBeforeAmount,
        };
      }

      if (replacedByMulti && multiTailResults.length > 0) {
        details.push(...multiTailResults);
      } else {
        details.push(state);
      }
    }

    return {
      expenses: details.map((d) => d.expense),
      details,
      hadRepair: true,
    };
  }

  // Caso normal / multi-gasto sin reparaciones
  const clauses = segmentTransactionClauses(trimmed, baseDate, refDate);

  if (clauses.length === 0) {
    const fallbackParsed = parseSingleExpenseClause(trimmed, classifier, {
      knownPlaces,
      learnedMatches,
      defaultDate: baseDate,
      referenceDate: refDate,
    });
    return {
      expenses: [fallbackParsed.expense],
      details: [fallbackParsed],
      hadRepair: false,
    };
  }

  const details: DetailedExpenseParse[] = [];
  let runningDate = baseDate;
  let sharedLeadingMerchant: string | undefined;

  for (let i = 0; i < clauses.length; i++) {
    const parsed = parseSingleExpenseClause(clauses[i].rawText, classifier, {
      knownPlaces,
      learnedMatches,
      defaultDate: runningDate,
      referenceDate: refDate,
    });

    if (i === 0) {
      if (parsed.explicitDate) {
        runningDate = parsed.expense.occurredOn;
      }
      // Sólo compartimos comercio entre ítems si apareció al inicio antes de un verbo/monto
      // (ej: "En Tambo compré 5 soles en galletas y 3 en agua"), evitando fuga lateral
      // en casos como "Menú 15 soles en Don Pepe y taxi 5 soles".
      if (clauses.length >= 2 && parsed.merchantBeforeAmount && parsed.expense.merchantName) {
        sharedLeadingMerchant = parsed.expense.merchantName;
      }
    } else if (!parsed.expense.merchantName && sharedLeadingMerchant) {
      const catNorm = normalizeText(parsed.expense.categoryName || '');
      if (
        !catNorm.includes('transporte') &&
        !catNorm.includes('servicios') &&
        !catNorm.includes('deudas')
      ) {
        parsed.expense.merchantName = sharedLeadingMerchant;
      }
    }

    details.push(parsed);
  }

  return {
    expenses: details.map((d) => d.expense),
    details,
    hadRepair: false,
  };
}

function scoreExpenseHypothesis(
  result: { expenses: ParsedVoiceExpense[]; details: DetailedExpenseParse[]; hadRepair: boolean },
  acousticConfidence: number,
  rankIndex: number
): number {
  if (result.expenses.length === 0) return -10;

  const acConf =
    acousticConfidence >= 0 && acousticConfidence <= 1
      ? acousticConfidence
      : Math.max(0.45, 0.78 - rankIndex * 0.06);

  let semanticScore = 0;
  for (const d of result.details) {
    semanticScore += d.hasAmount ? 1.4 : -1.5;
    if (d.explicitCurrency) semanticScore += 0.35;
    if (d.explicitPayment) semanticScore += 0.6;
    if (d.hasMerchant) semanticScore += 0.45;
    if (d.explicitDate) semanticScore += 0.25;
    semanticScore += d.matchedBy === 'none' ? 0 : d.expense.confidence * 0.95;
  }

  const avgSemantic = semanticScore / result.details.length;
  const repairBonus = result.hadRepair ? 0.15 : 0;
  const primaryTieBreaker = rankIndex === 0 ? 0.01 : 0;

  return avgSemantic + 0.85 * acConf + repairBonus + primaryTieBreaker;
}

function parseSingleIncomeHypothesis(
  rawTranscript: string,
  classifier: CategoryClassifier,
  context: VoiceParseContext
): {
  income: ParsedVoiceIncome;
  hasAmount: boolean;
  explicitCurrency: boolean;
  explicitDate: boolean;
  matchedBy: 'learned' | 'classifier' | 'none';
  hadRepair: boolean;
} | null {
  const trimmed = rawTranscript.trim();
  if (!trimmed) return null;

  const refDate = context.referenceDate ?? new Date();
  const baseDate = context.defaultDate ?? formatLocalDateISO(refDate);

  const scoped = resolveScopedRepairs(trimmed, refDate);
  const repairStages = scoped.hadRepair ? scoped.repairChainTexts : [trimmed];

  const extractStage = (stageText: string, inheritedDate: string) => {
    const tokens = tokenizeUtterance(stageText);
    const dateMatch = extractDateFromTokens(tokens, inheritedDate, refDate);
    const dateExcluded = extractAllDateTokenIndices(tokens, inheritedDate, refDate);
    const amounts = extractMonetaryExpressions(stageText, tokens, dateExcluded);
    const primaryAmount = amounts[0] ?? null;

    const consumedIndices = new Set<number>();
    for (const idx of dateExcluded) consumedIndices.add(idx);
    if (primaryAmount) {
      for (let k = primaryAmount.startToken; k <= primaryAmount.endToken; k++) {
        consumedIndices.add(k);
      }
    }

    const classifierTokens = tokens.filter((t) => {
      if (t.kind === 'punct') return false;
      if (dateExcluded.has(t.index)) return false;
      if (primaryAmount && t.index >= primaryAmount.startToken && t.index <= primaryAmount.endToken) {
        return false;
      }
      return true;
    });

    const cat = classifier.classify(classifierTokens.map((t) => t.raw).join(' ').trim() || stageText);

    const remainingConceptWords = tokens.filter(
      (t) =>
        !consumedIndices.has(t.index) &&
        t.kind === 'word' &&
        !NOTE_FILLER_TOKENS.has(t.norm) &&
        t.norm.length >= 2
    );

    const source = extractIncomeSource(tokens, consumedIndices, cat.categoryName);

    return {
      amountCents: primaryAmount ? primaryAmount.amountCents : 0,
      hasAmount: primaryAmount !== null,
      explicitCurrency: Boolean(
        primaryAmount &&
          (primaryAmount.evidence === 'explicit_currency' || primaryAmount.evidence === 'slang')
      ),
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      confidence:
        cat.matchedBy === 'none'
          ? 0
          : primaryAmount
          ? cat.confidence
          : Math.min(0.55, cat.confidence),
      matchedBy: cat.matchedBy,
      occurredOn: dateMatch.occurredOn,
      explicitDate: dateMatch.explicit,
      source,
      hasConceptWords: remainingConceptWords.length > 0 || cat.matchedBy !== 'none',
    };
  };

  let state = extractStage(repairStages[0], baseDate);
  for (let i = 1; i < repairStages.length; i++) {
    const patch = extractStage(repairStages[i], state.occurredOn);
    const keepConcept = !patch.hasConceptWords && state.hasConceptWords;
    const mergedMatchedBy = keepConcept ? state.matchedBy : patch.matchedBy;
    const baseConf = keepConcept ? state.confidence : patch.confidence;
    state = {
      amountCents: patch.hasAmount ? patch.amountCents : state.amountCents,
      hasAmount: state.hasAmount || patch.hasAmount,
      explicitCurrency: state.explicitCurrency || patch.explicitCurrency,
      categoryId: keepConcept ? state.categoryId : patch.categoryId,
      categoryName: keepConcept ? state.categoryName : patch.categoryName,
      confidence: mergedMatchedBy === 'none' ? 0 : Math.max(0.9, baseConf),
      matchedBy: mergedMatchedBy,
      occurredOn: patch.explicitDate ? patch.occurredOn : state.occurredOn,
      explicitDate: state.explicitDate || patch.explicitDate,
      source: keepConcept ? state.source : patch.source,
      hasConceptWords: state.hasConceptWords || patch.hasConceptWords,
    };
  }

  return {
    income: {
      amountCents: state.amountCents,
      categoryId: state.categoryId,
      categoryName: state.categoryName,
      source: state.source,
      note: undefined,
      occurredOn: state.occurredOn,
      confidence: Number(Math.min(0.99, state.confidence).toFixed(3)),
      rawSegment: trimmed,
    },
    hasAmount: state.hasAmount,
    explicitCurrency: state.explicitCurrency,
    explicitDate: state.explicitDate,
    matchedBy: state.matchedBy,
    hadRepair: scoped.hadRepair,
  };
}

function normalizeHypotheses(
  rawTranscript: string,
  alternatives: SpeechAlternative[]
): SpeechAlternative[] {
  const seen = new Set<string>();
  const ordered: SpeechAlternative[] = [];

  const pushUnique = (transcript: string, confidence: number) => {
    const clean = transcript.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push({ transcript: clean, confidence });
  };

  pushUnique(rawTranscript, alternatives[0]?.confidence ?? -1);
  for (const alt of alternatives) {
    if (ordered.length >= 5) break;
    pushUnique(alt.transcript, alt.confidence);
  }

  return ordered;
}

/**
 * Intérprete NLU 100% Local (Offline / Cero APIs externas):
 * Combina gramática formal española, desambiguación sintáctica de spans,
 * clasificador Bayesiano Multinomial con trigramas fonéticos y reranking multi-hipótesis.
 */
export class LocalStatisticalVoiceInterpreter implements VoiceNluInterpreter {
  readonly id = 'local-statistical-nlu-v2';

  parseExpenses(
    rawTranscript: string,
    alternatives: SpeechAlternative[] = [],
    context: VoiceParseContext = {}
  ): ParsedVoiceExpense[] {
    const hypotheses = normalizeHypotheses(rawTranscript, alternatives);
    if (hypotheses.length === 0) return [];

    const classifier = new CategoryClassifier({
      type: 'expense',
      userCategories: context.userCategories,
      learnedMatches: context.learnedMatches,
      historicalSamples: context.historicalSamples,
    });

    let bestScore = -Infinity;
    let bestExpenses: ParsedVoiceExpense[] = [];

    for (let i = 0; i < hypotheses.length; i++) {
      const hyp = hypotheses[i];
      const parsed = parseExpenseHypothesis(hyp.transcript, classifier, context);
      const totalScore = scoreExpenseHypothesis(parsed, hyp.confidence, i);
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestExpenses = parsed.expenses;
      }
    }

    return bestExpenses;
  }

  parseIncome(
    rawTranscript: string,
    alternatives: SpeechAlternative[] = [],
    context: VoiceParseContext = {}
  ): ParsedVoiceIncome | null {
    const hypotheses = normalizeHypotheses(rawTranscript, alternatives);
    if (hypotheses.length === 0) return null;

    const classifier = new CategoryClassifier({
      type: 'income',
      userCategories: context.userCategories,
      learnedMatches: context.learnedMatches,
      historicalSamples: context.historicalSamples,
    });

    let bestScore = -Infinity;
    let bestIncome: ParsedVoiceIncome | null = null;

    for (let i = 0; i < hypotheses.length; i++) {
      const hyp = hypotheses[i];
      const parsed = parseSingleIncomeHypothesis(hyp.transcript, classifier, context);
      if (!parsed) continue;

      const acConf =
        hyp.confidence >= 0 && hyp.confidence <= 1
          ? hyp.confidence
          : Math.max(0.45, 0.78 - i * 0.06);

      let score =
        (parsed.hasAmount ? 1.4 : -1.5) +
        (parsed.explicitCurrency ? 0.35 : 0) +
        (parsed.explicitDate ? 0.25 : 0) +
        (parsed.matchedBy === 'none' ? 0 : parsed.income.confidence * 0.95) +
        0.85 * acConf +
        (parsed.hadRepair ? 0.15 : 0) +
        (i === 0 ? 0.01 : 0);

      if (parsed.income.source && parsed.income.source !== parsed.income.categoryName) {
        score += 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIncome = parsed.income;
      }
    }

    return bestIncome;
  }
}

export const defaultVoiceInterpreter: VoiceNluInterpreter =
  new LocalStatisticalVoiceInterpreter();

