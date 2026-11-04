import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { SavingsFrequency, SavingsGoalWithSimulation } from '../domain/types';
import { calculateSavingsSimulation, formatSimulationPeriodLabel } from '../domain/simulation';
import { savingsRepository } from '../data/savings.repository';

export interface CreateGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (goal: SavingsGoalWithSimulation) => void;
  userId?: string;
}

const FREQUENCY_OPTIONS: { label: string; value: SavingsFrequency; desc: string }[] = [
  { label: 'Semanal', value: 'weekly', desc: 'Cada 7 días' },
  { label: 'Quincenal', value: 'biweekly', desc: 'Cada 14 días' },
  { label: 'Mensual', value: 'monthly', desc: 'Cada mes' },
];

export const CreateGoalModal: React.FC<CreateGoalModalProps> = ({
  visible,
  onClose,
  onSaved,
  userId = DEV_USER_ID,
}) => {
  const [name, setName] = useState('');
  const [targetAmountStr, setTargetAmountStr] = useState('');
  const [currentAmountStr, setCurrentAmountStr] = useState('');
  const [periodicSavingsStr, setPeriodicSavingsStr] = useState('');
  const [frequency, setFrequency] = useState<SavingsFrequency>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setTargetAmountStr('');
    setCurrentAmountStr('');
    setPeriodicSavingsStr('');
    setFrequency('monthly');
    setError(null);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Conversión reactiva a céntimos enteros
  const targetCents = useMemo(() => {
    const val = parseFloat(targetAmountStr.replace(',', '.'));
    return isNaN(val) || val <= 0 ? 0 : Math.round(val * 100);
  }, [targetAmountStr]);

  const currentCents = useMemo(() => {
    const val = parseFloat(currentAmountStr.replace(',', '.'));
    return isNaN(val) || val < 0 ? 0 : Math.round(val * 100);
  }, [currentAmountStr]);

  const periodicCents = useMemo(() => {
    const val = parseFloat(periodicSavingsStr.replace(',', '.'));
    return isNaN(val) || val <= 0 ? 0 : Math.round(val * 100);
  }, [periodicSavingsStr]);

  // Simulación en tiempo real (RF-014)
  const simulation = useMemo(() => {
    if (targetCents <= 0 || periodicCents <= 0) {
      return null;
    }
    return calculateSavingsSimulation({
      targetAmountCents: targetCents,
      currentAmountCents: currentCents,
      periodicSavingsCents: periodicCents,
      frequency,
    });
  }, [targetCents, currentCents, periodicCents, frequency]);

  const handleSubmit = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Por favor ingresa un nombre para la meta.');
      return;
    }

    if (targetCents <= 0) {
      setError('El monto objetivo debe ser mayor a S/ 0.');
      return;
    }

    if (periodicCents <= 0) {
      setError('El ahorro periódico debe ser mayor a S/ 0.');
      return;
    }

    try {
      setSaving(true);
      const created = savingsRepository.create(userId, {
        name: name.trim(),
        targetAmountCents: targetCents,
        currentAmountCents: currentCents,
        periodicSavingsCents: periodicCents,
        frequency,
      });

      onSaved(created);
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la meta de ahorro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <View style={styles.modalIconBox}>
                <Icon name="Target" size={20} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>Nueva Meta de Ahorro</Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityLabel="Cerrar modal"
            >
              <Icon name="X" size={18} color={colors.ink2} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Mensaje de Error */}
            {error && (
              <View style={styles.errorBox}>
                <Icon name="AlertCircle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Nombre de la Meta */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nombre de la meta *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej: Fondo de emergencia, Viaje, Laptop..."
                placeholderTextColor={colors.ink3}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError(null);
                }}
                maxLength={60}
              />
            </View>

            {/* Monto Objetivo */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Monto objetivo *</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>S/</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  value={targetAmountStr}
                  onChangeText={(t) => {
                    setTargetAmountStr(t);
                    setError(null);
                  }}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Ahorro Inicial Opcional */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Ahorro inicial ya acumulado (opcional)</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>S/</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  value={currentAmountStr}
                  onChangeText={setCurrentAmountStr}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Frecuencia de Ahorro */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Frecuencia de ahorro *</Text>
              <View style={styles.frequencyRow}>
                {FREQUENCY_OPTIONS.map((opt) => {
                  const selected = frequency === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.freqOption, selected && styles.freqOptionSelected]}
                      onPress={() => setFrequency(opt.value)}
                    >
                      <Text
                        style={[
                          styles.freqOptionLabel,
                          selected && styles.freqOptionLabelSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.freqOptionDesc}>{opt.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Cuota de Ahorro Periódico */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Cuota a ahorrar por periodo *</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>S/</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  value={periodicSavingsStr}
                  onChangeText={(t) => {
                    setPeriodicSavingsStr(t);
                    setError(null);
                  }}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Tarjeta de Simulación en Tiempo Real (RF-014) */}
            <View style={styles.simulationContainer}>
              <View style={styles.simulationHeader}>
                <Icon name="Sparkles" size={16} color={colors.secondary} />
                <Text style={styles.simulationTitle}>Simulación de Proyección (RF-014)</Text>
              </View>

              {simulation ? (
                <View style={styles.simulationBody}>
                  <View style={styles.simMetricsRow}>
                    <View style={styles.simMetricItem}>
                      <Text style={styles.simMetricLabel}>Tiempo estimado</Text>
                      <Text style={styles.simMetricValue}>
                        {formatSimulationPeriodLabel(simulation.periodsNeeded, frequency)}
                      </Text>
                    </View>
                    <View style={styles.simMetricDivider} />
                    <View style={styles.simMetricItem}>
                      <Text style={styles.simMetricLabel}>Fecha estimada</Text>
                      <Text style={styles.simMetricValue}>{simulation.estimatedDate}</Text>
                    </View>
                    <View style={styles.simMetricDivider} />
                    <View style={styles.simMetricItem}>
                      <Text style={styles.simMetricLabel}>Cuotas</Text>
                      <Text style={styles.simMetricValue}>{simulation.periodsNeeded}</Text>
                    </View>
                  </View>

                  <Text style={styles.simulationSummary}>
                    Ahorrando S/ {(periodicCents / 100).toFixed(2)} cada periodo, alcanzarás tu meta
                    de S/ {(targetCents / 100).toFixed(2)} aproximadamente el{' '}
                    <Text style={{ color: colors.ink, fontWeight: '700' }}>
                      {simulation.estimatedDate}
                    </Text>
                    .
                  </Text>
                </View>
              ) : (
                <Text style={styles.simulationPlaceholder}>
                  Ingresa el monto objetivo y la cuota de ahorro para calcular tu fecha estimada en
                  tiempo real.
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Botones de Acción */}
          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Crear Meta'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.titleMedium,
    color: colors.ink,
  },
  closeBtn: {
    padding: 6,
  },
  formScroll: {
    padding: spacing.base,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodyMedium,
    color: colors.danger,
    flex: 1,
  },
  fieldGroup: {
    marginBottom: spacing.md,
    gap: 6,
  },
  fieldLabel: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  textInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodyLarge,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  currencyPrefix: {
    ...typography.amountLarge,
    color: colors.ink3,
    marginRight: spacing.xs,
  },
  amountInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    ...typography.amountLarge,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  freqOption: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  freqOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(14, 163, 113, 0.12)',
  },
  freqOptionLabel: {
    ...typography.titleSmall,
    color: colors.ink2,
  },
  freqOptionLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  freqOptionDesc: {
    ...typography.monoSmall,
    color: colors.ink3,
    marginTop: 2,
  },
  simulationContainer: {
    marginTop: spacing.xs,
    marginBottom: spacing.base,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  simulationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  simulationTitle: {
    ...typography.labelSmall,
    color: colors.secondary,
    fontWeight: '700',
  },
  simulationBody: {
    gap: spacing.sm,
  },
  simMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface3,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  simMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  simMetricLabel: {
    ...typography.monoSmall,
    color: colors.ink3,
    marginBottom: 2,
  },
  simMetricValue: {
    ...typography.titleSmall,
    color: colors.ink,
    fontWeight: '700',
  },
  simMetricDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.line,
  },
  simulationSummary: {
    ...typography.bodySmall,
    color: colors.ink2,
    lineHeight: 18,
  },
  simulationPlaceholder: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontStyle: 'italic',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelBtnText: {
    ...typography.bodyMedium,
    color: colors.ink2,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  saveBtnText: {
    ...typography.titleSmall,
    color: '#0D0D0F',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
