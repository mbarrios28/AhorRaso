import { LearnedMatch } from '../data/voiceLearning.repository';
import {
  ParsedVoiceExpense,
  ParsedVoiceIncome,
  PaymentMethod,
  SpeechAlternative,
} from './types';
import {
  CategoryClassifier,
  CategoryLookupItem,
  HistoricalCategorySample,
} from './voice/categoryClassifier';
import { resolveScopedRepairs } from './voice/clauseParser';
import { extractAllDateTokenIndices, extractDateFromTokens } from './voice/dateParser';
import {
  defaultVoiceInterpreter,
  LocalStatisticalVoiceInterpreter,
  VoiceNluInterpreter,
  VoiceParseContext,
} from './voice/multiHypothesis';
import {
  extractMerchantFromTokens,
  extractPaymentMethodFromTokens,
  NON_MERCHANT_WORDS,
  POPULAR_PERUVIAN_MERCHANTS,
} from './voice/slotExtractor';
import { extractMonetaryExpressions, parseNumberToken } from './voice/spanishNumbers';
import {
  formatLocalDateISO,
  levenshteinDistance,
  normalizeText,
  stringSimilarity,
} from './voice/textUtils';
import { tokenizeUtterance } from './voice/tokenizer';

export type {
  CategoryLookupItem,
  HistoricalCategorySample,
  VoiceNluInterpreter,
  VoiceParseContext,
};

export {
  defaultVoiceInterpreter,
  formatLocalDateISO,
  levenshteinDistance,
  LocalStatisticalVoiceInterpreter,
  NON_MERCHANT_WORDS,
  normalizeText,
  parseNumberToken,
  POPULAR_PERUVIAN_MERCHANTS,
  stringSimilarity,
};

/**
 * Procesa disfluencias y reparaciones del habla ("ah no espera", "no mentira", "quise decir", "mejor dicho").
 */
export function resolveSpeechRepair(rawText: string): { activeText: string; hadRepair: boolean } {
  const res = resolveScopedRepairs(rawText);
  return {
    activeText: res.activeText,
    hadRepair: res.hadRepair,
  };
}

/**
 * Detecta método de pago sobre secuencia de tokens.
 */
export function detectPaymentMethod(text: string): PaymentMethod {
  return extractPaymentMethodFromTokens(tokenizeUtterance(text)).method;
}

/**
 * Extrae el nombre del establecimiento / comercio aplicando análisis sintáctico sobre tokens.
 */
export function extractMerchant(
  text: string,
  knownPlaces: string[] = []
): string | undefined {
  const clean = text.replace(/\[REPAIR\].*$/, '').trim();
  const tokens = tokenizeUtterance(clean);
  const dateExcluded = extractAllDateTokenIndices(tokens);
  const payment = extractPaymentMethodFromTokens(tokens);
  const excluded = new Set<number>(dateExcluded);
  for (const idx of payment.matchedTokenIndices) excluded.add(idx);
  return extractMerchantFromTokens(tokens, knownPlaces, excluded).merchantName;
}

/**
 * Extrae la fecha relativa o absoluta mencionada en la locución usando hora local.
 */
export function extractRelativeDate(
  text: string,
  defaultDate?: string,
  referenceDate: Date = new Date()
): string {
  return extractDateFromTokens(tokenizeUtterance(text), defaultDate, referenceDate).occurredOn;
}

/**
 * Clasifica la categoría usando el clasificador estadístico On-Device
 * + aprendizaje adaptativo + trigramas fonéticos con fronteras de palabra.
 * Devuelve `categoryName: undefined` si no hay coincidencia real.
 */
