import { LearnedMatch } from '../../data/voiceLearning.repository';
import {
  charNgrams,
  normalizeText,
  normalizeWord,
  phoneticNormalize,
  spanishStem,
} from './textUtils';

export type TransactionDomainType = 'expense' | 'income';

export interface CategoryLookupItem {
  id: string;
  name: string;
  icon?: string;
}

export interface HistoricalCategorySample {
  categoryId: string;
  text: string;
}

export interface ClassificationCandidate {
  categoryId?: string;
  categoryName: string;
  probability: number;
  score: number;
}

export interface CategoryClassificationResult {
  categoryId?: string;
  categoryName?: string;
  confidence: number;
  matchedBy: 'learned' | 'classifier' | 'none';
  alternatives: ClassificationCandidate[];
}

interface ClassProfile {
  key: string;
  categoryId?: string;
  categoryName: string;
  featureWeights: Map<string, number>;
  totalWeight: number;
  priorWeight: number;
  exactPhrases: string[];
}

const FEATURE_STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'e',
  'o',
  'en',
  'por',
  'para',
  'con',
  'sin',
  'a',
  'al',
  'se',
  'me',
  'te',
  'le',
  'les',
  'nos',
  'lo',
  'mi',
  'tu',
  'su',
  'don',
  'dona',
  'senor',
  'senora',
  'san',
  'santa',
  'que',
  'es',
  'son',
  'fue',
  'fueron',
  'hoy',
  'ayer',
  'anoche',
  'anteayer',
  'antier',
  'dia',
  'sol',
  'soles',
  'peso',
  'pesos',
  'luca',
  'lucas',
  'china',
  'chinas',
  'ferro',
  'ferros',
  'peseta',
  'pesetas',
  'mango',
  'mangos',
  'palo',
  'palos',
  'centimo',
  'centimos',
  'centavo',
  'centavos',
  'yape',
  'yapear',
  'yapee',
  'yapeado',
  'plin',
  'plinear',
  'plinee',
  'plineado',
  'agora',
  'tunki',
  'lukita',
  'izipay',
  'niubiz',
  'efectivo',
  'cash',
  'contado',
  'tarjeta',
  'debito',
  'credito',
  'transferencia',
  'transferir',
  'transferi',
  'digital',
  'gaste',
  'compre',
  'pague',
  'cobre',
  'recibi',
  'hice',
  'compra',
  'gasto',
  'pago',
  'ingreso',
  'donde',
]);

/**
 * Lexicón base estructurado para el arranque en frío (cold-start) cubriendo todas
 * las categorías por defecto de AhorRaso (10 de gastos + 6 de ingresos) con amplio
 * bagaje cotidiano peruano, marcas, apps y jerga local.
 */
