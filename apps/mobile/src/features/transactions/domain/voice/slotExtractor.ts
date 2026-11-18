import { PaymentMethod } from '../types';
import { Token } from './tokenizer';
import {
  capitalizeFirst,
  normalizeText,
  normalizeWord,
  phoneticTrigramSimilarity,
  stringSimilarity,
  toMerchantTitleCase,
} from './textUtils';

export const POPULAR_PERUVIAN_MERCHANTS: string[] = [
  // Tiendas de conveniencia y supermercados
  'Hiperbodega Precio Uno',
  'Plaza Vea',
  'Precio Uno',
  'El Súper',
  'Tambo+',
  'Tambo',
  'Oxxo',
  'Mass',
  'Metro',
  'Tottus',
  'Wong',
  'Makro',
  'Vivanda',
  'Franco',
  'Vega',
  'Mayorsa',
  'Kosto',
  'Listo',
  'Repshop',
  'Pronto',
  // Centros comerciales, mercados y galerías (Lima, Arequipa y regiones)
  'Mercado San Camilo',
  'Parque Lambramani',
  'Plaza San Miguel',
  'Aventura Plaza',
  'Mall Aventura',
  'Jockey Plaza',
  'Plaza Norte',
  'Real Plaza',
  'Mall Plaza',
  'Open Plaza',
  'MegaPlaza',
  'La Rambla',
  'Larcomar',
  'Puruchuco',
  'Polvos Azules',
  'Mesa Redonda',
  'Gamarra',
  // Farmacias, boticas y clínicas
  'Boticas y Salud',
  'Boticas Arcángel',
  'Boticas Felicidad',
  'Farmacia Universal',
  'Clínica San Pablo',
  'Clínica Internacional',
  'Clínica Delgado',
  'Boticas Perú',
  'Suiza Lab',
  'Inkafarma',
  'Mifarma',
  'Fasa',
  'Sanna',
  'Sisol',
  'Essalud',
  // Apps de delivery y movilidad
  'PedidosYa',
  'Didi Food',
  'Uber Eats',
  'Rappi',
  'InDrive',
  'Yango',
  'Cabify',
  'Uber',
  'Didi',
  // Restaurantes, pollerías, cafeterías y comida rápida
  'Pastelería San Antonio',
  'Pardos Chicken',
  'Little Caesars',
  'Segundo Muelle',
  'Villa Chicken',
  'Burger King',
  'Las Canastas',
  'Krispy Kreme',
  'Juan Valdez',
  'San Antonio',
  'Siete Sopas',
  'Punto Azul',
  'Mi Barrunto',
  'El Hornero',
  'El Chinito',
  'China Wok',
  'Papa Johns',
  'Pizza Hut',
  'La Lucha',
  'McDonalds',
  'Starbucks',
  'Pinkberry',
  'Sarcletti',
  'Cinnabon',
  'Popeyes',
  'Rústica',
  'Fridays',
  'LongHorn',
  'Bembos',
  'Norkys',
  'Dunkin',
  'Chilis',
  'Rokys',
  'Tanta',
  'KFC',
  '4D',
  'Don Pepe',
  'Tía Veneno',
  'Menú UNSA',
  'Comedor UNSA',
  // Grifos y transporte interprovincial / aéreo
  'Grifo Primax',
  'Cruz del Sur',
  'Movil Bus',
  'Perú Bus',
  'Petroperú',
  'JetSmart',
  'Oltursa',
  'Primax',
  'Repsol',
  'Terpel',
  'Pecsa',
  'Flores',
  'Soyuz',
  'Latam',
  'Civa',
  'Sky',
  // Retail, ropa, calzado, hogar, librerías y tecnología
  'Saga Falabella',
  'Mercado Libre',
  'Renzo Costa',
  'Mac Center',
  'Dollarcity',
  'Platanitos',
  'Casaideas',
  'Falabella',
  'Footloose',
  'Triathlon',
  'AliExpress',
  'Marathon',
  'Sodimac',
  'Promart',
  'Maestro',
  'Coolbox',
  'Hiraoka',
  'Oechsle',
  'Topitop',
  'Tai Loy',
  'Miniso',
  'Ripley',
  'Crisol',
  'Amazon',
  'Aruma',
  'Ibero',
  'iShop',
  'Shein',
  'Bata',
  'Zara',
  'Temu',
  'SBS',
  // Cine, streaming y gimnasios
  'YouTube Premium',
  'Amazon Prime',
  'Crunchyroll',
  'Cineplanet',
  'Cinépolis',
  'Cinemark',
  'Cinestar',
  'SmartFit',
  'Bodytech',
  'Netflix',
  'Spotify',
  'Disney+',
  'Steam',
  'UVK',
  // Telecomunicaciones, servicios públicos y couriers
  'Olva Courier',
  'Luz del Sur',
  'Llamagas',
  'Movistar',
  'Directv',
  'Sedapal',
  'Sedapar',
  'Cálidda',
  'Solgas',
  'Shalom',
  'Claro',
  'Entel',
  'Bitel',
  'Enel',
  'Pluz',
  'Seal',
  'Win',
  'Wow',
  // Bancos, cajas y financieras
  'Banco de la Nación',
  'Caja Arequipa',
  'Caja Huancayo',
  'Caja Piura',
  'Scotiabank',
  'Interbank',
  'Mibanco',
  'BBVA',
  'BCP',
  // Educación e idiomas
  'Británico',
  'Platzi',
  'ICPNA',
  'Udemy',
];