export function matchCategory(
  segment: string,
  userCategories: CategoryLookupItem[] = [],
  learnedMatches: LearnedMatch[] = [],
  historicalSamples: HistoricalCategorySample[] = []
): { categoryId?: string; categoryName?: string; confidence: number } {
  const classifier = new CategoryClassifier({
    type: 'expense',
    userCategories,
    learnedMatches,
    historicalSamples,
  });
  const res = classifier.classify(segment);
  return {
    categoryId: res.categoryId,
    categoryName: res.categoryName,
    confidence: res.confidence,
  };
}

export interface ExtractedAmount {
  amountCents: number;
  rawMatch: string;
  startIndex: number;
  endIndex: number;
  priority: number;
}

/**
 * Extrae montos monetarios en un texto usando gramática española formal y
 * desambiguación sintáctica de cantidades ("6 panes por 2 soles"), horas e identificadores.
 */
export function extractMonetaryAmounts(
  text: string
): { amountCents: number; rawMatch: string; index: number }[] {
  const tokens = tokenizeUtterance(text);
  const dateExcluded = extractAllDateTokenIndices(tokens);
  const matches = extractMonetaryExpressions(text, tokens, dateExcluded);
  return matches.map((m) => ({
    amountCents: m.amountCents,
    rawMatch: m.rawMatch,
    index: m.startIndex,
  }));
}

export interface ParseVoiceOptions {
  userCategories?: CategoryLookupItem[];
  learnedMatches?: LearnedMatch[];
  knownPlaces?: string[];
  historicalSamples?: HistoricalCategorySample[];
  alternatives?: SpeechAlternative[];
  defaultDate?: string; // YYYY-MM-DD
  referenceDate?: Date;
}

/**
 * Procesa dictado de gastos por voz 100% On-Device (sin APIs externas).
 * Integra gramática formal española, resolución scoped de speech repairs,
 * segmentación sintáctica multi-gasto, clasificación Bayesiana y reranking multi-hipótesis.
 */
export function parseVoiceTranscript(
  rawTranscript: string,
  options: ParseVoiceOptions = {}
): ParsedVoiceExpense[] {
  if (!rawTranscript || !rawTranscript.trim()) {
    return [];
  }

  const alternatives = options.alternatives ?? [];
  return defaultVoiceInterpreter.parseExpenses(rawTranscript, alternatives, {
    type: 'expense',
    userCategories: options.userCategories,
    learnedMatches: options.learnedMatches,
    knownPlaces: options.knownPlaces,
    historicalSamples: options.historicalSamples,
    defaultDate: options.defaultDate,
    referenceDate: options.referenceDate,
  });
}

/**
 * Variante explícita multi-hipótesis que evalúa conjuntamente el listado N-best del STT.
 */
export function parseVoiceExpensesFromAlternatives(
  rawTranscript: string,
  alternatives: SpeechAlternative[] = [],
  options: Omit<ParseVoiceOptions, 'alternatives'> = {}
): ParsedVoiceExpense[] {
  return parseVoiceTranscript(rawTranscript, {
    ...options,
    alternatives,
  });
}

/**
 * Procesa dictado de ingresos por voz 100% On-Device (para NewIncomeScreen).
 */
export function parseVoiceIncomeTranscript(
  rawTranscript: string,
  options: ParseVoiceOptions = {}
): ParsedVoiceIncome | null {
  if (!rawTranscript || !rawTranscript.trim()) {
    return null;
  }

  return defaultVoiceInterpreter.parseIncome(rawTranscript, options.alternatives ?? [], {
    type: 'income',
    userCategories: options.userCategories,
    learnedMatches: options.learnedMatches,
    historicalSamples: options.historicalSamples,
    defaultDate: options.defaultDate,
    referenceDate: options.referenceDate,
  });
}

export function parseVoiceIncomeFromAlternatives(
  rawTranscript: string,
  alternatives: SpeechAlternative[] = [],
  options: Omit<ParseVoiceOptions, 'alternatives'> = {}
): ParsedVoiceIncome | null {
  return parseVoiceIncomeTranscript(rawTranscript, {
    ...options,
    alternatives,
  });
}
