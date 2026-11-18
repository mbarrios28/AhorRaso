import { normalizeWord, phoneticNormalize } from './textUtils';

export type TokenKind = 'word' | 'number' | 'currency' | 'punct' | 'symbol';

export interface Token {
  index: number;
  raw: string;
  lower: string;
  norm: string;
  phonetic: string;
  kind: TokenKind;
  start: number;
  end: number;
  numericValue?: number;
}

const TOKEN_PATTERN =
  /(?:s\/\s*\.?|\$|€)|(?:\d+(?:,\d{3})+(?:\.\d+)?|\d+[.,]\d{1,2}(?!\d)|\d+)|[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+(?:\+)?|[.,;!?]/g;

/**
 * Tokeniza el texto preservando exactamente los índices [start, end] sobre `rawText`,
 * eliminando cualquier desfase entre análisis normalizado y texto original.
 */
export function tokenizeUtterance(rawText: string): Token[] {
  if (!rawText) return [];

  const tokens: Token[] = [];
  const regex = new RegExp(TOKEN_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    const lower = raw.toLowerCase();
    const norm = normalizeWord(raw);

    let kind: TokenKind = 'word';
    let numericValue: number | undefined;

    if (/^(?:s\/\s*\.?|\$|€)$/i.test(raw)) {
      kind = 'currency';
    } else if (/^\d/.test(raw)) {
      kind = 'number';
      // Soporta separadores de miles ("1,200.50") y coma decimal ("15,50")
      const normalizedNum =
        /^\d+(?:,\d{3})+(?:\.\d+)?$/.test(raw)
          ? raw.replace(/,/g, '')
          : raw.replace(',', '.');
      const parsed = parseFloat(normalizedNum);
      if (!Number.isNaN(parsed)) {
        numericValue = parsed;
      }
    } else if (/^[.,;!?]$/.test(raw)) {
      kind = 'punct';
    }

    tokens.push({
      index: tokens.length,
      raw,
      lower,
      norm,
      phonetic: kind === 'word' ? phoneticNormalize(raw) : norm,
      kind,
      start,
      end,
      numericValue,
    });
  }

  return tokens;
}

/**
 * Recupera la subcadena exacta en `rawText` correspondiente a un rango inclusivo de tokens.
 */
export function sliceRawTokens(
  rawText: string,
  tokens: Token[],
  startTokenIdx: number,
  endTokenIdx: number
): string {
  if (
    tokens.length === 0 ||
    startTokenIdx < 0 ||
    endTokenIdx < startTokenIdx ||
    endTokenIdx >= tokens.length
  ) {
    return '';
  }
  return rawText.slice(tokens[startTokenIdx].start, tokens[endTokenIdx].end);
}

