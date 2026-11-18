import { Token } from './tokenizer';
import { formatLocalDateISO } from './textUtils';

export interface ExtractedDateSpan {
  occurredOn: string; // YYYY-MM-DD
  matchedTokenIndices: number[];
  explicit: boolean;
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

const SMALL_DAYS: Record<string, number> = {
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
  veinte: 20,
  treinta: 30,
};

function addDaysLocal(base: Date, deltaDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return formatLocalDateISO(d);
}

/**
 * Extractor formal de fechas relativas y absolutas sobre secuencia de tokens.
 * Usa siempre la hora local del dispositivo (sin desfases UTC).
 */
export function extractDateFromTokens(
  tokens: Token[],
  defaultDate?: string,
  referenceDate: Date = new Date()
): ExtractedDateSpan {
  const fallback = defaultDate || formatLocalDateISO(referenceDate);

  for (let i = 0; i < tokens.length; i++) {
    const t0 = tokens[i];
    if (t0.kind !== 'word') continue;
    const t1 = tokens[i + 1];
    const t2 = tokens[i + 2];
    const t3 = tokens[i + 3];
    const t4 = tokens[i + 4];

    // "antes de ayer"
    if (t0.norm === 'antes' && t1?.norm === 'de' && t2?.norm === 'ayer') {
      return {
        occurredOn: addDaysLocal(referenceDate, -2),
        matchedTokenIndices: [i, i + 1, i + 2],
        explicit: true,
      };
    }

    // "anteayer" / "antier"
    if (t0.norm === 'anteayer' || t0.norm === 'antier') {
      return {
        occurredOn: addDaysLocal(referenceDate, -2),
        matchedTokenIndices: [i],
        explicit: true,
      };
    }

    // "el dia de ayer"
    if (t0.norm === 'el' && t1?.norm === 'dia' && t2?.norm === 'de' && t3?.norm === 'ayer') {
      return {
        occurredOn: addDaysLocal(referenceDate, -1),
        matchedTokenIndices: [i, i + 1, i + 2, i + 3],
        explicit: true,
      };
    }

    // "ayer en la noche/tarde/mañana"
    if (
      t0.norm === 'ayer' &&
      t1?.norm === 'en' &&
      t2?.norm === 'la' &&
      (t3?.norm === 'noche' || t3?.norm === 'tarde' || t3?.norm === 'manana')
    ) {
      return {
        occurredOn: addDaysLocal(referenceDate, -1),
        matchedTokenIndices: [i, i + 1, i + 2, i + 3],
        explicit: true,
      };
    }

    // "ayer" / "anoche"
    if (t0.norm === 'ayer' || t0.norm === 'anoche') {
      return {
        occurredOn: addDaysLocal(referenceDate, -1),
        matchedTokenIndices: [i],
        explicit: true,
      };
    }

    // "el dia de hoy"
    if (t0.norm === 'el' && t1?.norm === 'dia' && t2?.norm === 'de' && t3?.norm === 'hoy') {
      return {
        occurredOn: addDaysLocal(referenceDate, 0),
        matchedTokenIndices: [i, i + 1, i + 2, i + 3],
        explicit: true,
      };
    }

    // "hoy dia"
    if (t0.norm === 'hoy' && t1?.norm === 'dia') {
      return {
        occurredOn: addDaysLocal(referenceDate, 0),
        matchedTokenIndices: [i, i + 1],
        explicit: true,
      };
    }

    // "hoy"
    if (t0.norm === 'hoy') {
      return {
        occurredOn: addDaysLocal(referenceDate, 0),
        matchedTokenIndices: [i],
        explicit: true,
      };
    }

    // "hace N dias"
    if (t0.norm === 'hace' && t1 && (t2?.norm === 'dias' || t2?.norm === 'dia')) {
      const n =
        t1.kind === 'number' && t1.numericValue !== undefined
          ? Math.round(t1.numericValue)
          : SMALL_DAYS[t1.norm];
      if (n !== undefined && n >= 0 && n <= 365) {
        return {
          occurredOn: addDaysLocal(referenceDate, -n),
          matchedTokenIndices: [i, i + 1, i + 2],
          explicit: true,
        };
      }
    }

    // "(el) <diaSemana> (pasado)?"
    if (WEEKDAYS[t0.norm] !== undefined) {
      const targetDay = WEEKDAYS[t0.norm];
      const currentDay = referenceDate.getDay();
      let diff = (currentDay - targetDay + 7) % 7;
      const hasPasado = t1?.norm === 'pasado';
      if (diff === 0 && hasPasado) {
        diff = 7;
      }
      const indices: number[] = [];
      if (i > 0 && tokens[i - 1].norm === 'el') {
        indices.push(i - 1);
      }
      indices.push(i);
      if (hasPasado) {
        indices.push(i + 1);
      }
      return {
        occurredOn: addDaysLocal(referenceDate, -diff),
        matchedTokenIndices: indices,
        explicit: true,
      };
    }

    // "(el) <day> de <month>"
    if (
      t0.norm === 'el' &&
      t1?.kind === 'number' &&
      t1.numericValue !== undefined &&
      t2?.norm === 'de' &&
      t3 &&
      MONTHS[t3.norm] !== undefined
    ) {
      const dayNum = Math.round(t1.numericValue);
      const monthIdx = MONTHS[t3.norm];
      if (dayNum >= 1 && dayNum <= 31) {
        let year = referenceDate.getFullYear();
        let candidate = new Date(year, monthIdx, dayNum);
        const todayMidnight = new Date(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          referenceDate.getDate()
        );
        if (candidate.getTime() > todayMidnight.getTime()) {
          year -= 1;
          candidate = new Date(year, monthIdx, dayNum);
        }
        const indices = [i, i + 1, i + 2, i + 3];
        if (t4?.kind === 'number' && t4.numericValue && t4.numericValue >= 2000 && t4.numericValue <= 2100) {
          candidate = new Date(Math.round(t4.numericValue), monthIdx, dayNum);
          indices.push(i + 4);
        }
        if (candidate.getMonth() === monthIdx && candidate.getDate() === dayNum) {
          return {
            occurredOn: formatLocalDateISO(candidate),
            matchedTokenIndices: indices,
            explicit: true,
          };
        }
      }
    }
  }

  return {
    occurredOn: fallback,
    matchedTokenIndices: [],
    explicit: false,
  };
}

/**
 * Encuentra todas las expresiones de fecha en el enunciado para proteger sus dígitos
 * de ser interpretados como montos monetarios en frases multi-gasto.
 */
export function extractAllDateTokenIndices(
  tokens: Token[],
  defaultDate?: string,
  referenceDate: Date = new Date()
): Set<number> {
  const excluded = new Set<number>();
  let cursor = 0;

  while (cursor < tokens.length) {
    const slice = tokens.slice(cursor);
    const res = extractDateFromTokens(slice, defaultDate, referenceDate);
    if (!res.explicit || res.matchedTokenIndices.length === 0) {
      break;
    }
    let maxMatched = 0;
    for (const relIdx of res.matchedTokenIndices) {
      excluded.add(cursor + relIdx);
      if (relIdx > maxMatched) maxMatched = relIdx;
    }
    cursor += maxMatched + 1;
  }

  return excluded;
}