export const EXPENSE_PROTOTYPES: {
  name: string;
  aliases: string[];
  corpus: string[];
}[] = [
  {
    name: 'Alimentación',
    aliases: ['comida', 'alimentos', 'restaurantes', 'supermercado'],
    corpus: [
      'almuerzo desayuno cena menu comida lonche merienda bajona piqueo',
      'hamburguesa salchipapa broaster pollo brasa chifa ceviche arroz chaufa',
      'aeropuerto mostrito lomo saltado aji gallina caldo gallina seco tallarin wantan',
      'anticuchos rachi pancita chicharron chancho cilindro caja china leche tigre trio marino',
      'pizza empanada sanguchito butifarra tamal humita papa rellena causa ocopa',
      'pan frances ciabatta yema molde galleta snack chicle chocolate torta picarones mazamorra',
      'cremolada marciano raspadilla helado emoliente quinua maca kiwicha avena',
      'gaseosa coca cola inca kola fanta sprite guarana kola real kr agua mineral botella agua',
      'san luis san mateo cielo loa sporade gatorade powerade monster red bull volt',
      'jugo cafe americano capuccino frappe te manzanilla chicha morada maracuya limonada refresco bebida',
      'casino margarita tentacion morochas coronita chocman sublime triangulo cua cua dona pepa',
      'lays chizitos doritos cuates piqueo snax tortees cheetos chifles cancha mani halls trident',
      'gloria laive yogurt leche queso jamonada hot dog mantequilla palta huevos fideos aceite azucar',
      'rappi pedidosya didi food uber eats delivery',
      'tambo oxxo mass metro plaza vea tottus wong vivanda makro vega mayorsa precio uno',
      'bembos kfc mcdonalds burger king popeyes papa johns pizza hut little caesars dominos',
      'pardos rokys norkys villa chicken mediterraneo china wok siete sopas la lucha rustica tanta',
      'starbucks dunkin juan valdez pinkberry san antonio tia veneno don pepe',
      'fruta verdura carne pescado mercado casera bodega minimarket abarrotes',
      'restaurante huarique polleria panaderia cevicheria sangucheria jugueria cafeteria heladeria fuente soda',
    ],
  },
  {
    name: 'Transporte',
    aliases: ['movilidad', 'pasajes', 'viajes'],
    corpus: [
      'taxi uber didi indrive cabify yango satelital mototaxi carrera viaje aplicativo bajada bandera',
      'combi micro custer coaster colectivo bus corredor azul rojo morado amarillo metropolitano metro tren linea',
      'pasaje pasajes medio pasaje tarjeta lima pass peaje rutas lima expresa covisur',
      'estacionamiento cochera parqueo los portales movilidad escolar transporte interprovincial',
      'cruz sur oltursa moviltours civa flores soyuz peru bus pasaje aereo latam sky jetsmart',
      'gasolina combustible gasohol regular premium grifo primax repsol petroperu pecsa gnv glp',
      'mecanico taller llanta llantero lavado auto carwash aceite motor bateria revision tecnica',
    ],
  },
  {
    name: 'Diversión',
    aliases: ['entretenimiento', 'ocio', 'salidas'],
    corpus: [
      'cine cineplanet cinemark cinepolis uvk cinestar movie time pelicula entrada combo popcorn canchita',
      'concierto festival teatro show evento stand up teleticket joinnus vaope ticketmaster',
      'fiesta juerga tono salida bar discoteca club pub pena billar bowling karaoke cover box',
      'chelas cerveza pilsen cusquena cristal corona heineken stella tres cruces golden',
      'trago vino pisco sour chilcano ron cartavio flor cana vodka whisky sangria licoreria',
      'juegos videojuego steam playstation psn nintendo switch xbox game pass',
      'valorant riot free fire roblox minecraft dota fifa cabina lan center cartas',
      'netflix spotify youtube premium disney max hbo amazon prime video crunchyroll apple tv paramount twitch',
      'cancha sintetica futbol pichanga voley padel piscina gimnasio gym smartfit bodytech',
      'paseo playa parque zoologico leyendas tour full day viaje hotel hostal airbnb',
    ],
  },
  {
    name: 'Servicios',
    aliases: ['recibos', 'suscripciones'],
    corpus: [
      'luz electricidad recibo recibo luz luz sur enel pluz seal electrocentro hidrandina',
      'recibo agua potable sedapar sedapal sedalib eps saneamiento',
      'gas natural calidda quavii balon gas solgas llamagas limagas',
      'internet wifi fibra optica cable trio duo directv win wow nubyx',
      'telefono celular plan pospago prepago recarga saldo datos megas bitel claro movistar entel',
      'suscripcion icloud google one google drive microsoft 365 office chatgpt claude canva notion figma',
      'correo encomienda olva courier shalom marvisur serpost envio paquete lavanderia',
    ],
  },
  {
    name: 'Educación',
    aliases: ['estudios', 'universidad'],
    corpus: [
      'copias fotocopia fotocopias impresion impresiones anillado espiralado empastado ploteo',
      'cuaderno standford lapicero pilot faber castell plumon resaltador folder hojas bond millar cartulina',
      'utiles papeleria libreria tai loy crisol ibero',
      'libro manual separata guia examen parcial final matricula pension mensualidad ciclo semestre',
      'carne universitario tramite constancia certificado record notas bachiller titulo tesis asesoria',
      'unsa unmsm san marcos uni pucp catolica upc utp upn ucv usil ulima usmp cayetano ucsm ucsp',
      'tecsup senati certus idat cibertec isil toulouse instituto facultad colegio academia',
      'icpna britanico idiomas euroidiomas aduni trilce pamer ceprunsa cepre',
      'curso taller diplomado bootcamp platzi udemy coursera duolingo',
    ],
  },
  {
    name: 'Salud',
    aliases: ['medicina', 'farmacia'],
    corpus: [
      'farmacia botica inkafarma mifarma boticas peru boticas salud farmacia universal arcangel',
      'medicina medicamento remedio pastilla pastillas capsula jarabe ampolla inyeccion vacuna',
      'panadol paracetamol ibuprofeno apronax naproxeno nastizol antigripal bismutol sal andrews hepabionta',
      'amoxicilina azitromicina loratadina cetirizina omeprazol suero electrolight pedialyte',
      'vitamina berocca redoxon proteina creatina colageno',
      'curita gasa algodon alcohol agua oxigenada venda mascarilla termometro preservativo condon',
      'doctor medico consulta clinica san pablo ricardo palma internacional delgado auna sanna sisol essalud',
      'hospital posta emergencia laboratorio suiza lab roe analisis examen sangre ecografia radiografia rayos',
      'dentista odontologo curacion profilaxis brackets ortodoncia',
      'oftalmologo oculista optica gmo econolentes medida vista lunas monturas psicologo terapia fisioterapia',
    ],
  },
  {
    name: 'Vivienda',
    aliases: ['casa', 'hogar', 'alquiler'],
    corpus: [
      'alquiler renta cuarto departamento depa habitacion residencia pension casa condominio',
      'mantenimiento edificio junta vecinal arbitrios predial vigilancia',
      'limpieza detergente bolivar ariel opal lejia clorox sapolio poett lavavajillas ayudin',
      'jabon escoba trapeador recogedor esponja bolsas basura papel higienico servilletas',
      'sodimac promart maestro ferreteria tornillos clavos pintura brocha foco led cable cinta aislante',
      'candado llave cerradura cerrajero reparacion gasfitero plomero electricista carpintero',
      'mueble colchon sabana frazada almohada olla sarten plato vaso electrodomestico',
    ],
  },
  {
    name: 'Compras',
    aliases: ['ropa', 'tienda', 'shopping', 'cuidado personal'],
    corpus: [
      'ropa polo polera pantalon jean jogger casaca chompa camisa blusa vestido falda buzo short',
      'zapatillas nike adidas puma converse vans zapatos sandalias botas medias boxer ropa interior',
      'mochila cartera billetera correa reloj lentes sol gorra sombrero regalo detalle flores peluche',
      'audifonos bluetooth cargador cable tipo c lightning funda case vidrio templado protector pantalla',
      'mouse teclado usb adaptador parlante celular laptop tablet accesorio tecnologia coolbox hiraoka',
      'mall saga falabella ripley oechsle hm zara forever gamarra polvos azules mesa redonda',
      'real plaza jockey plaza norte mall aventura mercado libre amazon aliexpress temu shein',
      'barberia peluqueria corte pelo tinte manicure pedicure depilacion',
      'shampoo acondicionador crema perfume colonia desodorante bloqueador pasta dental cepillo afeitadora maquillaje',
      'mascota perro gato comida perro ricocan mimaskot veterinaria arena gato',
    ],
  },
  {
    name: 'Deudas y obligaciones',
    aliases: ['deudas', 'prestamos', 'cuotas'],
    corpus: [
      'deuda prestamo cuota letra hipoteca credito vehicular personal estado cuenta',
      'cmr tarjeta oh cencosud yape prestamo financiera caja arequipa huancayo piura mibanco compartamos',
      'banco bcp bbva interbank scotiabank banbif pichincha nacion abono amortizacion',
      'interes mora multa papeleta sat sunat detraccion impuesto renta igv afp onp',
      'soat seguro vehicular rimac pacifico positiva mapfre',
      'debia prestado pendiente devolucion pagar deuda',
    ],
  },
  {
    name: 'Otros gastos',
    aliases: ['otros', 'varios', 'miscelaneo'],
    corpus: ['varios imprevisto donacion colecta propina comision notaria tramite legal'],
  },
];