export const NON_MERCHANT_WORDS = new Set([
  'galleta',
  'galletas',
  'almuerzo',
  'almuerso',
  'menu',
  'comida',
  'cena',
  'desayuno',
  'hamburguesa',
  'salchipapa',
  'broaster',
  'chifa',
  'chiffa',
  'ceviche',
  'chaufa',
  'mostrito',
  'aeropuerto',
  'anticuchos',
  'chicharron',
  'tamal',
  'tamales',
  'emoliente',
  'picarones',
  'mazamorra',
  'pollo',
  'snack',
  'pan',
  'panes',
  'cafe',
  'jugo',
  'gaseosa',
  'coca cola',
  'inca kola',
  'agua',
  'empanada',
  'sanguchito',
  'pizza',
  'fruta',
  'frutas',
  'verdura',
  'verduras',
  'abarrotes',
  'chelas',
  'cerveza',
  'pilsen',
  'cusquena',
  'trago',
  'canchita',
  'chicle',
  'pichanga',
  'cancha',
  'gimnasio',
  'gym',
  'pelicula',
  'entrada',
  'entradas',
  'taxi',
  'tasi',
  'taxii',
  'mototaxi',
  'combi',
  'micro',
  'custer',
  'coaster',
  'colectivo',
  'metropolitano',
  'corredor',
  'pasaje',
  'pasajes',
  'peaje',
  'cochera',
  'gasolina',
  'combustible',
  'carrera',
  'fotocopia',
  'fotocopias',
  'copia',
  'copias',
  'impresion',
  'impresiones',
  'anillado',
  'ploteo',
  'cuaderno',
  'cuadernos',
  'lapicero',
  'lapiceros',
  'libro',
  'libros',
  'hojas',
  'utiles',
  'examen',
  'matricula',
  'pension',
  'mensualidad',
  'luz',
  'recibo',
  'internet',
  'fibra',
  'recarga',
  'saldo',
  'megas',
  'gas',
  'balon',
  'pastilla',
  'pastillas',
  'medicina',
  'panadol',
  'paracetamol',
  'ibuprofeno',
  'apronax',
  'jarabe',
  'curita',
  'consulta',
  'dentista',
  'ropa',
  'polo',
  'pantalon',
  'casaca',
  'zapatillas',
  'zapatos',
  'medias',
  'shampoo',
  'jabon',
  'detergente',
  'lejia',
  'alquiler',
  'mantenimiento',
  'arbitrios',
  'deuda',
  'prestamo',
  'cuota',
  'multa',
  'soat',
  'sol',
  'soles',
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
  'plata',
  'dinero',
  'sencillo',
  'billete',
  'moneda',
  'monedas',
  'efectivo',
  'cash',
  'yape',
  'plin',
  'tarjeta',
  'transferencia',
  'digital',
  'debito',
  'credito',
  'ayer',
  'hoy',
  'anoche',
  'anteayer',
  'antier',
  'ahora',
  'dia',
  'tarde',
  'noche',
  'manana',
  'un',
  'uno',
  'una',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciseis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veinticinco',
  'treinta',
  'cuarenta',
  'cincuenta',
  'cien',
  'media',
  'gasto',
  'compra',
  'pago',
  'algo',
  'nada',
  'cosa',
  'cosas',
]);

