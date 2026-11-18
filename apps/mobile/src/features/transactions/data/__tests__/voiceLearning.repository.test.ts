/**
 * Pruebas de integración para VoiceLearningRepository sobre SQLite en memoria.
 */
import { DEV_USER_ID } from '@/core/dev/constants';
import { OTHER_USER_ID, resetDatabase } from '../../../../../test/helpers/test-db';
import { categoriesRepository } from '../../../categories/data/categories.repository';
import { transactionsRepository } from '../transactions.repository';
import { voiceLearningRepository } from '../voiceLearning.repository';

beforeEach(() => {
  resetDatabase();
});

describe('VoiceLearningRepository: autoaprendizaje e historial estadístico local', () => {
  it('almacena frases normalizadas sin tildes y coincide respetando fronteras de palabra', () => {
    const foodCat = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .find((c) => c.name === 'Alimentación')!;
    const shopCat = categoriesRepository
      .getByUser(DEV_USER_ID, 'expense')
      .find((c) => c.name === 'Compras')!;

    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Pan Francés', foodCat.id, 'Panadería');
    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Pan Francés', foodCat.id);
    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Pantalón', shopCat.id);

    const hit1 = voiceLearningRepository.findLearnedMatch(DEV_USER_ID, 'compre pan frances ayer');
    expect(hit1).not.toBeNull();
    expect(hit1?.categoryId).toBe(foodCat.id);
    expect(hit1?.hitCount).toBe(2);
    expect(hit1?.merchantName).toBe('Panadería');

    // No debe confundir subcadenas ("pan" no debe vencer a frontera de "pantalon")
    const hit2 = voiceLearningRepository.findLearnedMatch(DEV_USER_ID, '120 soles en pantalon');
    expect(hit2).not.toBeNull();
    expect(hit2?.categoryId).toBe(shopCat.id);
  });

  it('ignora frases genéricas vacías o de relleno para no contaminar el clasificador', () => {
    const foodCat = categoriesRepository.getByUser(DEV_USER_ID, 'expense')[0];

    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Gasto', foodCat.id);
    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Ingreso', foodCat.id);
    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Compra en Don Pepe', foodCat.id, 'Don Pepe');

    const stored = voiceLearningRepository.getAll(DEV_USER_ID);
    expect(stored.map((s) => s.phrase)).toEqual(['don pepe']);
  });

  it('aísla aprendidos por usuario y extrae muestras históricas recientes de transacciones', () => {
    const foodCat = categoriesRepository.getByUser(DEV_USER_ID, 'expense')[0];
    voiceLearningRepository.learnPhrase(DEV_USER_ID, 'Menu UNSA', foodCat.id);

    expect(voiceLearningRepository.findLearnedMatch(OTHER_USER_ID, 'menu unsa')).toBeNull();

    transactionsRepository.createExpense(DEV_USER_ID, {
      amountCents: 1500,
      occurredOn: '2026-11-08',
      categoryId: foodCat.id,
      merchantName: 'Doña Julia',
      paymentMethod: 'cash',
      note: 'Caldo de gallina',
      entryMethod: 'voice',
    });

    const samples = voiceLearningRepository.getHistoricalCategorySamples(DEV_USER_ID, 'expense');
    expect(samples.length).toBeGreaterThanOrEqual(1);
    expect(samples[0].categoryId).toBe(foodCat.id);
    expect(samples[0].text).toContain('Doña Julia');
    expect(samples[0].text).toContain('Caldo de gallina');
  });
});