export const INCOME_PROTOTYPES: {
  name: string;
  aliases: string[];
  corpus: string[];
}[] = [
  {
    name: 'Sueldo',
    aliases: ['salario', 'nomina', 'planilla'],
    corpus: [
      'sueldo salario quincena fin mes mensualidad planilla haberes empresa trabajo chamba',
      'adelanto bono gratificacion grati cts utilidades liquidacion vacaciones practicante practicas horas extras comisiones',
    ],
  },
  {
    name: 'Propina',
    aliases: ['mesada', 'apoyo', 'regalo'],
    corpus: [
      'propina mesada pasajes mama papa padres abuelo abuela tia tio hermano hermana familiar regalo cumpleanos navidad',
      'dieron deposito envio apoyo semanal remesa western union moneygram ria',
    ],
  },
  {
    name: 'Trabajo independiente',
    aliases: ['freelance', 'cachuelo', 'honorarios'],
    corpus: [
      'freelance cachuelo chambita diseno programacion desarrollo asesoria consultoria clases particulares tutoria',
      'honorarios recibo honorarios rxh factura proyecto pagina web app logo edicion video fotografia traduccion',
      'servicio mantenimiento reparacion instalacion cliente adelanto saldo delivery taxi indrive uber rappi',
    ],
  },
  {
    name: 'Negocios',
    aliases: ['ventas', 'emprendimiento'],
    corpus: [
      'venta vendi negocio tienda bodega pedido emprendimiento ganancia mercaderia producto',
      'cliente encargo marketplace feria catalogo comida postres ropa zapatillas caja dia cierre caja',
    ],
  },
  {
    name: 'Inversiones',
    aliases: ['dividendos', 'intereses', 'ahorro'],
    corpus: [
      'inversion intereses dividendo rendimiento plazo fijo cuenta ahorros fondo mutuo bolsa bvl',
      'tyba trii hapi etf acciones cripto binance bitcoin usdt cambio dolar kambista rextie',
      'retorno ganancia cashback banco',
    ],
  },
  {
    name: 'Otros ingresos',
    aliases: ['otros', 'reembolso', 'devolucion'],
    corpus: [
      'reembolso devolucion premio sorteo rifa tinka apuesta betsson inkabet doradobet',
      'beca pronabec bono estado devolvieron prestamo vuelto alquiler cobrado',
    ],
  },
];

