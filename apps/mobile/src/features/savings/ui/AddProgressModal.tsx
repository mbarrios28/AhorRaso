import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { SavingsGoalWithSimulation } from '../domain/types';
import { savingsRepository } from '../data/savings.repository';

export interface AddProgressModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (updatedGoal: SavingsGoalWithSimulation) => void;
  goal: SavingsGoalWithSimulation | null;
  userId?: string;
}

const QUICK_AMOUNTS = [10, 20, 50, 100];

export const AddProgressModal: React.FC<AddProgressModalProps> = ({
  visible,
  onClose,
  onSaved,
  goal,
  userId = DEV_USER_ID,
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!goal) return null;

  const handleClose = () => {
    setAmountStr('');
    setError(null);
    setSaving(false);
    onClose();
  };

  const handleQuickAdd = (val: number) => {
    const current = parseFloat(amountStr.replace(',', '.')) || 0;
    setAmountStr((current + val).toFixed(2));
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    const amountVal = parseFloat(amountStr.replace(',', '.'));
    const amountCents = isNaN(amountVal) || amountVal <= 0 ? 0 : Math.round(amountVal * 100);

    if (amountCents <= 0) {
      setError('Por favor ingresa un monto mayor a S/ 0.');
      return;
    }

    try {
      setSaving(true);
      const updated = savingsRepository.updateProgress(userId, goal.id, {
        addAmountCents: amountCents,
      });

      onSaved(updated);
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el abono.');
    } finally {
      setSaving(false);
    }
  };

  const currentSol = (goal.currentAmountCents / 100).toFixed(2);
  const targetSol = (goal.targetAmountCents / 100).toFixed(2);

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
                <Icon name="PlusCircle" size={20} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>Abonar a la Meta</Text>
            </View>
            <Pressable hitSlop={8} onPress={handleClose} style={styles.closeBtn}>
              <Icon name="X" size={18} color={colors.ink2} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <Text style={styles.goalTargetName}>{goal.name}</Text>
            <Text style={styles.goalCurrentStatus}>
              Ahorrado actual: S/ {currentSol} de S/ {targetSol}
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Icon name="AlertCircle" size={15} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Input del Monto */}
            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>S/</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.ink3}
                value={amountStr}
                onChangeText={(t) => {
                  setAmountStr(t);
                  setError(null);
                }}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            {/* Botones de sugerencia rápida */}
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((q) => (
                <Pressable
                  key={q}
                  style={styles.quickChip}
                  onPress={() => handleQuickAdd(q)}
                >
                  <Text style={styles.quickChipText}>+S/ {q}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Registrando...' : 'Confirmar Abono'}</Text>
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
    maxWidth: 420,
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
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  goalTargetName: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  goalCurrentStatus: {
    ...typography.bodySmall,
    color: colors.ink2,
    marginBottom: spacing.xs,
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
  },
  errorText: {
    ...typography.bodyMedium,
    color: colors.danger,
    flex: 1,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  currencyPrefix: {
    ...typography.amountLarge,
    color: colors.ink3,
    marginRight: spacing.xs,
  },
  amountInput: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.amountLarge,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  quickChip: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  quickChipText: {
    ...typography.bodySmall,
    color: colors.ink,
    fontWeight: '600',
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
