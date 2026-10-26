import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

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

  const webRecognitionRef = useRef<any>(null);

  // ==========================================
  // EVENTOS OFICIALES DE EXPO-SPEECH-RECOGNITION
  // ==========================================
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event: any) => {
    const text = event.results?.[0]?.transcript;
    if (text) {
      setTranscript(text);
      transcriptRef.current = text;
    }
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    console.warn('SpeechRecognition error event:', event.error, event.message);
    if (event.error !== 'no-speech') {
      setError(event.message || `Error de reconocimiento (${event.error})`);
    }
    setIsListening(false);
  });

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    transcriptRef.current = '';

    // 1. Android / iOS Nativo
    if (Platform.OS !== 'web') {
      try {
        const micPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!micPermission.granted) {
          setError('Permiso de micrófono o reconocimiento de voz denegado.');
          setIsListening(false);
          return;
        }

        // Iniciar reconocimiento de voz en Español (Perú)
        ExpoSpeechRecognitionModule.start({
          lang: 'es-PE',
          interimResults: true,
          continuous: true,
        });
        setIsListening(true);
      } catch (e: any) {
        console.error('Error al iniciar ExpoSpeechRecognitionModule:', e);
        setError(e?.message || 'No se pudo iniciar el reconocimiento nativo');
        setIsListening(false);
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
    if (Platform.OS !== 'web') {
      try {
        ExpoSpeechRecognitionModule.stop();
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
    if (Platform.OS !== 'web') {
      try {
        ExpoSpeechRecognitionModule.abort();
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

  return {
    isListening,
    transcript,
    error,
    isSupported: true,
    isExpoGo: false,
    isWebSpeech: Platform.OS === 'web',
    isNativeModule: Platform.OS !== 'web',
    startListening,
    stopListening,
    cancelListening,
    setTranscript,
  };
}