/**
 * Extrae el vector ponderado de características léxicas, lemas morfológicos en español,
 * bigramas y trigramas fonéticos con fronteras de palabra.
 */
export function extractClassifierFeatures(text: string): Map<string, number> {
  const features = new Map<string, number>();
  const norm = normalizeText(text);
  if (!norm) return features;

  const rawWords = norm.split(/\s+/).filter(Boolean);
  const contentWords: string[] = [];

  for (const w of rawWords) {
    if (w.length < 2 || /^\d+(?:\.\d+)?$/.test(w) || FEATURE_STOPWORDS.has(w)) {
      continue;
    }
    contentWords.push(w);
  }

  for (let i = 0; i < contentWords.length; i++) {
    const w = contentWords[i];
    const stem = spanishStem(w);
    const pStem = phoneticNormalize(stem);

    // 1. Palabra exacta normalizada
    const wKey = `w:${w}`;
    features.set(wKey, (features.get(wKey) ?? 0) + 2.0);

    // 2. Lema morfológico en español ("galletas" -> "st:galleta", "panes" -> "st:pan")
    const stKey = `st:${stem}`;
    features.set(stKey, (features.get(stKey) ?? 0) + 2.0);

    // 3. Forma canónica fonética del lema ("almuerso" -> "p:almuerso" == "almuerzo")
    if (pStem && pStem.length >= 2) {
      const pKey = `p:${pStem}`;
      features.set(pKey, (features.get(pKey) ?? 0) + 1.5);
    }

    // 4. Bigrama de lemas contiguos
    if (i + 1 < contentWords.length) {
      const nextStem = spanishStem(contentWords[i + 1]);
      const bgKey = `bg:${stem}_${nextStem}`;
      features.set(bgKey, (features.get(bgKey) ?? 0) + 2.6);
    }

    // 5. Trigramas fonéticos con fronteras de palabra (^...$) sobre el lema
    if (stem.length >= 4) {
      for (const gram of charNgrams(stem, 3)) {
        const gKey = `cg:${gram}`;
        features.set(gKey, (features.get(gKey) ?? 0) + 0.35);
      }
    }
  }

  return features;
}

/**
 * Clasificador Estadístico TF-IDF / BM25 Log-Likelihood On-Device
 * con normalización por longitud de clase (evita sesgo hacia categorías pequeñas),
 * lematización morfológica y trigramas fonéticos.
 */
