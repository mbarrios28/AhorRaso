import {
  parseVoiceTranscript,
  parseVoiceExpensesFromAlternatives,
  parseVoiceIncomeTranscript,
  levenshteinDistance,
  stringSimilarity,
  resolveSpeechRepair,
  extractMonetaryAmounts,
  formatLocalDateISO,
} from '../voiceParser';

describe('voiceParser (HU-10: NLU 100% On-Device con Gramática Formal + Bayesiano)', () => {
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

  describe('Detección de montos, Gramática Española y Jerga Peruana', () => {
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

    it('detecta decimales hablados: "quince con cincuenta" y "siete punto cinco"', () => {
      const amounts1 = extractMonetaryAmounts('menú de quince con cincuenta');
      expect(amounts1).toHaveLength(1);
      expect(amounts1[0].amountCents).toBe(1550);

      const amounts2 = extractMonetaryAmounts('café de siete punto cinco soles');
      expect(amounts2).toHaveLength(1);
      expect(amounts2[0].amountCents).toBe(750);
    });

    it('soporta numerales españoles compuestos ("treinta y cinco", "dos mil quinientos")', () => {
      const a1 = extractMonetaryAmounts('Pagué treinta y cinco soles en taxi');
      expect(a1).toHaveLength(1);
      expect(a1[0].amountCents).toBe(3500);

      const a2 = extractMonetaryAmounts('Recibí dos mil quinientos soles de sueldo');
      expect(a2).toHaveLength(1);
      expect(a2[0].amountCents).toBe(250000);

      const a3 = extractMonetaryAmounts('Alquiler de mil doscientos cincuenta soles');
      expect(a3).toHaveLength(1);
      expect(a3[0].amountCents).toBe(125000);
    });

    it('distingue cantidades de artículos, horas e identificadores de montos monetarios', () => {
      const a1 = extractMonetaryAmounts('Compré 6 panes por 2 soles');
      expect(a1).toHaveLength(1);
      expect(a1[0].amountCents).toBe(200);

      const a2 = extractMonetaryAmounts('Compré 2 cafés de 5 soles');
      expect(a2).toHaveLength(1);
      expect(a2[0].amountCents).toBe(500);

      const a3 = extractMonetaryAmounts('A las 8 de la noche pagué 12 soles en taxi');
      expect(a3).toHaveLength(1);
      expect(a3[0].amountCents).toBe(1200);

      const a4 = extractMonetaryAmounts('En la ruta 14 pagué 3 soles de pasaje');
      expect(a4).toHaveLength(1);
      expect(a4[0].amountCents).toBe(300);

      const a5 = extractMonetaryAmounts('Pagué con 2 billetes de 50 soles');
      expect(a5).toHaveLength(1);
      expect(a5[0].amountCents).toBe(5000);
    });

    it('detecta correctamente "un sol" en singular (100 centavos)', () => {
      const parsed = parseVoiceTranscript('Gasté un sol en galleta');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(100);
      expect(parsed[0].categoryName).toBe('Alimentación');
    });

    it('detecta "un sol y medio" y "medio sol"', () => {
      const parsed1 = parseVoiceTranscript('Un sol y medio en fotocopias');
      expect(parsed1[0].amountCents).toBe(150);
      expect(parsed1[0].categoryName).toBe('Educación');

      const parsed2 = parseVoiceTranscript('Medio sol en chicle');
      expect(parsed2[0].amountCents).toBe(50);
    });
  });

  describe('Auto-corrección y Speech Repairs (Scoped + Encadenados + Guardas)', () => {
    it('detecta el marcador de corrección y prioriza el segmento corregido manteniendo comercio', () => {
      const transcript =
        'Compré una black de 2 soles en el chino, ah no espera, son 3 soles y fue una coca cola';
      const repair = resolveSpeechRepair(transcript);
      expect(repair.hadRepair).toBe(true);

      const parsed = parseVoiceTranscript(transcript);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(300);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].merchantName).toBe('Chino');
    });

    it('maneja corrección con "mentira, fueron 10 soles" preservando concepto y categoría', () => {
      const transcript = 'Almuerzo 8 soles, mentira fueron 10 soles';
      const parsed = parseVoiceTranscript(transcript);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(1000);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].note).toBeUndefined();
    });

    it('mantiene gastos previos en reparaciones multi-gasto ("Menú 15 soles y taxi 5, ah no espera, 7 soles")', () => {
      const parsed = parseVoiceTranscript('Menú 15 soles y taxi 5 soles, ah no espera, 7 soles');
      expect(parsed).toHaveLength(2);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[1].amountCents).toBe(700);
      expect(parsed[1].categoryName).toBe('Transporte');
      expect(parsed[1].note).toBeUndefined();
    });

    it('soporta múltiples correcciones encadenadas ("Café 5, no perdón, 6, digo 7 soles")', () => {
      const parsed = parseVoiceTranscript('Café 5, no perdón, 6, digo 7 soles');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(700);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].note).toBeUndefined();
    });

    it('evita falsos positivos de repair en expresiones naturales ("sala de espera", "en verdad estaba rico")', () => {
      const r1 = resolveSpeechRepair('Pagué 20 soles en la sala de espera');
      expect(r1.hadRepair).toBe(false);

      const r2 = resolveSpeechRepair('Almuerzo 15 soles, en verdad estuvo muy rico');
      expect(r2.hadRepair).toBe(false);
    });
  });

  describe('Segmentación Multi-Gasto sin fuga de comercio', () => {
    it('segmenta múltiples gastos con conectores ("y")', () => {
      const transcript = '15 en almuerzo y 5 en taxi';
      const parsed = parseVoiceTranscript(transcript);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[1].amountCents).toBe(500);
      expect(parsed[1].categoryName).toBe('Transporte');
    });

    it('NO divide una sola compra con conjunción interna ("15 soles en menú y bebida")', () => {
      const parsed = parseVoiceTranscript('15 soles en menú y bebida');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].note).toBeUndefined();
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

    it('no filtra el comercio de una compra hacia otras ("Menú 15 en Don Pepe y taxi 5")', () => {
      const parsed = parseVoiceTranscript('Menú 15 soles en Don Pepe y taxi 5 soles');
      expect(parsed).toHaveLength(2);
      expect(parsed[0].merchantName).toBe('Don Pepe');
      expect(parsed[1].merchantName).toBeUndefined();
      expect(parsed[1].categoryName).toBe('Transporte');
    });

    it('comparte comercio inicial pre-verbal en lista de tienda ("En Tambo compré 5 en galletas y 3 en agua")', () => {
      const parsed = parseVoiceTranscript('En Tambo compré 5 soles en galletas y 3 soles en agua');
      expect(parsed).toHaveLength(2);
      expect(parsed[0].merchantName).toBe('Tambo');
      expect(parsed[1].merchantName).toBe('Tambo');
    });
  });

  describe('Clasificador Bayesiano On-Device y Autoaprendizaje', () => {
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
      const userCategories = [{ id: 'cat-custom-snack-99', name: 'Snacks Favoritos' }];

      const parsed = parseVoiceTranscript(transcript, {
        userCategories,
        learnedMatches,
      });

      expect(parsed).toHaveLength(1);
      expect(parsed[0].categoryId).toBe('cat-custom-snack-99');
      expect(parsed[0].categoryName).toBe('Snacks Favoritos');
      expect(parsed[0].merchantName).toBe('Bodega Central');
      expect(parsed[0].confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('evita colisiones por subcadena ("pantalón" NO coincide con "pan", "gaseosa" NO coincide con "gas")', () => {
      const p1 = parseVoiceTranscript('120 soles en pantalón');
      expect(p1[0].categoryName).toBe('Compras');

      const p2 = parseVoiceTranscript('5 soles en gaseosa');
      expect(p2[0].categoryName).toBe('Alimentación');
    });

    it('cubre correctamente todas las categorías por defecto (Vivienda, Compras, Deudas)', () => {
      const v = parseVoiceTranscript('450 soles de alquiler de cuarto');
      expect(v[0].categoryName).toBe('Vivienda');

      const c = parseVoiceTranscript('180 soles en zapatillas nuevas');
      expect(c[0].categoryName).toBe('Compras');

      const d = parseVoiceTranscript('200 soles cuota del préstamo del banco');
      expect(d[0].categoryName).toBe('Deudas y obligaciones');
    });

    it('aprende del historial reciente de transacciones locales sin red', () => {
      const parsed = parseVoiceTranscript('Pagué 18 soles por kokedama', {
        userCategories: [
          { id: 'cat-1', name: 'Alimentación' },
          { id: 'cat-hogar', name: 'Vivienda' },
        ],
        historicalSamples: [
          { categoryId: 'cat-hogar', text: 'Vivero maceta kokedama decoración' },
          { categoryId: 'cat-hogar', text: 'Planta kokedama sala' },
        ],
      });
      expect(parsed[0].categoryId).toBe('cat-hogar');
      expect(parsed[0].categoryName).toBe('Vivienda');
    });
  });

  describe('Detección Robusta de Establecimiento y Método de Pago', () => {
    it('detecta Yape / Plin como método digital y local con formato limpio', () => {
      const parsed = parseVoiceTranscript('Menú 12 soles por yape en don pepe');
      expect(parsed[0].paymentMethod).toBe('digital');
      expect(parsed[0].merchantName).toBe('Don Pepe');
    });

    it('detecta efectivo correctamente', () => {
      const parsed = parseVoiceTranscript('Taxi 8 soles pagado en efectivo');
      expect(parsed[0].paymentMethod).toBe('cash');
    });

    it('identifica comercios peruanos populares ("en tambo", "en bembos")', () => {
      const parsed = parseVoiceTranscript('Compré 15 soles en tambo por yape');
      expect(parsed[0].merchantName).toBe('Tambo');
      expect(parsed[0].paymentMethod).toBe('digital');
    });

    it('identifica locales usando el giro típico "donde [Persona/Local]"', () => {
      const parsed = parseVoiceTranscript('Salchipapa 10 soles donde la tía veneno');
      expect(parsed[0].merchantName).toBe('Tía Veneno');
      expect(parsed[0].categoryName).toBe('Alimentación');
    });

    it('NO confunde un producto o categoría tras "en" con un comercio ("15 soles en galletas")', () => {
      const parsed = parseVoiceTranscript('Gasté 15 soles en galletas');
      expect(parsed[0].merchantName).toBeUndefined();
      expect(parsed[0].categoryName).toBe('Alimentación');
    });

    it('procesa el patrón canónico estructurado: [Monto] en [Qué] en [Dónde] por [Pago]', () => {
      const parsed = parseVoiceTranscript('15 soles en almuerzo en Tambo por yape');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].merchantName).toBe('Tambo');
      expect(parsed[0].paymentMethod).toBe('digital');
    });

    it('procesa el patrón canónico con local no catalogado antes de medio de pago ("en Don Mario por plin")', () => {
      const parsed = parseVoiceTranscript('12 soles en menú en Don Mario por plin');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(1200);
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].merchantName).toBe('Don Mario');
      expect(parsed[0].paymentMethod).toBe('digital');
    });

    it('procesa sinónimos peruanos de pago y jerga de montos con máxima flexibilidad ("Dos lucas y media al contado")', () => {
      const parsed = parseVoiceTranscript('Dos lucas y media en fotocopias al contado');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(250);
      expect(parsed[0].categoryName).toBe('Educación');
      expect(parsed[0].paymentMethod).toBe('cash');
    });
  });

  describe('Notas Vacías por Diseño y Categoría Sin Fallback Forzado', () => {
    it('deja siempre la nota vacía (undefined) en dictado de gastos e ingresos para evitar texto sucio', () => {
      const parsed = parseVoiceTranscript(
        'Bueno hoy día me fui con mis patas y gasté 15 soles en Tambo en galletas por yape'
      );
      expect(parsed).toHaveLength(1);
      expect(parsed[0].amountCents).toBe(1500);
      expect(parsed[0].merchantName).toBe('Tambo');
      expect(parsed[0].paymentMethod).toBe('digital');
      expect(parsed[0].categoryName).toBe('Alimentación');
      expect(parsed[0].note).toBeUndefined();

      const income = parseVoiceIncomeTranscript('Hoy recibí 500 soles de sueldo de la empresa');
      expect(income).not.toBeNull();
      expect(income!.note).toBeUndefined();
    });

    it('NO asigna categoría inventada ni fallback cuando la frase no encaja con ninguna categoría', () => {
      const pUnknown = parseVoiceTranscript('Gasté 30 soles en cachivaches');
      expect(pUnknown).toHaveLength(1);
      expect(pUnknown[0].amountCents).toBe(3000);
      expect(pUnknown[0].categoryId).toBeUndefined();
      expect(pUnknown[0].categoryName).toBeUndefined();
      expect(pUnknown[0].confidence).toBe(0);

      const pYapeUnknown = parseVoiceTranscript('Le yapeé 25 soles a Don Carlos');
      expect(pYapeUnknown).toHaveLength(1);
      expect(pYapeUnknown[0].amountCents).toBe(2500);
      expect(pYapeUnknown[0].merchantName).toBe('Don Carlos');
      expect(pYapeUnknown[0].categoryName).toBeUndefined();

      const incUnknown = parseVoiceIncomeTranscript('Recibí 200 soles de Pedro');
      expect(incUnknown).not.toBeNull();
      expect(incUnknown!.amountCents).toBe(20000);
      expect(incUnknown!.categoryId).toBeUndefined();
      expect(incUnknown!.categoryName).toBeUndefined();
    });

    it('detecta establecimientos nuevos por nombres propios capitalizados, honoríficos y prefijos locales', () => {
      const p1 = parseVoiceTranscript('Almuerzo 25 soles en La Choza Náutica');
      expect(p1[0].merchantName).toBe('La Choza Náutica');
      expect(p1[0].categoryName).toBe('Alimentación');

      const p2 = parseVoiceTranscript('Compré pastillas 12 soles en la botica Santa Rosa');
      expect(p2[0].merchantName).toBe('Santa Rosa');
      expect(p2[0].categoryName).toBe('Salud');

      const p3 = parseVoiceTranscript('Compré 18 soles en frutas en el mercado San Camilo');
      expect(p3[0].merchantName).toBe('Mercado San Camilo');
      expect(p3[0].categoryName).toBe('Alimentación');

      const p4 = parseVoiceTranscript('Gasté 35 soles en Miniso');
      expect(p4[0].merchantName).toBe('Miniso');

      const p5 = parseVoiceTranscript('Almuerzo 14 soles en don lucho');
      expect(p5[0].merchantName).toBe('Don Lucho');
      expect(p5[0].categoryName).toBe('Alimentación');

      const p6 = parseVoiceTranscript('Gasté 50 soles en El Paisa');
      expect(p6[0].merchantName).toBe('El Paisa');
    });
  });

  describe('Inferencia de Fechas Relativas Locales (sin desfase UTC)', () => {
    it('asigna la fecha local correcta anteayer/ayer/hoy incluso a las 23:30 hora local', () => {
      const lateNightRef = new Date(2026, 3, 10, 23, 30, 0); // 10 abril 2026 23:30 local
      const pHoy = parseVoiceTranscript('El día de hoy compré un menú de 12 soles', {
        referenceDate: lateNightRef,
      });
      expect(pHoy[0].occurredOn).toBe('2026-04-10');

      const pAyer = parseVoiceTranscript('Ayer gasté 8 soles en taxi', {
        referenceDate: lateNightRef,
      });
      expect(pAyer[0].occurredOn).toBe('2026-04-09');

      const pAnteayer = parseVoiceTranscript('Anteayer gasté 20 soles en farmacia', {
        referenceDate: lateNightRef,
      });
      expect(pAnteayer[0].occurredOn).toBe('2026-04-08');

      const pHace = parseVoiceTranscript('Hace 3 días pagué 15 soles de internet', {
        referenceDate: lateNightRef,
      });
      expect(pHace[0].occurredOn).toBe('2026-04-07');
    });

    it('asigna la fecha de ayer cuando se menciona "ayer"', () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayISO = formatLocalDateISO(yesterday);

      const parsed = parseVoiceTranscript('Ayer gasté 8 soles en taxi');
      expect(parsed[0].occurredOn).toBe(yesterdayISO);
    });

    it('asigna la fecha de hoy cuando se menciona "el día de hoy"', () => {
      const todayISO = formatLocalDateISO(new Date());
      const parsed = parseVoiceTranscript('El día de hoy compré un menú de 12 soles');
      expect(parsed[0].occurredOn).toBe(todayISO);
    });
  });

  describe('Reranking Multi-Hipótesis N-best del STT y Dictado de Ingresos', () => {
    it('reordena alternativas del STT cuando una hipótesis secundaria tiene mayor coherencia semántica ("por llave" -> "por yape")', () => {
      const parsed = parseVoiceExpensesFromAlternatives(
        '15 soles en menú en Tambo por llave',
        [
          { transcript: '15 soles en menú en Tambo por llave', confidence: 0.72 },
          { transcript: '15 soles en menú en Tambo por yape', confidence: 0.69 },
        ]
      );
      expect(parsed).toHaveLength(1);
      expect(parsed[0].paymentMethod).toBe('digital');
      expect(parsed[0].merchantName).toBe('Tambo');
      expect(parsed[0].note).toBeUndefined();
    });

    it('parsea ingresos dictados por voz con fecha, monto, categoría y fuente', () => {
      const income1 = parseVoiceIncomeTranscript('Hoy recibí 500 soles de sueldo');
      expect(income1).not.toBeNull();
      expect(income1!.amountCents).toBe(50000);
      expect(income1!.categoryName).toBe('Sueldo');

      const income2 = parseVoiceIncomeTranscript(
        'Cobré 120 soles por trabajo freelance de diseño, ah no espera, 150 soles'
      );
      expect(income2).not.toBeNull();
      expect(income2!.amountCents).toBe(15000);
      expect(income2!.categoryName).toBe('Trabajo independiente');
    });
  });

  describe('Bagaje Peruano Ampliado (Apps, Marcas, Jerga y Desambiguación Real)', () => {
    it('soporta jerga monetaria ampliada ("un palo", "medio palo", "dos lucas con cincuenta", "tres soles con cincuenta")', () => {
      expect(extractMonetaryAmounts('Recibí un palo de sueldo')[0].amountCents).toBe(100000);
      expect(extractMonetaryAmounts('Me pagaron medio palo de adelanto')[0].amountCents).toBe(50000);
      expect(extractMonetaryAmounts('Gasté dos lucas con cincuenta en pan')[0].amountCents).toBe(250);
      expect(extractMonetaryAmounts('Pagué dos mangos y medio en pasaje')[0].amountCents).toBe(250);
      expect(extractMonetaryAmounts('Compré tres soles con cincuenta de fruta')[0].amountCents).toBe(350);
      expect(extractMonetaryAmounts('Menú doce soles veinte')[0].amountCents).toBe(1220);
    });

    it('ignora horas ("de las 6"), puestos ("puesto 14") y octanaje ("gasolina de 95")', () => {
      const a1 = extractMonetaryAmounts('En el bus de las 6 pagué 2 soles de pasaje');
      expect(a1).toHaveLength(1);
      expect(a1[0].amountCents).toBe(200);

      const a2 = extractMonetaryAmounts('En el puesto 14 compré 8 soles de mandarinas');
      expect(a2).toHaveLength(1);
      expect(a2[0].amountCents).toBe(800);

      const a3 = extractMonetaryAmounts('Pagué 30 soles de gasolina de 95 en Primax');
      expect(a3).toHaveLength(1);
      expect(a3[0].amountCents).toBe(3000);
    });

    it('clasifica correctamente apps, marcas y comercios cotidianos peruanos', () => {
      const pRappi = parseVoiceTranscript('Pedí un mostrito por Rappi de 22 soles con yape');
      expect(pRappi[0].amountCents).toBe(2200);
      expect(pRappi[0].categoryName).toBe('Alimentación');
      expect(pRappi[0].merchantName).toBe('Rappi');
      expect(pRappi[0].paymentMethod).toBe('digital');

      const pIndrive = parseVoiceTranscript('Tomé un InDrive de 14 soles al contado');
      expect(pIndrive[0].amountCents).toBe(1400);
      expect(pIndrive[0].categoryName).toBe('Transporte');
      expect(pIndrive[0].merchantName).toBe('InDrive');
      expect(pIndrive[0].paymentMethod).toBe('cash');

      const pWin = parseVoiceTranscript('Pagué 65 soles de internet Win');
      expect(pWin[0].amountCents).toBe(6500);
      expect(pWin[0].categoryName).toBe('Servicios');
      expect(pWin[0].merchantName).toBe('Win');

      const pCine = parseVoiceTranscript('Compré entradas en Cineplanet por 38 soles con visa');
      expect(pCine[0].amountCents).toBe(3800);
      expect(pCine[0].categoryName).toBe('Diversión');
      expect(pCine[0].merchantName).toBe('Cineplanet');
      expect(pCine[0].paymentMethod).toBe('digital');

      const pSodimac = parseVoiceTranscript('Gasté 45 soles en Sodimac en pintura');
      expect(pSodimac[0].amountCents).toBe(4500);
      expect(pSodimac[0].categoryName).toBe('Vivienda');
      expect(pSodimac[0].merchantName).toBe('Sodimac');

      const pSaga = parseVoiceTranscript('Compré zapatillas en Saga Falabella por 180 soles');
      expect(pSaga[0].amountCents).toBe(18000);
      expect(pSaga[0].categoryName).toBe('Compras');
      expect(pSaga[0].merchantName).toBe('Saga Falabella');

      const pCmr = parseVoiceTranscript('Pagué 200 soles de cuota de tarjeta CMR');
      expect(pCmr[0].amountCents).toBe(20000);
      expect(pCmr[0].categoryName).toBe('Deudas y obligaciones');

      const pIcpna = parseVoiceTranscript('Pagué 350 soles de mensualidad del ICPNA');
      expect(pIcpna[0].amountCents).toBe(35000);
      expect(pIcpna[0].categoryName).toBe('Educación');
      expect(pIcpna[0].merchantName).toBe('ICPNA');
    });

    it('soporta disfluencias peruanas con comas ("no, eran", "no mentira", "perdón, quise decir")', () => {
      const r1 = parseVoiceTranscript('Gasté 15 soles en menú en Don Pepe, no, eran 18 soles');
      expect(r1).toHaveLength(1);
      expect(r1[0].amountCents).toBe(1800);
      expect(r1[0].categoryName).toBe('Alimentación');
      expect(r1[0].merchantName).toBe('Don Pepe');

      const r2 = parseVoiceTranscript('Pagué 20 soles en pichanga, no mentira, 25 soles');
      expect(r2).toHaveLength(1);
      expect(r2[0].amountCents).toBe(2500);
      expect(r2[0].categoryName).toBe('Diversión');

      const r3 = parseVoiceTranscript('12 soles en ceviche, perdón, quise decir 15 soles');
      expect(r3).toHaveLength(1);
      expect(r3[0].amountCents).toBe(1500);
      expect(r3[0].categoryName).toBe('Alimentación');
    });

    it('extrae destinatarios de yapeo/plineo y comercios con prefijo local + ingresos con jerga peruana', () => {
      const pYape = parseVoiceTranscript('Le yapeé 25 soles a Don Carlos');
      expect(pYape).toHaveLength(1);
      expect(pYape[0].amountCents).toBe(2500);
      expect(pYape[0].merchantName).toBe('Don Carlos');
      expect(pYape[0].paymentMethod).toBe('digital');

      const pPolleria = parseVoiceTranscript('Acabo de yapear 48 soles en la pollería El Fogón');
      expect(pPolleria).toHaveLength(1);
      expect(pPolleria[0].amountCents).toBe(4800);
      expect(pPolleria[0].merchantName).toBe('El Fogón');
      expect(pPolleria[0].categoryName).toBe('Alimentación');
      expect(pPolleria[0].paymentMethod).toBe('digital');

      const incGrati = parseVoiceIncomeTranscript('Recibí un palo y medio de grati');
      expect(incGrati).not.toBeNull();
      expect(incGrati!.amountCents).toBe(150000);
      expect(incGrati!.categoryName).toBe('Sueldo');

      const incCachuelo = parseVoiceIncomeTranscript('Me depositaron 400 soles de un cachuelo de programación');
      expect(incCachuelo).not.toBeNull();
      expect(incCachuelo!.amountCents).toBe(40000);
      expect(incCachuelo!.categoryName).toBe('Trabajo independiente');
    });
  });
});
