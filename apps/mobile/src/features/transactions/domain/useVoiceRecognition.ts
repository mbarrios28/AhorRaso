import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { SpeechAlternative } from './types';

// Safe dynamic check to support both Native Dev Builds and gracefully fallback in Expo Go / tests
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, listener: (event?: any) => void) => void = () => {};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const speechModule = require('expo-speech-recognition');
  if (speechModule) {
    ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule;
    if (speechModule.useSpeechRecognitionEvent) {
      useSpeechRecognitionEvent = speechModule.useSpeechRecognitionEvent;
    }
  }
} catch {
  // Native module unavailable (e.g. Expo Go standard client or Jest test environment)
}

export interface UseVoiceRecognitionOptions {
  lang?: string;
  contextualHints?: string[];
}

export interface StopListeningResult {
  transcript: string;
  alternatives: SpeechAlternative[];
}

export interface UseVoiceRecognitionReturn {
  isListening: boolean;
  transcript: string;
  alternatives: SpeechAlternative[];
  audioLevel: number;
  isOnDevice: boolean;
  error: string | null;
  isSupported: boolean;
  isExpoGo: boolean;
  isWebSpeech: boolean;
  isNativeModule: boolean;
  startListening: () => Promise<void>;
  stopListening: () => string;
  stopListeningAsync: () => Promise<StopListeningResult>;
  cancelListening: () => void;
  setTranscript: (text: string) => void;
}

const BASE_PERUVIAN_BIAS_STRINGS = [
  'sol',
  'soles',
  'un sol',
  'dos soles',
  'céntimos',
  'lucas',
  'media luca',
  'china',
  'peseta',
  'ferro',
  'yape',
  'yapeé',
  'plin',
  'plineé',
  'al contado',
  'efectivo',
  'BCP',
  'Interbank',
  'BBVA',
  'Scotiabank',
  'Tambo',
  'Oxxo',
  'Mass',
  'Plaza Vea',
  'Tottus',
  'Inkafarma',
  'Mifarma',
  'Rappi',
  'PedidosYa',
  'InDrive',
  'Yango',
  'Uber',
  'Bembos',
  'Pardos',
  'Norkys',
  'Rokys',
  'Cineplanet',
  'Cinemark',
  'Sodimac',
  'Promart',
  'SmartFit',
  'Sedapal',
  'Cálidda',
  'Luz del Sur',
  'Enel',
  'Movistar',
  'Entel',
  'Bitel',
  'almuerzo',
  'menú',
  'ceviche',
  'chaufa',
  'mostrito',
  'salchipapa',
  'taxi',
  'combi',
  'mototaxi',
  'metropolitano',
  'pichanga',
  'don pepe',
  'sueldo',
  'quincena',
  'grati',
  'propina',
  'cachuelo',
  'freelance',
];

const PREFERRED_LOCALES = ['es-PE', 'es-419', 'es-ES', 'es-MX', 'es'];
const MAX_CONSECUTIVE_RESTARTS = 5;
const MAX_BIAS_STRINGS = 70;
const STOP_SAFETY_TIMEOUT_MS = 1200;

function mergeContextualStrings(extraHints: string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of [...extraHints, ...BASE_PERUVIAN_BIAS_STRINGS]) {
    const trimmed = item?.trim();
    if (!trimmed || trimmed.length < 2) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_BIAS_STRINGS) break;
  }

  return result;
}

function buildCombinedFromSegmentAlts(
  finalizedAlts: SpeechAlternative[][],
  interimAlts: SpeechAlternative[]
): StopListeningResult {
  const segments = [...finalizedAlts];
  if (interimAlts.length > 0) {
    const lastFinalPrimary = segments[segments.length - 1]?.[0]?.transcript?.trim();
    const interimPrimary = interimAlts[0]?.transcript?.trim();
    if (interimPrimary && interimPrimary !== lastFinalPrimary) {
      segments.push(interimAlts);
    }
  }

  if (segments.length === 0) {
    return { transcript: '', alternatives: [] };
  }

  const joinCandidate = (indices: number[]): SpeechAlternative => {
    const parts: string[] = [];
    const confs: number[] = [];
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      const chosen = seg[indices[sIdx]] ?? seg[0];
      if (chosen?.transcript) {
        parts.push(chosen.transcript.trim());
        if (typeof chosen.confidence === 'number' && chosen.confidence >= 0) {
          confs.push(chosen.confidence);
        }
      }
    }
    const avgConf =
      confs.length > 0 ? Number((confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3)) : -1;
    return {
      transcript: parts.join(' ').trim(),
      confidence: avgConf,
    };
  };

  const baseIndices = segments.map(() => 0);
  const hypotheses: SpeechAlternative[] = [];
  const seen = new Set<string>();

  const pushHyp = (alt: SpeechAlternative) => {
    if (!alt.transcript) return;
    const key = alt.transcript.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hypotheses.push(alt);
  };

  pushHyp(joinCandidate(baseIndices));

  // Variar alternativas empezando por el último segmento para generar hasta 5 hipótesis N-best
  for (let sIdx = segments.length - 1; sIdx >= 0 && hypotheses.length < 5; sIdx--) {
    const seg = segments[sIdx];
    for (let aIdx = 1; aIdx < seg.length && hypotheses.length < 5; aIdx++) {
      const variant = [...baseIndices];
      variant[sIdx] = aIdx;
      pushHyp(joinCandidate(variant));
    }
  }

  return {
    transcript: hypotheses[0]?.transcript ?? '',
    alternatives: hypotheses,
  };
}