export class CategoryClassifier {
  private readonly profiles: ClassProfile[] = [];
  private readonly featureDocFreq: Map<string, number> = new Map();
  private readonly avgTotalWeight: number;
  private readonly type: TransactionDomainType;

  constructor(options: {
    type?: TransactionDomainType;
    userCategories?: CategoryLookupItem[];
    learnedMatches?: LearnedMatch[];
    historicalSamples?: HistoricalCategorySample[];
  }) {
    this.type = options.type ?? 'expense';
    const prototypes = this.type === 'income' ? INCOME_PROTOTYPES : EXPENSE_PROTOTYPES;
    const userCategories = options.userCategories ?? [];
    const learnedMatches = options.learnedMatches ?? [];
    const historicalSamples = options.historicalSamples ?? [];

    const addDocument = (profile: ClassProfile, docText: string, multiplier = 1) => {
      const feats = extractClassifierFeatures(docText);
      for (const [f, weight] of feats.entries()) {
        const scaled = weight * multiplier;
        profile.featureWeights.set(f, (profile.featureWeights.get(f) ?? 0) + scaled);
        profile.totalWeight += scaled;
      }
    };

    if (userCategories.length > 0) {
      for (const cat of userCategories) {
        const profile: ClassProfile = {
          key: cat.id,
          categoryId: cat.id,
          categoryName: cat.name,
          featureWeights: new Map(),
          totalWeight: 0,
          priorWeight: 1,
          exactPhrases: [],
        };

        addDocument(profile, cat.name, 2.5);

        const catNorm = normalizeWord(cat.name);
        for (const proto of prototypes) {
          const protoNorm = normalizeWord(proto.name);
          const aliasHit = proto.aliases.some(
            (a) => normalizeWord(a) === catNorm || catNorm.includes(normalizeWord(a))
          );
          if (catNorm === protoNorm || catNorm.includes(protoNorm) || aliasHit) {
            for (const line of proto.corpus) {
              addDocument(profile, line, 1.0);
            }
          }
        }

        this.profiles.push(profile);
      }
    } else {
      for (const proto of prototypes) {
        const profile: ClassProfile = {
          key: proto.name,
          categoryId: undefined,
          categoryName: proto.name,
          featureWeights: new Map(),
          totalWeight: 0,
          priorWeight: 1,
          exactPhrases: [],
        };
        addDocument(profile, proto.name, 2.0);
        for (const alias of proto.aliases) {
          addDocument(profile, alias, 1.5);
        }
        for (const line of proto.corpus) {
          addDocument(profile, line, 1.0);
        }
        this.profiles.push(profile);
      }
    }

    // Incorporar aprendizajes adaptativos del usuario (`voice_learning`)
    for (const learned of learnedMatches) {
      const target = this.profiles.find((p) => p.categoryId === learned.categoryId);
      const phraseNorm = normalizeText(learned.phrase);
      if (target && phraseNorm.length >= 3) {
        const weight = 2.0 + Math.log1p(Math.max(1, learned.hitCount)) * 2.0;
        addDocument(target, phraseNorm, weight);
        target.priorWeight += Math.min(3, Math.log1p(learned.hitCount) * 0.4);
        target.exactPhrases.push(phraseNorm);
      }
    }

    // Incorporar muestras históricas de transacciones del usuario
    for (const sample of historicalSamples) {
      const target = this.profiles.find((p) => p.categoryId === sample.categoryId);
      if (target && sample.text.trim().length >= 3) {
        addDocument(target, sample.text, 0.75);
      }
    }

    let sumWeights = 0;
    for (const p of this.profiles) {
      sumWeights += p.totalWeight;
      for (const featKey of p.featureWeights.keys()) {
        this.featureDocFreq.set(featKey, (this.featureDocFreq.get(featKey) ?? 0) + 1);
      }
    }
    this.avgTotalWeight = this.profiles.length > 0 ? Math.max(1, sumWeights / this.profiles.length) : 1;
  }

