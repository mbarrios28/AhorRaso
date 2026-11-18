import React, { useEffect, useRef, useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { SpeechAlternative } from '../domain/types';
import { useVoiceRecognition } from '../domain/useVoiceRecognition';

interface VoiceRecordingModalProps {
  visible: boolean;
  mode?: 'expense' | 'income';
  contextualHints?: string[];
  onClose: () => void;
  onProcessTranscript: (transcript: string, alternatives?: SpeechAlternative[]) => void;
}

const BAR_FACTORS = [0.55, 0.85, 1.0, 0.9, 0.72, 0.48];

export const VoiceRecordingModal: React.FC<VoiceRecordingModalProps> = ({
  visible,
  mode = 'expense',
  contextualHints,
  onClose,
  onProcessTranscript,
}) => {
  const [isOrganizing, setIsOrganizing] = useState(false);
  const mountedRef = useRef(true);

  const {
    isListening,
    transcript,
    audioLevel,
    isOnDevice,
    error,
    isExpoGo,
    startListening,
    stopListeningAsync,
    cancelListening,
    setTranscript,
  } = useVoiceRecognition({ contextualHints });

  const inputRef = useRef<TextInput>(null);

  const [waveAnims] = useState(() => BAR_FACTORS.map(() => new Animated.Value(6)));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Iniciar / detener escucha cuando se abre o cierra el modal
  useEffect(() => {
    if (visible) {
      startListening();
    } else {
      cancelListening();
    }
  }, [visible, startListening, cancelListening]);

  // Animar barras de forma reactiva con el nivel real del micrófono (`volumechange`)
  // o un pulso suave cuando está escuchando sin señal de volumen (Web / silencio)
  useEffect(() => {
    if (!visible) return;

    if (isListening && audioLevel > 0.03) {
      const animations = waveAnims.map((anim, idx) => {
        const target = Math.min(36, 6 + audioLevel * 30 * BAR_FACTORS[idx]);
        return Animated.timing(anim, {
          toValue: target,
          duration: 90,
          useNativeDriver: false,
        });
      });
      const batch = Animated.parallel(animations);
      batch.start();
      return () => batch.stop();
    }

    if (isListening) {
      const idleLoop = Animated.parallel(
        waveAnims.map((anim, idx) =>
          Animated.loop(
            Animated.sequence([
              Animated.timing(anim, {
                toValue: 9 + (idx % 3) * 2,
                duration: 420 + idx * 55,
                useNativeDriver: false,
              }),
              Animated.timing(anim, {
                toValue: 6,
                duration: 420 + idx * 55,
                useNativeDriver: false,
              }),
            ])
          )
        )
      );
      idleLoop.start();
      return () => idleLoop.stop();
    }

    const settle = Animated.parallel(
      waveAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 6,
          duration: 150,
          useNativeDriver: false,
        })
      )
    );
    settle.start();
    return () => settle.stop();
  }, [visible, isListening, audioLevel, waveAnims]);

  const handleFinish = async () => {
    if (isOrganizing) return;
    setIsOrganizing(true);

    try {
      const finalResult = await stopListeningAsync();
      if (!mountedRef.current) return;

      setIsOrganizing(false);
      onClose();

      const finalTranscript = (finalResult.transcript || transcript).trim();
      if (finalTranscript) {
        onProcessTranscript(finalTranscript, finalResult.alternatives);
      }
    } catch {
      if (!mountedRef.current) return;
      setIsOrganizing(false);
      onClose();
      if (transcript.trim()) {
        onProcessTranscript(transcript.trim());
      }
    }
  };

  const handleCancel = () => {
    setIsOrganizing(false);
    cancelListening();
    onClose();
  };

  const handleQuickPreset = (presetText: string) => {
    setTranscript(presetText);
  };

  const isIncomeMode = mode === 'income';
  const badgeLabel = isExpoGo
    ? 'DICTADO POR VOZ'
    : isOnDevice
    ? 'MANOS LIBRES · 100% OFFLINE'
    : 'MODO MANOS LIBRES ACTIVO';

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
              <Text style={styles.handsFreeText}>{badgeLabel}</Text>
            </View>
            <Pressable
              onPress={handleCancel}
              style={styles.closeBtn}
              accessibilityLabel="Cerrar modal de voz"
            >
              <Icon name="X" size={18} color={colors.ink3} />
            </Pressable>
          </View>

          {/* Animación de Ondas Sonoras reactiva al micrófono */}
          <View style={styles.waveformContainer}>
            {waveAnims.map((anim, idx) => (
              <Animated.View key={idx} style={[styles.waveBar, { height: anim }]} />
            ))}
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
                  : isIncomeMode
                  ? 'Escuchando... Di tu ingreso con confianza.'
                  : 'Escuchando... Di tus gastos con confianza.'
              }
              placeholderTextColor={colors.ink3}
              multiline
              style={styles.liveTranscriptInput}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          {/* Píldora de Patrón Sugerido para Mayor Precisión */}
          <View style={styles.patternNotice}>
            <View style={styles.patternHeader}>
              <Icon name="Compass" size={13} color={colors.primary} />
              <Text style={styles.patternNoticeLabel}>PATRÓN SUGERIDO PARA MAYOR PRECISIÓN:</Text>
            </View>
            {isIncomeMode ? (
              <>
                <Text style={styles.patternNoticeFormula}>
                  [Acción] [Monto] <Text style={styles.patternDim}>de</Text> [Fuente o Categoría]
                </Text>
                <Text style={styles.patternNoticeExample}>
                  {'Ej: "Hoy recibí 500 soles de sueldo de la empresa"'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.patternNoticeFormula}>
                  [Monto] <Text style={styles.patternDim}>en</Text> [Qué]{' '}
                  <Text style={styles.patternDim}>en</Text> [Dónde]{' '}
                  <Text style={styles.patternDim}>por</Text> [Pago]
                </Text>
                <Text style={styles.patternNoticeExample}>
                  {'Ej: "15 soles en almuerzo en Tambo por yape"'}
                </Text>
              </>
            )}
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
            {isIncomeMode ? (
              <View style={styles.presetsRow}>
                <Pressable
                  onPress={() => handleQuickPreset('Hoy recibí 500 soles de sueldo')}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>Sueldo: Recibí 500 soles de sueldo</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleQuickPreset('Me yapeó mi mamá 50 soles de propina')}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>Propina: Me yapeó mi mamá 50 soles</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleQuickPreset('Cobré 120 soles por trabajo freelance de diseño')}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>Freelance: 120 soles diseño</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    handleQuickPreset('Ayer vendí 80 soles de postres, ah no espera, 95 soles')
                  }
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>Corrección: vendí 80, ah no espera 95</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.presetsRow}>
                <Pressable
                  onPress={() => handleQuickPreset('15 soles en almuerzo en Tambo por yape')}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>
                    Patrón ideal: 15 soles almuerzo Tambo yape
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleQuickPreset('Menú 15 soles y taxi 5 soles')}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>Multi-gasto: Menú 15 y taxi 5</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleQuickPreset('Dos lucas y media en fotocopias al contado')}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>
                    Jerga + efectivo: Dos lucas y media al contado
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    handleQuickPreset(
                      'Compré una galleta de 2 soles, ah no espera son 3 soles en Don Pepe'
                    )
                  }
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>
                    Corrección: ah no espera son 3 en Don Pepe
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Botones de acción */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleCancel}
              disabled={isOrganizing}
              style={[styles.cancelBtn, isOrganizing && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Cancelar dictado"
            >
              <Icon name="Trash2" size={16} color={colors.ink2} />
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              onPress={handleFinish}
              disabled={isOrganizing || !transcript.trim()}
              style={[
                styles.finishBtn,
                (!transcript.trim() || isOrganizing) && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                isIncomeMode ? 'Completar ingreso dictado' : 'Organizar compras dictadas'
              }
            >
              {isOrganizing ? (
                <>
                  <ActivityIndicator size="small" color="#0D0D0F" />
                  <Text style={styles.finishBtnText}>
                    {isIncomeMode ? 'Procesando ingreso...' : 'Organizando gastos...'}
                  </Text>
                </>
              ) : (
                <>
                  <Icon name="Check" size={18} color="#0D0D0F" />
                  <Text style={styles.finishBtnText}>
                    {isIncomeMode ? 'Listo, completar' : 'Listo, organizar'}
                  </Text>
                </>
              )}
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
  patternNotice: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(57, 229, 137, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(57, 229, 137, 0.22)',
    gap: 3,
  },
  patternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  patternNoticeLabel: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    color: colors.primary,
    letterSpacing: 0.6,
  },
  patternNoticeFormula: {
    ...typography.labelSmall,
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: '700',
  },
  patternDim: {
    color: colors.ink3,
    fontWeight: '400',
  },
  patternNoticeExample: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink2,
    fontStyle: 'italic',
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