function mapFatalErrorMessage(errorCode: string, nativeMessage?: string): string {
  switch (errorCode) {
    case 'not-allowed':
      return 'Permiso de micrófono o reconocimiento de voz denegado.';
    case 'service-not-allowed':
      return 'El servicio de reconocimiento de voz no está habilitado en este dispositivo.';
    case 'language-not-supported':
      return 'El idioma español no está disponible en el reconocedor del dispositivo.';
    case 'audio-capture':
      return 'No se pudo acceder al micrófono del dispositivo.';
    case 'interrupted':
      return 'La captura de audio fue interrumpida por otra aplicación.';
    default:
      return nativeMessage || `Error de reconocimiento (${errorCode})`;
  }
}

/**
 * Hook oficial de reconocimiento de voz para HU-10 / RF-003.
 *
 * Implementación 100% On-Device / Local (cero llamadas a APIs externas):
 * - Prioriza reconocimiento offline (`requiresOnDeviceRecognition`) cuando el paquete de idioma local
 *   está instalado (`getSupportedLocales` + `supportsOnDeviceRecognition`).
 * - Captura hasta 5 hipótesis alternativas (`maxAlternatives: 5`), puntuación automática (`addsPunctuation`),
 *   sesgo contextual dinámico (`contextualStrings`) y nivel real de audio (`volumechange`).
 * - Detención determinista esperando `end`/`isFinal` (sin retardos fijos ciegos) y backoff acotado ante cortes.
 */
