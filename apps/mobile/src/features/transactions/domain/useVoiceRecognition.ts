import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
// Safe dynamic check to support both Native Dev Builds and gracefully fallback in Expo Go / tests
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, listener: (event?: any) => void) => void = () => {};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

export interface UseVoiceRecognitionReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
  isExpoGo: boolean;
  isWebSpeech: boolean;
  isNativeModule: boolean;
  startListening: () => Promise<void>;
  stopListening: () => string;
  cancelListening: () => void;
  setTranscript: (text: string) => void;
}

/**
 * Hook oficial de reconocimiento de voz para HU-10 / RF-003.
 *
 * Implementación 100% On-Device ($0.00 USD, sin APIs pagadas):
 * - Android: Usa el servicio nativo del sistema (Google SpeechRecognizer) mediante ExpoSpeechRecognitionModule.
 * - Web: Fallback transparente con Web Speech API (webkitSpeechRecognition).
 */
export function useVoiceRecognition(): UseVoiceRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const transcriptRef = useRef('');
  transcriptRef.current = transcript;

  // Seguimiento de estado intencional y acumulación continua sin pérdidas por pausas
  const shouldListenRef = useRef(false);
  const finalizedSegmentsRef = useRef<string[]>([]);
  const currentInterimRef = useRef<string>('');

  const webRecognitionRef = useRef<any>(null);

  // Palabras contextuales para sesgo del reconocedor nativo
  const PERUVIAN_BIAS_STRINGS = [
    'sol',
    'soles',
    'un sol',
    'dos soles',
    'tres soles',
    'lucas',
    'media luca',
    'almuerzo',
    'menú',
    'tambo',
    'yape',
    'plin',
    'al contado',
    'efectivo',
    'taxi',
    'combi',
    'don pepe',
  ];

  // ==========================================
  // EVENTOS OFICIALES DE EXPO-SPEECH-RECOGNITION
  // ==========================================
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    // Si Android cerró la sesión por silencio pero el usuario no ha cancelado ni finalizado
    if (shouldListenRef.current && Platform.OS !== 'web' && ExpoSpeechRecognitionModule) {
      if (currentInterimRef.current) {
        const last = finalizedSegmentsRef.current[finalizedSegmentsRef.current.length - 1];
        if (last !== currentInterimRef.current) {
          finalizedSegmentsRef.current.push(currentInterimRef.current);
        }
        currentInterimRef.current = '';
      }

      // Reiniciar de inmediato la sesión nativa para mantener escucha continua ilimitada
      try {
        ExpoSpeechRecognitionModule.start({
          lang: 'es-PE',
          interimResults: true,
          continuous: true,
          contextualStrings: PERUVIAN_BIAS_STRINGS,
        });
        setIsListening(true);
        return;
      } catch {
        // En caso de que el módulo esté liberando el canal de audio
      }
    }
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event: any) => {
    const text = event.results?.[0]?.transcript?.trim();
    if (!text) return;

    if (event.isFinal) {
      const last = finalizedSegmentsRef.current[finalizedSegmentsRef.current.length - 1];
      if (last !== text) {
        finalizedSegmentsRef.current.push(text);
      }
      currentInterimRef.current = '';
    } else {
      currentInterimRef.current = text;
    }

    // Combinar segmentos finalizados previos + texto en curso
    const allParts = [...finalizedSegmentsRef.current];
    if (currentInterimRef.current && currentInterimRef.current !== allParts[allParts.length - 1]) {
      allParts.push(currentInterimRef.current);
    }

    const fullTranscript = allParts.join(' ').trim();
    setTranscript(fullTranscript);
    transcriptRef.current = fullTranscript;
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    console.warn('SpeechRecognition error event:', event.error, event.message);
    if (event.error === 'no-speech' || event.error === 'speech-timeout') {
      if (shouldListenRef.current && Platform.OS !== 'web' && ExpoSpeechRecognitionModule) {
        try {
          ExpoSpeechRecognitionModule.start({
            lang: 'es-PE',
            interimResults: true,
            continuous: true,
            contextualStrings: PERUVIAN_BIAS_STRINGS,
          });
          setIsListening(true);
          return;
        } catch {
          // ignore
        }
      }
    } else {
      setError(event.message || `Error de reconocimiento (${event.error})`);
    }
    setIsListening(false);
  });

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    transcriptRef.current = '';
    shouldListenRef.current = true;
    finalizedSegmentsRef.current = [];
    currentInterimRef.current = '';

    // 1. Android / iOS Nativo
    if (Platform.OS !== 'web') {
      if (!ExpoSpeechRecognitionModule) {
        setIsListening(false);
        shouldListenRef.current = false;
        return;
      }
      try {
        const micPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!micPermission.granted) {
          setError('Permiso de micrófono o reconocimiento de voz denegado.');
          setIsListening(false);
          shouldListenRef.current = false;
          return;
        }

        // Iniciar reconocimiento de voz continuo en Español (Perú)
        ExpoSpeechRecognitionModule.start({
          lang: 'es-PE',
          interimResults: true,
          continuous: true,
          contextualStrings: PERUVIAN_BIAS_STRINGS,
        });
        setIsListening(true);
      } catch (e: any) {
        console.error('Error al iniciar ExpoSpeechRecognitionModule:', e);
        setError(e?.message || 'No se pudo iniciar el reconocimiento nativo');
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
          rec.lang = 'es-PE';
          rec.continuous = true;
          rec.interimResults = true;

          rec.onstart = () => setIsListening(true);
          rec.onresult = (ev: any) => {
            let str = '';
            for (let i = 0; i < ev.results.length; i++) {
              str += ev.results[i][0].transcript;
            }
            const trimmed = str.trim();
            setTranscript(trimmed);
            transcriptRef.current = trimmed;
          };
          rec.onerror = (ev: any) => {
            if (ev.error !== 'no-speech') {
              setError(`Error de micrófono: ${ev.error}`);
            }
            setIsListening(false);
          };
          rec.onend = () => setIsListening(false);

          webRecognitionRef.current = rec;
          rec.start();
          setIsListening(true);
        } catch (err: any) {
          setError(err?.message || 'Error al iniciar reconocimiento web');
          setIsListening(false);
        }
      }
    }
  }, []);

  const stopListening = useCallback((): string => {
    shouldListenRef.current = false;
    if (Platform.OS !== 'web') {
      try {
        ExpoSpeechRecognitionModule?.stop();
      } catch (e) {
        console.warn('Error al detener ExpoSpeechRecognitionModule:', e);
      }
    } else {
      try {
        webRecognitionRef.current?.stop();
      } catch {
        // ignore
      }
      webRecognitionRef.current = null;
    }
    setIsListening(false);
    return transcriptRef.current;
  }, []);

  const cancelListening = useCallback(() => {
    shouldListenRef.current = false;
    finalizedSegmentsRef.current = [];
    currentInterimRef.current = '';
    if (Platform.OS !== 'web') {
      try {
        ExpoSpeechRecognitionModule?.abort();
      } catch (e) {
        console.warn('Error al abortar ExpoSpeechRecognitionModule:', e);
      }
    } else {
      try {
        webRecognitionRef.current?.abort();
      } catch {
        // ignore
      }
      webRecognitionRef.current = null;
    }
    setIsListening(false);
    setTranscript('');
    transcriptRef.current = '';
    setError(null);
  }, []);

  const updateTranscriptManually = useCallback((text: string) => {
    setTranscript(text);
    transcriptRef.current = text;
    finalizedSegmentsRef.current = text ? [text] : [];
    currentInterimRef.current = '';
  }, []);

  return {
    isListening,
    transcript,
    error,
    isSupported: !!ExpoSpeechRecognitionModule || Platform.OS === 'web',
    isExpoGo: !ExpoSpeechRecognitionModule && Platform.OS !== 'web',
    isWebSpeech: Platform.OS === 'web',
    isNativeModule: !!ExpoSpeechRecognitionModule && Platform.OS !== 'web',
    startListening,
    stopListening,
    cancelListening,
    setTranscript: updateTranscriptManually,
  };
}