const DIGITAL_WORDS = new Set([
  'yape',
  'yapear',
  'yapee',
  'yapeado',
  'yapeo',
  'plin',
  'plinear',
  'plinee',
  'plineado',
  'agora',
  'tunki',
  'lukita',
  'bim',
  'izipay',
  'niubiz',
  'visa',
  'mastercard',
  'amex',
  'cmr',
  'pos',
  'transferencia',
  'transferir',
  'transferi',
  'transfirio',
  'deposite',
  'tarjeta',
  'debito',
  'credito',
  'bcp',
  'interbank',
  'bbva',
  'scotiabank',
  'digital',
  'qr',
]);

const CASH_WORDS = new Set([
  'efectivo',
  'cash',
  'contado',
  'sencillo',
  'monedas',
  'billete',
  'billetes',
]);

const TRANSIT_CASH_DEFAULT_WORDS = new Set(['combi', 'micro', 'colectivo', 'pasaje']);

const PAYMENT_PREPS = new Set(['por', 'al', 'en', 'con', 'via', 'a']);
const PAYMENT_VERBS = new Set(['pagado', 'pague', 'cancelado', 'con']);
const ARTICLES = new Set(['el', 'la', 'los', 'las']);
const CLAUSE_BREAK_WORDS = new Set(['y', 'ademas', 'luego', 'tambien', 'despues', 'pero', 'por', 'con', 'de']);

const PURCHASE_VERBS = new Set([
  'compre',
  'gaste',
  'pague',
  'consumi',
  'almorce',
  'cene',
  'desayune',
]);

const STORE_PREFIX_NOUNS = new Set([
  'puesto',
  'tienda',
  'bodega',
  'local',
  'grifo',
  'botica',
  'farmacia',
  'restaurante',
  'cafeteria',
  'cafetin',
  'panaderia',
  'pasteleria',
  'pizzeria',
  'polleria',
  'chifa',
  'cevicheria',
  'sangucheria',
  'chicharroneria',
  'anticucheria',
  'jugueria',
  'heladeria',
  'barberia',
  'peluqueria',
  'ferreteria',
  'lavanderia',
  'licoreria',
  'libreria',
  'zapateria',
  'jugueteria',
  'veterinaria',
  'cerrajeria',
  'mecanica',
  'comedor',
  'mercado',
  'supermercado',
  'hipermercado',
  'minimarket',
  'mall',
  'galeria',
  'clinica',
  'hospital',
  'posta',
  'laboratorio',
  'consultorio',
  'optica',
  'academia',
  'universidad',
  'instituto',
  'colegio',
  'taller',
  'cochera',
  'playa',
  'hotel',
  'hostal',
  'terminal',
  'kiosko',
  'quiosco',
]);

const HONORIFIC_PLACE_STARTERS = new Set([
  'don',
  'dona',
  'tio',
  'tia',
  'senor',
  'senora',
  'san',
  'santa',
]);

const PROPER_NOUN_STOPWORDS = new Set([
  'un',
  'una',
  'unos',
  'unas',
  'el',
  'la',
  'los',
  'las',
  'mi',
  'tu',
  'su',
  'mis',
  'este',
  'esta',
  'ese',
  'esa',
  'hoy',
  'ayer',
  'anoche',
  'anteayer',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
]);

