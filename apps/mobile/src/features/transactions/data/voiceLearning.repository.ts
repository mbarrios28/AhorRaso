import * as Crypto from 'expo-crypto';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db, merchants, transactions, voiceLearning, VoiceLearning } from '@/core/db';
import { normalizeText } from '../domain/voice/textUtils';
import { HistoricalCategorySample } from '../domain/voice/categoryClassifier';

export interface LearnedMatch {
  phrase: string;
  categoryId: string;
  merchantName?: string | null;
  hitCount: number;
}

const GENERIC_IGNORED_PHRASES = new Set([
  'gasto',
  'ingreso',
  'compra',
  'movimiento',
  'gasto por voz',
  'ingreso por voz',
  'otros gastos',
  'otros ingresos',
  'sin categoria',
]);

function sanitizeLearnablePhrase(rawPhrase: string, merchantName?: string): string {
  let cleaned = normalizeText(rawPhrase);
  if (!cleaned) return '';

  // Si la nota cayó en "compra en <Comercio>", aprendemos directamente el comercio
  if (cleaned.startsWith('compra en ')) {
    const remainder = cleaned.slice('compra en '.length).trim();
    cleaned = remainder || (merchantName ? normalizeText(merchantName) : '');
  }

  if (cleaned.length < 3 || GENERIC_IGNORED_PHRASES.has(cleaned)) {
    return '';
  }
  return cleaned;
}

export class VoiceLearningRepository {
  /**
   * Obtiene todos los patrones aprendidos por el usuario, ordenados por frecuencia de aciertos.
   */
  getAll(userId: string): VoiceLearning[] {
    return db
      .select()
      .from(voiceLearning)
      .where(eq(voiceLearning.userId, userId))
      .orderBy(desc(voiceLearning.hitCount))
      .all();
  }

  /**
   * Obtiene muestras históricas reales (comercio, fuente y nota) desde las transacciones
   * del usuario para alimentar el clasificador Bayesiano local sin red ni APIs.
   */
  getHistoricalCategorySamples(
    userId: string,
    type: 'expense' | 'income',
    limit = 150
  ): HistoricalCategorySample[] {
    const merchantRows = db
      .select()
      .from(merchants)
      .where(and(eq(merchants.userId, userId), isNull(merchants.deletedAt)))
      .all();
    const merchantMap = new Map<string, string>();
    for (const m of merchantRows) {
      merchantMap.set(m.id, m.name);
    }

    const txRows = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, type),
          isNull(transactions.deletedAt)
        )
      )
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .all();

    const samples: HistoricalCategorySample[] = [];
    for (const tx of txRows) {
      const mName = tx.merchantId ? merchantMap.get(tx.merchantId) : undefined;
      const parts = [mName, tx.source, tx.note]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());
      const combined = parts.join(' ');
      const norm = normalizeText(combined);
      if (norm.length >= 3 && !GENERIC_IGNORED_PHRASES.has(norm)) {
        samples.push({
          categoryId: tx.categoryId,
          text: combined,
        });
      }
    }

    return samples;
  }

  /**
   * Busca si alguna frase o alias previamente aprendido por el usuario aparece
   * dentro del texto dictado actual respetando fronteras de palabra (insensible a tildes).
   */
  findLearnedMatch(userId: string, inputText: string): LearnedMatch | null {
    const list = this.getAll(userId);
    const normInput = normalizeText(inputText);
    if (!normInput) return null;

    // Priorizar frases más específicas (mayor longitud normalizada, luego mayor hitCount)
    const sorted = [...list].sort((a, b) => {
      const lenDiff = normalizeText(b.phrase).length - normalizeText(a.phrase).length;
      if (lenDiff !== 0) return lenDiff;
      return b.hitCount - a.hitCount;
    });

    for (const item of sorted) {
      const phraseNorm = normalizeText(item.phrase);
      if (phraseNorm.length < 3) continue;

      const escaped = phraseNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRx = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i');
      if (boundaryRx.test(normInput)) {
        return {
          phrase: item.phrase,
          categoryId: item.categoryId,
          merchantName: item.merchantName,
          hitCount: item.hitCount,
        };
      }
    }

    return null;
  }

  /**
   * Guarda o refuerza un aprendizaje adaptativo normalizado (insensible a tildes) cuando el usuario
   * confirma o corrige una categoría para un producto, fuente o establecimiento.
   */
  learnPhrase(userId: string, rawPhrase: string, categoryId: string, merchantName?: string): void {
    const phrase = sanitizeLearnablePhrase(rawPhrase, merchantName);
    if (!phrase || phrase.length < 3) return;

    const now = new Date().toISOString();

    const existing = db
      .select()
      .from(voiceLearning)
      .where(and(eq(voiceLearning.userId, userId), eq(voiceLearning.phrase, phrase)))
      .get();

    if (existing) {
      // Incrementar peso de acierto y actualizar categoría
      db.update(voiceLearning)
        .set({
          categoryId,
          merchantName: merchantName?.trim() || existing.merchantName,
          hitCount: existing.hitCount + 1,
          updatedAt: now,
        })
        .where(eq(voiceLearning.id, existing.id))
        .run();
    } else {
      // Registrar nuevo aprendizaje
      db.insert(voiceLearning)
        .values({
          id: Crypto.randomUUID(),
          userId,
          phrase,
          categoryId,
          merchantName: merchantName?.trim() || null,
          hitCount: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }
}

export const voiceLearningRepository = new VoiceLearningRepository();