export function useVoiceRecognition(
  options: UseVoiceRecognitionOptions = {}
): UseVoiceRecognitionReturn {
  const { lang = 'es-PE', contextualHints } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscriptState] = useState('');
  const [alternatives, setAlternatives] = useState<SpeechAlternative[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isOnDevice, setIsOnDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const biasStrings = useMemo(() => mergeContextualStrings(contextualHints), [contextualHints]);
  const biasStringsRef = useRef<string[]>(biasStrings);
  useEffect(() => {
    biasStringsRef.current = biasStrings;
  }, [biasStrings]);

  const transcriptRef = useRef('');
  const alternativesRef = useRef<SpeechAlternative[]>([]);
  const isListeningRef = useRef(false);
  const shouldListenRef = useRef(false);

  const finalizedAltsRef = useRef<SpeechAlternative[][]>([]);
  const currentInterimAltsRef = useRef<SpeechAlternative[]>([]);

  const resolvedLocaleRef = useRef<string>(lang);
  const onDeviceCapableRef = useRef<boolean>(false);
  const localeCheckedRef = useRef<boolean>(false);

  const restartAttemptsRef = useRef<number>(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWaitersRef = useRef<((res: StopListeningResult) => void)[]>([]);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const webRecognitionRef = useRef<any>(null);

  const clearTimers = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const flushStopWaiters = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (stopWaitersRef.current.length === 0) return;
    const payload: StopListeningResult = {
      transcript: transcriptRef.current,
      alternatives: alternativesRef.current,
    };
    const waiters = stopWaitersRef.current.splice(0, stopWaitersRef.current.length);
    for (const resolve of waiters) {
      resolve(payload);
    }
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      clearTimers();
      flushStopWaiters();
      if (Platform.OS !== 'web') {
        try {
          ExpoSpeechRecognitionModule?.abort();
        } catch {
          // ignore on unmount
        }
      } else {
        try {
          webRecognitionRef.current?.abort();
        } catch {
          // ignore on unmount
        }
      }
    };
  }, [clearTimers, flushStopWaiters]);

  const resolveNativeCapabilities = useCallback(async () => {
    if (localeCheckedRef.current || !ExpoSpeechRecognitionModule) {
      return;
    }
    localeCheckedRef.current = true;

    let selectedLocale = lang;
    let strictOnDevice = false;

    try {
      const supportsOnDevice =
        typeof ExpoSpeechRecognitionModule.supportsOnDeviceRecognition === 'function'
          ? Boolean(ExpoSpeechRecognitionModule.supportsOnDeviceRecognition())
          : false;

      if (typeof ExpoSpeechRecognitionModule.getSupportedLocales === 'function') {
        const localeInfo = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        const installed: string[] = Array.isArray(localeInfo?.installedLocales)
          ? localeInfo.installedLocales
          : [];
        const supported: string[] = Array.isArray(localeInfo?.locales) ? localeInfo.locales : [];

        const candidates = Array.from(new Set([lang, ...PREFERRED_LOCALES]));
        const findMatch = (pool: string[]) => {
          for (const pref of candidates) {
            const prefLower = pref.toLowerCase();
            const exact = pool.find((l) => l.toLowerCase() === prefLower);
            if (exact) return exact;
          }
          for (const pref of candidates) {
            const base = pref.split('-')[0].toLowerCase();
            const prefix = pool.find((l) => l.toLowerCase().startsWith(base));
            if (prefix) return prefix;
          }
          return null;
        };

        const installedMatch = findMatch(installed);
        if (installedMatch) {
          selectedLocale = installedMatch;
          strictOnDevice = supportsOnDevice;
        } else {
          const supportedMatch = findMatch(supported);
          if (supportedMatch) {
            selectedLocale = supportedMatch;
          }
        }
      }
    } catch {
      // Continuar con locale por defecto si el servicio nativo no responde locales
    }

    resolvedLocaleRef.current = selectedLocale;
    onDeviceCapableRef.current = strictOnDevice;
    setIsOnDevice(strictOnDevice);
  }, [lang]);

  const startNativeSession = useCallback(() => {
    if (!ExpoSpeechRecognitionModule) return;
    ExpoSpeechRecognitionModule.start({
      lang: resolvedLocaleRef.current,
      interimResults: true,
      continuous: true,
      maxAlternatives: 5,
      addsPunctuation: true,
      requiresOnDeviceRecognition: onDeviceCapableRef.current,
      contextualStrings: biasStringsRef.current,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 100,
      },
    });
  }, []);

  const scheduleRestartWithBackoff = useCallback(() => {
    if (!shouldListenRef.current || Platform.OS === 'web' || !ExpoSpeechRecognitionModule) {
      return false;
    }
    if (restartAttemptsRef.current >= MAX_CONSECUTIVE_RESTARTS) {
      shouldListenRef.current = false;
      isListeningRef.current = false;
      setIsListening(false);
      setAudioLevel(0);
      return false;
    }

    const attempt = restartAttemptsRef.current;
    restartAttemptsRef.current += 1;
    const delayMs = Math.min(1500, 120 * Math.pow(2, attempt));

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!shouldListenRef.current) return;
      try {
        startNativeSession();
        isListeningRef.current = true;
        setIsListening(true);
      } catch {
        isListeningRef.current = false;
        setIsListening(false);
      }
    }, delayMs);

    return true;
  }, [startNativeSession]);

  // ==========================================
  // EVENTOS OFICIALES DE EXPO-SPEECH-RECOGNITION
  // ==========================================
  useSpeechRecognitionEvent('start', () => {
    isListeningRef.current = true;
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('volumechange', (event: any) => {
    if (typeof event?.value !== 'number') return;
    // Expo emite valores entre -2 y 10 (<= 0 es inaudible)
    const normalized = Math.max(0, Math.min(1, event.value / 10));
    setAudioLevel(normalized);
  });

  useSpeechRecognitionEvent('result', (event: any) => {
    const rawResults: { transcript?: string; confidence?: number }[] = Array.isArray(
      event?.results
    )
      ? event.results
      : [];

    const mappedAlts: SpeechAlternative[] = rawResults
      .slice(0, 5)
      .map((r) => ({
        transcript: (r?.transcript ?? '').trim(),
        confidence: typeof r?.confidence === 'number' ? r.confidence : -1,
      }))
      .filter((a) => a.transcript.length > 0);

    if (mappedAlts.length === 0) return;

    // Reiniciar contador de reintentos al recibir voz válida
    restartAttemptsRef.current = 0;

    if (event.isFinal) {
      const lastPrimary =
        finalizedAltsRef.current[finalizedAltsRef.current.length - 1]?.[0]?.transcript;
      if (lastPrimary !== mappedAlts[0].transcript) {
        finalizedAltsRef.current.push(mappedAlts);
      }
      currentInterimAltsRef.current = [];
    } else {
      currentInterimAltsRef.current = mappedAlts;
    }

    const combined = buildCombinedFromSegmentAlts(
      finalizedAltsRef.current,
      currentInterimAltsRef.current
    );
    transcriptRef.current = combined.transcript;
    alternativesRef.current = combined.alternatives;
    setTranscriptState(combined.transcript);
    setAlternatives(combined.alternatives);

    if (event.isFinal && !shouldListenRef.current && stopWaitersRef.current.length > 0) {
      // Pequeña ventana para dejar que 'end' cierre; si 'end' no llega, resuelve rápido
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = setTimeout(flushStopWaiters, 120);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (currentInterimAltsRef.current.length > 0) {
      const lastPrimary =
        finalizedAltsRef.current[finalizedAltsRef.current.length - 1]?.[0]?.transcript;
      if (lastPrimary !== currentInterimAltsRef.current[0].transcript) {
        finalizedAltsRef.current.push(currentInterimAltsRef.current);
      }
      currentInterimAltsRef.current = [];

      const combined = buildCombinedFromSegmentAlts(finalizedAltsRef.current, []);
      transcriptRef.current = combined.transcript;
      alternativesRef.current = combined.alternatives;
      setTranscriptState(combined.transcript);
      setAlternatives(combined.alternatives);
    }

    if (shouldListenRef.current && scheduleRestartWithBackoff()) {
      return;
    }

    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    flushStopWaiters();
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    const errCode: string = event?.error || 'unknown';

    if (errCode === 'aborted') {
      isListeningRef.current = false;
      setIsListening(false);
      setAudioLevel(0);
      flushStopWaiters();
      return;
    }

    if (errCode === 'no-speech' || errCode === 'speech-timeout' || errCode === 'busy') {
      if (shouldListenRef.current && scheduleRestartWithBackoff()) {
        return;
      }
    } else {
      shouldListenRef.current = false;
      setError(mapFatalErrorMessage(errCode, event?.message));
    }

    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    flushStopWaiters();
  });

  const startListening = useCallback(async () => {
    clearTimers();
    restartAttemptsRef.current = 0;
    setError(null);
    setTranscriptState('');
    setAlternatives([]);
    setAudioLevel(0);
    transcriptRef.current = '';
    alternativesRef.current = [];
    shouldListenRef.current = true;
    finalizedAltsRef.current = [];
    currentInterimAltsRef.current = [];

    // 1. Android / iOS Nativo
    if (Platform.OS !== 'web') {
      if (!ExpoSpeechRecognitionModule) {
        isListeningRef.current = false;
        setIsListening(false);
        shouldListenRef.current = false;
        return;
      }
      try {
        if (
          typeof ExpoSpeechRecognitionModule.isRecognitionAvailable === 'function' &&
          !ExpoSpeechRecognitionModule.isRecognitionAvailable()
        ) {
          setError('El reconocimiento de voz no está disponible en este dispositivo.');
          isListeningRef.current = false;
          setIsListening(false);
          shouldListenRef.current = false;
          return;
        }

        const micPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!micPermission.granted) {
          setError('Permiso de micrófono o reconocimiento de voz denegado.');
          isListeningRef.current = false;
          setIsListening(false);
          shouldListenRef.current = false;
          return;
        }

        await resolveNativeCapabilities();

        if (!shouldListenRef.current) return;

        startNativeSession();
        isListeningRef.current = true;
        setIsListening(true);
      } catch (e: any) {
        setError(e?.message || 'No se pudo iniciar el reconocimiento nativo');
        isListeningRef.current = false;
        setIsListening(false);
        shouldListenRef.current = false;
      }
      return;
    }

    // 2. Web Speech API (Navegador)
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.lang = lang;
          rec.continuous = true;
          rec.interimResults = true;
          rec.maxAlternatives = 5;

          rec.onstart = () => {
            isListeningRef.current = true;
            setIsListening(true);
          };
          rec.onresult = (ev: any) => {
            const finalized: SpeechAlternative[][] = [];
            const interim: SpeechAlternative[] = [];

            for (let i = 0; i < ev.results.length; i++) {
              const resList = ev.results[i];
              const segAlts: SpeechAlternative[] = [];
              for (let k = 0; k < Math.min(5, resList.length); k++) {
                const t = (resList[k]?.transcript ?? '').trim();
                if (t) {
                  segAlts.push({
                    transcript: t,
                    confidence: typeof resList[k]?.confidence === 'number' ? resList[k].confidence : -1,
                  });
                }
              }
              if (segAlts.length === 0) continue;
              if (resList.isFinal) {
                finalized.push(segAlts);
              } else {
                // Acumular fragmentos interinos del turno actual
                if (interim.length === 0) {
                  interim.push(...segAlts);
                } else {
                  interim[0] = {
                    transcript: `${interim[0].transcript} ${segAlts[0].transcript}`.trim(),
                    confidence: segAlts[0].confidence,
                  };
                }
              }
            }

            const combined = buildCombinedFromSegmentAlts(finalized, interim);
            transcriptRef.current = combined.transcript;
            alternativesRef.current = combined.alternatives;
            setTranscriptState(combined.transcript);
            setAlternatives(combined.alternatives);
          };
          rec.onerror = (ev: any) => {
            if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
              setError(`Error de micrófono: ${ev.error}`);
            }
            isListeningRef.current = false;
            setIsListening(false);
            setAudioLevel(0);
            flushStopWaiters();
          };
          rec.onend = () => {
            isListeningRef.current = false;
            setIsListening(false);
            setAudioLevel(0);
            flushStopWaiters();
          };

          webRecognitionRef.current = rec;
          rec.start();
          isListeningRef.current = true;
          setIsListening(true);
        } catch (err: any) {
          setError(err?.message || 'Error al iniciar reconocimiento web');
          isListeningRef.current = false;
          setIsListening(false);
        }
      }
    }
  }, [clearTimers, flushStopWaiters, lang, resolveNativeCapabilities, startNativeSession]);

  const stopListening = useCallback((): string => {
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    if (Platform.OS !== 'web') {
      try {
        ExpoSpeechRecognitionModule?.stop();
      } catch {
        // ignore
      }
    } else {
      try {
        webRecognitionRef.current?.stop();
      } catch {
        // ignore
      }
      webRecognitionRef.current = null;
    }

    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    return transcriptRef.current;
  }, []);

  const stopListeningAsync = useCallback((): Promise<StopListeningResult> => {
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    const active = isListeningRef.current && (ExpoSpeechRecognitionModule || webRecognitionRef.current);
    if (!active) {
      isListeningRef.current = false;
      setIsListening(false);
      setAudioLevel(0);
      return Promise.resolve({
        transcript: transcriptRef.current,
        alternatives: alternativesRef.current,
      });
    }

    return new Promise<StopListeningResult>((resolve) => {
      stopWaitersRef.current.push(resolve);
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }
      stopTimeoutRef.current = setTimeout(flushStopWaiters, STOP_SAFETY_TIMEOUT_MS);

      try {
        if (Platform.OS !== 'web') {
          ExpoSpeechRecognitionModule?.stop();
        } else {
          webRecognitionRef.current?.stop();
        }
      } catch {
        flushStopWaiters();
      }
    });
  }, [flushStopWaiters]);

  const cancelListening = useCallback(() => {
    shouldListenRef.current = false;
    clearTimers();
    flushStopWaiters();
    finalizedAltsRef.current = [];
    currentInterimAltsRef.current = [];

    if (Platform.OS !== 'web') {
      try {
        ExpoSpeechRecognitionModule?.abort();
      } catch {
        // ignore
      }
    } else {
      try {
        webRecognitionRef.current?.abort();
      } catch {
        // ignore
      }
      webRecognitionRef.current = null;
    }

    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    setTranscriptState('');
    setAlternatives([]);
    transcriptRef.current = '';
    alternativesRef.current = [];
    setError(null);
  }, [clearTimers, flushStopWaiters]);

  const updateTranscriptManually = useCallback((text: string) => {
    const clean = text.trim();
    const alts: SpeechAlternative[] = clean ? [{ transcript: clean, confidence: 1 }] : [];
    setTranscriptState(text);
    setAlternatives(alts);
    transcriptRef.current = text;
    alternativesRef.current = clean ? alts : [];
    finalizedAltsRef.current = clean ? [alts] : [];
    currentInterimAltsRef.current = [];
  }, []);

  return {
    isListening,
    transcript,
    alternatives,
    audioLevel,
    isOnDevice,
    error,
    isSupported: !!ExpoSpeechRecognitionModule || Platform.OS === 'web',
    isExpoGo: !ExpoSpeechRecognitionModule && Platform.OS !== 'web',
    isWebSpeech: Platform.OS === 'web',
    isNativeModule: !!ExpoSpeechRecognitionModule && Platform.OS !== 'web',
    startListening,
    stopListening,
    stopListeningAsync,
    cancelListening,
    setTranscript: updateTranscriptManually,
  };
}