function isCapitalizedWord(tok: Token | undefined): boolean {
  if (!tok || tok.kind !== 'word' || tok.raw.length < 2) return false;
  const first = tok.raw[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

const TRANSFER_RECIPIENT_VERBS = new Set(['yapee', 'plinee', 'transferi', 'pague', 'deposite']);
const NON_RECIPIENT_AFTER_A = new Set([
  'la',
  'las',
  'los',
  'color',
  'domicilio',
  'plazo',
  'cuotas',
  'credito',
  'debito',
  'cuenta',
  'mano',
  'medias',
  'mitad',
]);

const GENERIC_PLACE_WORDS = new Set([
  'chino',
  'mercado',
  'facultad',
  'unsa',
  'bodega',
  'bazar',
  'supermercado',
  'minimarket',
]);

export interface ExtractedPaymentInfo {
  method: PaymentMethod;
  explicit: boolean;
  matchedTokenIndices: number[];
}

export interface ExtractedMerchantInfo {
  merchantName?: string;
  matchedTokenIndices: number[];
}

export function extractPaymentMethodFromTokens(tokens: Token[]): ExtractedPaymentInfo {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'word') continue;

    // "en mano" / "en fisico"
    if (t.norm === 'en' && (tokens[i + 1]?.norm === 'mano' || tokens[i + 1]?.norm === 'fisico')) {
      return { method: 'cash', explicit: true, matchedTokenIndices: [i, i + 1] };
    }

    // "al contado" / "al yape"
    if (t.norm === 'al' && tokens[i + 1]) {
      if (tokens[i + 1].norm === 'contado') {
        return { method: 'cash', explicit: true, matchedTokenIndices: [i, i + 1] };
      }
      if (DIGITAL_WORDS.has(tokens[i + 1].norm)) {
        return { method: 'digital', explicit: true, matchedTokenIndices: [i, i + 1] };
      }
    }

    if (DIGITAL_WORDS.has(t.norm)) {
      const indices: number[] = [];
      if (i >= 2 && PAYMENT_VERBS.has(tokens[i - 2].norm) && PAYMENT_PREPS.has(tokens[i - 1].norm)) {
        indices.push(i - 2, i - 1);
      } else if (i >= 1 && PAYMENT_PREPS.has(tokens[i - 1].norm)) {
        indices.push(i - 1);
      }
      indices.push(i);
      return { method: 'digital', explicit: true, matchedTokenIndices: indices };
    }

    if (CASH_WORDS.has(t.norm)) {
      const indices: number[] = [];
      if (i >= 2 && PAYMENT_VERBS.has(tokens[i - 2].norm) && PAYMENT_PREPS.has(tokens[i - 1].norm)) {
        indices.push(i - 2, i - 1);
      } else if (i >= 1 && PAYMENT_PREPS.has(tokens[i - 1].norm)) {
        indices.push(i - 1);
      }
      indices.push(i);
      return { method: 'cash', explicit: true, matchedTokenIndices: indices };
    }
  }

  for (const t of tokens) {
    if (t.kind === 'word' && TRANSIT_CASH_DEFAULT_WORDS.has(t.norm)) {
      return { method: 'cash', explicit: false, matchedTokenIndices: [] };
    }
  }

  return { method: 'digital', explicit: false, matchedTokenIndices: [] };
}

function collectNounPhrase(
  tokens: Token[],
  startIdx: number,
  maxWords: number,
  excludedIndices: Set<number>
): { words: string[]; indices: number[] } {
  const words: string[] = [];
  const indices: number[] = [];

  for (let i = startIdx; i < tokens.length && words.length < maxWords; i++) {
    const t = tokens[i];
    if (excludedIndices.has(i) || t.kind === 'punct' || t.kind === 'currency' || t.kind === 'number') {
      break;
    }
    if (DIGITAL_WORDS.has(t.norm) || CASH_WORDS.has(t.norm)) {
      break;
    }
    if (words.length > 0 && CLAUSE_BREAK_WORDS.has(t.norm)) {
      break;
    }
    if (words.length === 0 && NON_MERCHANT_WORDS.has(t.norm)) {
      break;
    }
    if (words.length > 0 && (t.norm === 'en' || t.norm === 'por' || t.norm === 'al')) {
      break;
    }
    words.push(t.raw);
    indices.push(i);
  }

  return { words, indices };
}