  classify(text: string): CategoryClassificationResult {
    const normQuery = normalizeText(text);
    const queryWords = normQuery.split(/\s+/).filter(Boolean);
    const queryFeatures = extractClassifierFeatures(text);

    if (this.profiles.length === 0) {
      return {
        categoryId: undefined,
        categoryName: undefined,
        confidence: 0,
        matchedBy: 'none',
        alternatives: [],
      };
    }

    // 1. Verificar coincidencia exacta de frase aprendida (frontera de palabra)
    let bestLearnedProfile: { profile: ClassProfile; phraseLen: number } | null = null;
    for (const profile of this.profiles) {
      for (const phrase of profile.exactPhrases) {
        const rx = new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`, 'i');
        if (rx.test(normQuery)) {
          if (!bestLearnedProfile || phrase.length > bestLearnedProfile.phraseLen) {
            bestLearnedProfile = { profile, phraseLen: phrase.length };
          }
        }
      }
    }

    const totalPrior = this.profiles.reduce((acc, p) => acc + p.priorWeight, 0);
    const numClasses = this.profiles.length;

    const scored: {
      profile: ClassProfile;
      logScore: number;
      overlapCount: number;
      exactWordHits: number;
    }[] = [];

    for (const profile of this.profiles) {
      let logScore = 0.25 * Math.log(profile.priorWeight / totalPrior);
      let overlapCount = 0;
      let exactWordHits = 0;

      // Normalización pivotada por longitud (BM25 / Complement-style): evita favorecer categorías pequeñas
      const normLen = 0.78 + 0.22 * (profile.totalWeight / this.avgTotalWeight);

      for (const [feat, qWeight] of queryFeatures.entries()) {
        const classWeight = profile.featureWeights.get(feat) ?? 0;
        if (classWeight <= 0) continue;

        overlapCount++;
        if (
          feat.startsWith('w:') ||
          feat.startsWith('st:') ||
          feat.startsWith('p:') ||
          feat.startsWith('bg:')
        ) {
          exactWordHits++;
        }

        const df = this.featureDocFreq.get(feat) ?? 1;
        const idf = Math.log(1 + numClasses / df);
        logScore += qWeight * idf * Math.log(1 + classWeight / normLen);
      }

      // Bonus explícito si coincide exactamente con el nombre de la categoría en frontera de palabra
      const catNorm = normalizeText(profile.categoryName);
      if (
        catNorm.length >= 3 &&
        new RegExp(`(?:^|\\s)${catNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`, 'i').test(
          normQuery
        )
      ) {
        logScore += 5.0;
        overlapCount += 2;
        exactWordHits += 2;
      }

      if (bestLearnedProfile && bestLearnedProfile.profile.key === profile.key) {
        logScore += 8.0;
        overlapCount += 3;
        exactWordHits += 3;
      }

      scored.push({ profile, logScore, overlapCount, exactWordHits });
    }

    scored.sort((a, b) => b.logScore - a.logScore);

    // Softmax estable sobre puntuaciones log-odds
    const maxLog = scored[0].logScore;
    const exps = scored.map((s) => Math.exp(Math.max(-30, Math.min(0, (s.logScore - maxLog) * 0.45))));
    const sumExps = exps.reduce((a, b) => a + b, 0) || 1;

    const candidates: ClassificationCandidate[] = scored.map((s, idx) => ({
      categoryId: s.profile.categoryId,
      categoryName: s.profile.categoryName,
      probability: exps[idx] / sumExps,
      score: s.logScore,
    }));

    const top = scored[0];
    const topProb = candidates[0].probability;

    const hasMeaningfulSignal =
      bestLearnedProfile !== null ||
      top.exactWordHits > 0 ||
      (top.overlapCount >= 3 &&
        top.logScore >= 2.2 &&
        topProb >= 0.45 &&
        queryWords.some((w) => w.length >= 4));

    if (!hasMeaningfulSignal) {
      return {
        categoryId: undefined,
        categoryName: undefined,
        confidence: 0,
        matchedBy: 'none',
        alternatives: candidates.slice(0, 3),
      };
    }

    const calibratedConfidence = bestLearnedProfile
      ? Math.max(0.95, Math.min(0.99, topProb))
      : Math.max(0.58, Math.min(0.97, topProb));

    return {
      categoryId: top.profile.categoryId,
      categoryName: top.profile.categoryName,
      confidence: Number(calibratedConfidence.toFixed(3)),
      matchedBy: bestLearnedProfile ? 'learned' : 'classifier',
      alternatives: candidates.slice(0, 3),
    };
  }
}
