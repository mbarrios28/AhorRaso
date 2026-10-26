import {
  parseVoiceTranscript,
  levenshteinDistance,
  stringSimilarity,
  resolveSpeechRepair,
  extractMonetaryAmounts,
} from '../voiceParser';

describe('voiceParser (HU-10: Procesamiento de lenguaje natural no rígido)', () => {
  describe('Fuzzy Matching (Levenshtein Distance)', () => {
    it('calcula distancia de edición correctamente', () => {
      expect(levenshteinDistance('taxi', 'tasi')).toBe(1);
      expect(levenshteinDistance('almuerzo', 'almuerso')).toBe(1);
      expect(levenshteinDistance('chifa', 'chiffa')).toBe(1);
    });

    it('calcula similitud normalizada alta para errores ortográficos comunes', () => {
      expect(stringSimilarity('taxi', 'tasi')).toBeGreaterThanOrEqual(0.75);
      expect(stringSimilarity('almuerzo', 'almuerso')).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('Detección de montos y Jerga Peruana', () => {
    it('detecta montos numéricos simples', () => {
      const amounts = extractMonetaryAmounts('Gasté 15 soles en almuerzo');
      expect(amounts).toHaveLength(1);
      expect(amounts[0].amountCents).toBe(1500);
    });

    it('detecta jerga peruana: lucas', () => {
      const amounts = extractMonetaryAmounts('Pagué 20 lucas en taxi');
      expect(amounts).toHaveLength(1);
      expect(amounts[0].amountCents).toBe(2000);
    });

    it('detecta jerga peruana compuesta: X lucas y media', () => {
      const amounts = extractMonetaryAmounts('dos lucas y media en galletas');
      expect(amounts).toHaveLength(1);
      expect(amounts[0].amountCents).toBe(250);
    });

    it('detecta jerga: media luca / china', () => {
      const amounts1 = extractMonetaryAmounts('media luca en fotocopias');
      expect(amounts1[0].amountCents).toBe(50);

      const amounts2 = extractMonetaryAmounts('una china de pasaje');
      expect(amounts2[0].amountCents).toBe(50);
    });

    it('detecta decimales hablados: "quince con cincuenta"', () => {
      const amounts = extractMonetaryAmounts('menú de quince con cincuenta');
      expect(amounts).toHaveLength(1);
      expect(amounts[0].amountCents).toBe(1550);
    });

    it('distingue cantidades de artículos del precio monetario ("6 panes por 2 soles")', () => {
      const amounts = extractMonetaryAmounts('Compré 6 panes por 2 soles');
      expect(amounts).toHaveLength(1);
      expect(amounts[0].amountCents).toBe(200);
    });
  });

  describe('Auto-corrección y Speech Repairs ("ah no espera")', () => {
    it('detecta el marcador de corrección y prioriza el segmento corregido', () => {
      const transcript =
        'Compré una black de 2 soles en el chino, ah no espera, son 3 soles y fue una coca cola';
      const repair = resolveSpeechRepair(transcript);
      expect(repair.hadRepair).toBe(true);

      const parsed = parseVoiceTranscript(transcript);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(300);
      expect(parsed[0].categoryName).toBe('Alimentación');
    });

    it('maneja corrección con "mentira, fueron 10 soles"', () => {
      const transcript = 'Almuerzo 8 soles, mentira fueron 10 soles';
      const parsed = parseVoiceTranscript(transcript);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(1000);
    });
  });

  describe('Segmentación Multi-Gasto', () => {
    it('segmenta múltiples gastos con conectores ("y")', () => {
      const transcript = '15 en almuerzo y 5 en taxi';
      const parsed = parseVoiceTranscript(transcript);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[1].amountCents).toBe(500);
      expect(parsed[1].categoryName).toBe('Transporte');
    });

    it('segmenta múltiples gastos SIN conectores mediante anclas monetarias', () => {
      const transcript = 'menú 15 soles taxi 5 galleta 2 soles';
      const parsed = parseVoiceTranscript(transcript);

      expect(parsed).toHaveLength(3);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[1].amountCents).toBe(500);
      expect(parsed[1].categoryName).toBe('Transporte');
      expect(parsed[2].amountCents).toBe(200);
      expect(parsed[2].categoryName).toBe('Alimentación');
    });
  });

  describe('Autoaprendizaje Adaptativo (Learned Matches)', () => {
    it('prioriza patrones previamente aprendidos por el usuario', () => {
      const transcript = 'Gasté 8 soles en black';
      const learnedMatches = [
        {
          phrase: 'black',
          categoryId: 'cat-custom-snack-99',
          merchantName: 'Bodega Central',
          hitCount: 5,
        },
      ];
      const userCategories = [
        { id: 'cat-custom-snack-99', name: 'Snacks Favoritos' },
      ];

      const parsed = parseVoiceTranscript(transcript, {
        userCategories,
        learnedMatches,
      });

      expect(parsed).toHaveLength(1);
      expect(parsed[0].categoryId).toBe('cat-custom-snack-99');
      expect(parsed[0].categoryName).toBe('Snacks Favoritos');
      expect(parsed[0].confidence).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('Detección de Método de Pago y Establecimiento', () => {
    it('detecta Yape / Plin como método digital', () => {
      const parsed = parseVoiceTranscript('Menú 12 soles por yape en don pepe');
      expect(parsed[0].paymentMethod).toBe('digital');
      expect(parsed[0].merchantName).toBe('Don pepe');
    });

    it('detecta efectivo correctamente', () => {
      const parsed = parseVoiceTranscript('Taxi 8 soles pagado en efectivo');
      expect(parsed[0].paymentMethod).toBe('cash');
    });
  });
});