export function extractMerchantFromTokens(
  tokens: Token[],
  knownPlaces: string[] = [],
  excludedIndices: Set<number> = new Set()
): ExtractedMerchantInfo {
  const allKnown = Array.from(new Set([...knownPlaces, ...POPULAR_PERUVIAN_MERCHANTS]))
    .filter((p) => p && p.trim().length >= 3)
    .sort((a, b) => b.length - a.length);

  // 1. Coincidencia exacta por secuencia de tokens contra comercios conocidos/populares
  for (const place of allKnown) {
    const placeWords = normalizeText(place).split(/\s+/).filter(Boolean);
    if (placeWords.length === 0) continue;

    for (let i = 0; i <= tokens.length - placeWords.length; i++) {
      let matched = true;
      const idxList: number[] = [];
      for (let j = 0; j < placeWords.length; j++) {
        const tok = tokens[i + j];
        if (excludedIndices.has(i + j) || tok.kind !== 'word' || tok.norm !== placeWords[j]) {
          matched = false;
          break;
        }
        idxList.push(i + j);
      }
      if (matched) {
        const prefixIndices: number[] = [];
        let cursor = i - 1;
        if (cursor >= 0 && ARTICLES.has(tokens[cursor].norm)) {
          prefixIndices.unshift(cursor);
          cursor--;
        }
        if (
          cursor >= 0 &&
          (tokens[cursor].norm === 'en' || tokens[cursor].norm === 'donde' || tokens[cursor].norm === 'de')
        ) {
          prefixIndices.unshift(cursor);
        }
        return {
          merchantName: place,
          matchedTokenIndices: [...prefixIndices, ...idxList],
        };
      }
    }
  }

  // 2. Patrones sintácticos sobre tokens
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (excludedIndices.has(i) || t.kind !== 'word') continue;

    // A: "(en)? donde (el|la|los|las)? <NP>"
    if (t.norm === 'donde') {
      let cursor = i + 1;
      const prefixIndices = i > 0 && tokens[i - 1].norm === 'en' ? [i - 1, i] : [i];
      if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
      }
      const np = collectNounPhrase(tokens, cursor, 3, excludedIndices);
      if (np.words.length > 0 && np.words.join(' ').length >= 2) {
        return {
          merchantName: toMerchantTitleCase(np.words.join(' ')),
          matchedTokenIndices: [...prefixIndices, ...np.indices],
        };
      }
    }

    // A2: "(yapeé|plineé|pagué|transferí) ... a <Destinatario/Comercio>" (ej: "Le yapeé 25 soles a Don Carlos")
    if (t.norm === 'a' && i > 0) {
      const hasTransferVerbBefore = tokens
        .slice(0, i)
        .some((prev) => prev.kind === 'word' && TRANSFER_RECIPIENT_VERBS.has(prev.norm));
      const nextTok = tokens[i + 1];
      if (
        hasTransferVerbBefore &&
        nextTok &&
        nextTok.kind === 'word' &&
        !NON_RECIPIENT_AFTER_A.has(nextTok.norm)
      ) {
        let cursor = i + 1;
        const prefixIndices = [i];
        if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
          prefixIndices.push(cursor);
          cursor++;
        }
        const np = collectNounPhrase(tokens, cursor, 3, excludedIndices);
        if (np.words.length > 0 && np.words.join(' ').length >= 2) {
          return {
            merchantName: toMerchantTitleCase(np.words.join(' ')),
            matchedTokenIndices: [...prefixIndices, ...np.indices],
          };
        }
      }
    }

    // A3: "(en|de|del|al|donde) (el|la)? (don|doña|tío|tía|señor|señora|san|santa) <NP>"
    if (
      t.norm === 'en' ||
      t.norm === 'de' ||
      t.norm === 'del' ||
      t.norm === 'al' ||
      t.norm === 'donde'
    ) {
      let cursor = i + 1;
      const prefixIndices = [i];
      if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
      }
      if (tokens[cursor] && HONORIFIC_PLACE_STARTERS.has(tokens[cursor].norm)) {
        const np = collectNounPhrase(tokens, cursor, 3, excludedIndices);
        if (np.words.length >= 2) {
          return {
            merchantName: toMerchantTitleCase(np.words.join(' ')),
            matchedTokenIndices: [...prefixIndices, ...np.indices],
          };
        }
      }
    }

    // B: "(en|de|del) (la tienda de | el grifo | la botica | el mercado | ...) <NP>"
    if (t.norm === 'en' || t.norm === 'de' || t.norm === 'del') {
      let cursor = i + 1;
      const prefixIndices = [i];
      if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
      }
      if (tokens[cursor] && STORE_PREFIX_NOUNS.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
        if (tokens[cursor]?.norm === 'de') {
          prefixIndices.push(cursor);
          cursor++;
        }
        const np = collectNounPhrase(tokens, cursor, 3, excludedIndices);
        if (np.words.length > 0 && np.words.join(' ').length >= 2) {
          return {
            merchantName: toMerchantTitleCase(np.words.join(' ')),
            matchedTokenIndices: [...prefixIndices, ...np.indices],
          };
        }
      }
    }

    // P: Nombre propio capitalizado por el STT tras locativo "(en|del|al) <Nombre Propio>"
    // Ej: "Almuerzo 15 soles en El Paisa", "Gasté 40 soles en La Choza Náutica", "Café en Café Central"
    if (t.norm === 'en' || t.norm === 'del' || t.norm === 'al') {
      let cursor = i + 1;
      const prefixIndices = [i];
      const firstTok = tokens[cursor];
      const secondTok = tokens[cursor + 1];

      // Permitir artículo capitalizado que forma parte del nombre ("en El Paisa", "en La Choza Náutica")
      const startsWithCapArticle =
        firstTok &&
        ARTICLES.has(firstTok.norm) &&
        isCapitalizedWord(firstTok) &&
        isCapitalizedWord(secondTok) &&
        !NON_MERCHANT_WORDS.has(secondTok.norm) &&
        !PROPER_NOUN_STOPWORDS.has(secondTok.norm);

      if (startsWithCapArticle) {
        const np = collectNounPhrase(tokens, cursor, 3, excludedIndices);
        if (np.words.length >= 2) {
          return {
            merchantName: toMerchantTitleCase(np.words.join(' ')),
            matchedTokenIndices: [...prefixIndices, ...np.indices],
          };
        }
      }

      if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
      }

      const capStart = tokens[cursor];
      if (
        capStart &&
        !excludedIndices.has(cursor) &&
        isCapitalizedWord(capStart) &&
        !NON_MERCHANT_WORDS.has(capStart.norm) &&
        !PROPER_NOUN_STOPWORDS.has(capStart.norm)
      ) {
        const np = collectNounPhrase(tokens, cursor, 3, excludedIndices);
        if (np.words.length > 0 && np.words.join(' ').length >= 2) {
          return {
            merchantName: toMerchantTitleCase(np.words.join(' ')),
            matchedTokenIndices: [...prefixIndices, ...np.indices],
          };
        }
      }
    }

    // C: "<verbo compra> en (el|la)? <NP>"
    if (PURCHASE_VERBS.has(t.norm) && tokens[i + 1]?.norm === 'en') {
      let cursor = i + 2;
      const prefixIndices = [i + 1];
      if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
      }
      const np = collectNounPhrase(tokens, cursor, 2, excludedIndices);
      if (np.words.length > 0 && np.words.join(' ').length >= 2) {
        return {
          merchantName: toMerchantTitleCase(np.words.join(' ')),
          matchedTokenIndices: [...prefixIndices, ...np.indices],
        };
      }
    }

    // D: "en (el|la)? (chino|mercado|facultad|unsa|bodega|bazar|supermercado|minimarket)"
    if (t.norm === 'en') {
      let cursor = i + 1;
      const prefixIndices = [i];
      if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
        prefixIndices.push(cursor);
        cursor++;
      }
      const cand = tokens[cursor];
      if (cand && !excludedIndices.has(cursor) && GENERIC_PLACE_WORDS.has(cand.norm)) {
        return {
          merchantName: toMerchantTitleCase(cand.raw),
          matchedTokenIndices: [...prefixIndices, cursor],
        };
      }
    }
  }

  // E: "en [Local]" justo antes de método de pago o doble "en [Concepto] en [Local]"
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (excludedIndices.has(i) || t.norm !== 'en') continue;

    let cursor = i + 1;
    const prefixIndices = [i];
    if (tokens[cursor] && ARTICLES.has(tokens[cursor].norm)) {
      prefixIndices.push(cursor);
      cursor++;
    }
    const np = collectNounPhrase(tokens, cursor, 2, excludedIndices);
    if (np.words.length === 0 || np.words.join(' ').length < 2) continue;

    const afterNpIdx = np.indices[np.indices.length - 1] + 1;
    const next1 = tokens[afterNpIdx]?.norm;
    const next2 = tokens[afterNpIdx + 1]?.norm;

    const followedByPayment =
      (next1 && PAYMENT_PREPS.has(next1) && next2 && (DIGITAL_WORDS.has(next2) || CASH_WORDS.has(next2))) ||
      (next1 === 'al' && next2 === 'contado');

    const precededByAnotherEn = tokens
      .slice(0, i)
      .some((prev, pIdx) => !excludedIndices.has(pIdx) && prev.norm === 'en');

    if (followedByPayment || precededByAnotherEn) {
      return {
        merchantName: toMerchantTitleCase(np.words.join(' ')),
        matchedTokenIndices: [...prefixIndices, ...np.indices],
      };
    }
  }

  // 3. Similitud fonética / Levenshtein contra comercios conocidos
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (
      excludedIndices.has(i) ||
      t.kind !== 'word' ||
      t.norm.length < 4 ||
      NON_MERCHANT_WORDS.has(t.norm)
    ) {
      continue;
    }
    for (const place of allKnown) {
      const normPlace = normalizeWord(place);
      if (normPlace.includes(' ')) continue;
      if (
        stringSimilarity(t.norm, normPlace) >= 0.82 ||
        phoneticTrigramSimilarity(t.norm, normPlace) >= 0.72
      ) {
        const indices = [i];
        if (i > 0 && (tokens[i - 1].norm === 'en' || tokens[i - 1].norm === 'donde')) {
          indices.unshift(i - 1);
        }
        return { merchantName: place, matchedTokenIndices: indices };
      }
    }
  }

  return { merchantName: undefined, matchedTokenIndices: [] };
}

