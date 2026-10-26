import * as Crypto from 'expo-crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db, voiceLearning, VoiceLearning } from '@/core/db';

export interface LearnedMatch {
  phrase: string;
  categoryId: string;
  merchantName?: string | null;
  hitCount: number;
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
   * Busca si alguna frase o alias previamente aprendido por el usuario está contenido
   * dentro del texto dictado actual.
   * Ordena por longitud de frase descendente para priorizar coincidencias más específicas
   * (ej: "hamburguesa de don pepe" antes que solo "pepe").
   */
  findLearnedMatch(userId: string, normalizedText: string): LearnedMatch | null {
    const list = this.getAll(userId);
    const textLower = normalizedText.toLowerCase().trim();

    // Ordenar por longitud de frase descendente
    const sorted = [...list].sort((a, b) => b.phrase.length - a.phrase.length);

    for (const item of sorted) {
      const phraseLower = item.phrase.toLowerCase().trim();
      if (phraseLower.length >= 3 && textLower.includes(phraseLower)) {
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
   * Guarda o refuerza un aprendizaje adaptativo cuando el usuario confirma o corrige
   * una categoría para un producto o establecimiento.
   */
  learnPhrase(userId: string, rawPhrase: string, categoryId: string, merchantName?: string): void {
    const phrase = rawPhrase.trim().toLowerCase();
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
