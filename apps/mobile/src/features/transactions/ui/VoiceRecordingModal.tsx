import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { useVoiceRecognition } from '../domain/useVoiceRecognition';

interface VoiceRecordingModalProps {
  visible: boolean;
  onClose: () => void;
  onProcessTranscript: (transcript: string) => void;
}

export const VoiceRecordingModal: React.FC<VoiceRecordingModalProps> = ({
  visible,
  onClose,
  onProcessTranscript,
}) => {
  const {
    isListening,
    transcript,
    error,
    isExpoGo,
    startListening,
    stopListening,
    cancelListening,
    setTranscript,
  } = useVoiceRecognition();

  const inputRef = useRef<TextInput>(null);

  // Animaciones para las barras de onda de voz
  const waveAnim1 = useRef(new Animated.Value(6)).current;
  const waveAnim2 = useRef(new Animated.Value(6)).current;
  const waveAnim3 = useRef(new Animated.Value(6)).current;
  const waveAnim4 = useRef(new Animated.Value(6)).current;
  const waveAnim5 = useRef(new Animated.Value(6)).current;
  const waveAnim6 = useRef(new Animated.Value(6)).current;

  // Iniciar reconocimiento al abrir el modal
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;

    if (visible) {
      startListening();

      // Animación de barras ondulantes continuas
      const createBarAnim = (anim: Animated.Value, minH: number, maxH: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: maxH,
              duration,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: minH,
              duration,
              useNativeDriver: false,
            }),
          ])
        );
      };

      const anims = [
        createBarAnim(waveAnim1, 6, 26, 450),
        createBarAnim(waveAnim2, 8, 30, 350),
        createBarAnim(waveAnim3, 4, 34, 550),
        createBarAnim(waveAnim4, 6, 28, 400),
        createBarAnim(waveAnim5, 5, 32, 500),
        createBarAnim(waveAnim6, 7, 24, 380),
      ];

      animLoop = Animated.parallel(anims);
      animLoop.start();
    } else {
      cancelListening();
    }

    return () => {
      animLoop?.stop();
    };
  }, [visible, startListening, cancelListening, waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5, waveAnim6]);

  const handleFinish = () => {
    const finalTranscript = stopListening() || transcript;
    onClose();
    if (finalTranscript.trim()) {
      onProcessTranscript(finalTranscript.trim());
    }
  };

  const handleCancel = () => {
    cancelListening();
    onClose();
  };

  const handleQuickPreset = (presetText: string) => {
    setTranscript(presetText);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.handsFreeBadge}>
              <Icon name="Mic" size={14} color={colors.primary} />
              <Text style={styles.handsFreeText}>
                {isExpoGo ? 'DICTADO POR VOZ' : 'MODO MANOS LIBRES ACTIVO'}
              </Text>
            </View>
            <Pressable
              onPress={handleCancel}
              style={styles.closeBtn}
              accessibilityLabel="Cerrar modal de voz"
            >
              <Icon name="X" size={18} color={colors.ink3} />
            </Pressable>
          </View>

          {/* Animación de Ondas Sonoras */}
          <View style={styles.waveformContainer}>
            <Animated.View style={[styles.waveBar, { height: waveAnim1 }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim2 }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim3 }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim4 }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim5 }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim6 }]} />
          </View>

          {/* Caja Interactiva de Transcripción y Dictado */}
          <View style={styles.liveTranscriptBox}>
            <View style={styles.transcriptHeaderRow}>
              <Text style={styles.liveTranscriptLabel}>
                {transcript.trim() ? 'TRANSCRIPCIÓN DETECTADA' : 'TRANSCRIPCIÓN / DICTADO'}
              </Text>
              {transcript.trim().length > 0 && (
                <Pressable onPress={() => setTranscript('')} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>Borrar</Text>
                </Pressable>
              )}
            </View>

            <TextInput
              ref={inputRef}
              value={transcript}
              onChangeText={setTranscript}
              placeholder={
                isExpoGo
                  ? 'Toca aquí y presiona el micro del teclado para hablar...'
                  : 'Escuchando... Di tus gastos con confianza.'
              }
              placeholderTextColor={colors.ink3}
              multiline
              style={styles.liveTranscriptInput}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          {/* Indicación de Expo Go / Teclado */}
          {isExpoGo && (
            <View style={styles.expoGoNotice}>
              <Icon name="Sparkles" size={15} color={colors.primary} />
              <Text style={styles.expoGoNoticeText}>
                Toca el cuadro de texto y usa el{' '}
                <Text style={{ fontWeight: '700', color: colors.ink }}>
                  icono de micrófono de tu teclado
                </Text>{' '}
                (Gboard / Siri) para dictar.
              </Text>
            </View>
          )}

          {/* Presets rápidos para probar en 1 toque */}
          <View style={styles.presetsSection}>
            <Text style={styles.presetsLabel}>O PRUEBA CON UN EJEMPLO EN 1 TOQUE:</Text>
            <View style={styles.presetsRow}>
              <Pressable
                onPress={() => handleQuickPreset('Menú 15 soles y taxi 5 soles')}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>Multi-gasto: Menú 15 y taxi 5</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  handleQuickPreset(
                    'Compré una galleta de 2 soles, ah no espera son 3 soles en el chino'
                  )
                }
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>Corrección: ah no espera...</Text>
              </Pressable>
              <Pressable
                onPress={() => handleQuickPreset('Dos lucas y media en fotocopias')}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>Jerga: Dos lucas y media</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  handleQuickPreset('Almuerzo 12 soles por yape en don pepe')
                }
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>Comercio yape: Don Pepe</Text>
              </Pressable>
            </View>
          </View>

          {/* Botones de acción */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleCancel}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancelar dictado"
            >
              <Icon name="Trash2" size={16} color={colors.ink2} />
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              onPress={handleFinish}
              style={[
                styles.finishBtn,
                !transcript.trim() && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Organizar compras dictadas"
            >
              <Icon name="Check" size={18} color="#0D0D0F" />
              <Text style={styles.finishBtnText}>Listo, organizar</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 13, 15, 0.88)',
    justifyContent: 'flex-end',
    padding: spacing.base,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.base,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#2A2A2F',
    padding: spacing.base * 1.25,
    gap: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  handsFreeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  handsFreeText: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#26262B',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    marginVertical: spacing.xxs,
  },
  waveBar: {
    width: 5,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  liveTranscriptBox: {
    minHeight: 80,
    padding: spacing.base,
    borderRadius: 14,
    backgroundColor: 'rgba(31, 31, 35, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 47, 0.7)',
    justifyContent: 'flex-start',
  },
  transcriptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  liveTranscriptLabel: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 9.5,
    color: colors.ink3,
    letterSpacing: 1,
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  clearBtnText: {
    ...typography.bodySmall,
    fontSize: 10.5,
    color: colors.primary,
  },
  liveTranscriptInput: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontSize: 13.5,
    lineHeight: 18,
    padding: 0,
    minHeight: 46,
    textAlignVertical: 'top',
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontSize: 11,
    marginTop: 4,
  },
  expoGoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  expoGoNoticeText: {
    ...typography.bodySmall,
    color: colors.ink2,
    fontSize: 11.5,
    flex: 1,
    lineHeight: 15,
  },
  presetsSection: {
    gap: 6,
  },
  presetsLabel: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 9.5,
    color: colors.ink3,
    letterSpacing: 0.8,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: '#26262B',
    borderWidth: 1,
    borderColor: '#323238',
  },
  presetChipText: {
    ...typography.bodySmall,
    fontSize: 10.5,
    color: colors.ink2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1F1F23',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  cancelBtnText: {
    ...typography.bodyMedium,
    color: colors.ink2,
    fontWeight: '600',
    fontSize: 13,
  },
  finishBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  finishBtnText: {
    ...typography.bodyMedium,
    color: '#0D0D0F',
    fontWeight: '700',
    fontSize: 13,
  },
});