const INCOME_SOURCE_STOPWORDS = new Set([
  'me',
  'pagaron',
  'dieron',
  'depositaron',
  'transfirieron',
  'yapeo',
  'plineo',
  'transfirio',
  'recibi',
  'cobre',
  'ingrese',
  'fue',
  'fueron',
  'son',
  'un',
  'una',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'por',
  'para',
  'en',
  'a',
  'al',
  'con',
  'y',
  'e',
]);

/**
 * Extrae la fuente/origen de un ingreso dictado por voz directamente desde tokens.
 */
export function extractIncomeSource(
  tokens: Token[],
  consumedAmountAndDate: Set<number>,
  categoryName?: string
): string {
  const active = tokens.filter(
    (t) => !consumedAmountAndDate.has(t.index) && t.kind !== 'punct'
  );

  // Patrón explícito: "de parte de <X>"
  for (let i = 0; i < active.length; i++) {
    const t = active[i];
    if (t.norm === 'parte' && active[i - 1]?.norm === 'de' && active[i + 1]?.norm === 'de') {
      const rest = active
        .slice(i + 2, i + 5)
        .map((w) => w.raw)
        .join(' ')
        .trim();
      if (rest.length >= 2) return capitalizeFirst(rest);
    }
  }

  // Recortar verbos/preposiciones de borde y conservar un origen conciso
  let start = 0;
  let end = active.length;
  while (start < end && INCOME_SOURCE_STOPWORDS.has(active[start].norm)) {
    start++;
  }
  while (end > start && INCOME_SOURCE_STOPWORDS.has(active[end - 1].norm)) {
    end--;
  }

  const candidate = active
    .slice(start, Math.min(end, start + 5))
    .map((t) => t.raw)
    .join(' ')
    .trim();

  if (candidate.length >= 2) {
    return capitalizeFirst(candidate).slice(0, 100);
  }

  return categoryName || '';
}
