import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { Category, CategorySelector } from '@/features/categories';
import { transactionsRepository } from '../data/transactions.repository';
import { Transaction } from '../domain/types';

interface EditTransactionCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  /** Transacción cuya categoría se desea cambiar (RF-004). */
  transaction: Transaction | null;
  /** Se invoca con la transacción actualizada tras guardar. */
  onSaved?: (transaction: Transaction) => void;
  userId?: string;
}

/**
 * Modal para cambiar la categoría de un movimiento existente (RF-004).
 *
 * Reutiliza `CategorySelector` (filtra por el tipo del movimiento) y delega la
 * validación de integridad al repositorio de transacciones, que verifica que
 * la categoría exista, pertenezca al usuario y sea compatible con el tipo.
 */
export const EditTransactionCategoryModal: React.FC<EditTransactionCategoryModalProps> = ({
  visible,
  onClose,
  transaction,
  onSaved,
  userId = DEV_USER_ID,
}) => {
  // El formulario solo se monta con el modal visible y una transacción
  // definida: cada apertura lo remonta con estado inicial fresco (sin
  // categoría preseleccionada) y no requiere efectos de reset.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible && transaction ? (
        <EditTransactionCategoryForm
          transaction={transaction}
          onClose={onClose}
          onSaved={onSaved}
          userId={userId}
        />
      ) : null}
    </Modal>
  );
};

interface EditTransactionCategoryFormProps
  extends Omit<EditTransactionCategoryModalProps, 'visible' | 'transaction'> {
  transaction: Transaction;
}

const EditTransactionCategoryForm: React.FC<EditTransactionCategoryFormProps> = ({
  transaction,
  onClose,
  onSaved,
  userId = DEV_USER_ID,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (!selectedCategory) {
      setErrorMsg('Debes seleccionar una categoría');
      return;
    }

    setSaving(true);
    try {
      const updated = transactionsRepository.updateCategory(
        userId,
        transaction.id,
        selectedCategory.id
      );
      setErrorMsg(null);
      onSaved?.(updated);
      onClose();
    } catch (e) {
      // Los mensajes del dominio ya son comprensibles (CategoryError) o
      // provienen del repositorio con texto legible.
      setErrorMsg(e instanceof Error && e.message ? e.message : 'Error al actualizar la categoría');
    } finally {
      setSaving(false);
    }
  };

  const amount = (transaction.amountCents / 100).toFixed(2);
  const isIncome = transaction.type === 'income';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.overlay}
    >
      <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Cambiar categoría</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="X" size={20} color={colors.ink2} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Resumen del movimiento */}
            <View style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { borderColor: colors.line }]}>
                <Icon name={isIncome ? 'ArrowLeft' : 'ReceiptText'} size={18} color={colors.ink2} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryAmount}>
                  {isIncome ? '+' : '-'} S/ {amount}
                </Text>
                <Text style={styles.summaryMeta}>
                  {transaction.occurredOn}
                  {transaction.note ? ` · ${transaction.note}` : ''}
                </Text>
              </View>
            </View>

            {/* Selector reutilizado */}
            <View>
              <Text style={styles.sectionLabel}>
                CATEGORÍA DE {isIncome ? 'INGRESO' : 'GASTO'}
              </Text>
              <CategorySelector
                selectedId={selectedCategory?.id ?? transaction.categoryId}
                onSelect={(cat) => {
                  setSelectedCategory(cat);
                  setErrorMsg(null);
                }}
                type={transaction.type}
                userId={userId}
                showManageLink={false}
              />
            </View>

            {/* Error visual */}
            {errorMsg && (
              <View style={styles.errorContainer}>
                <Icon name="AlertCircle" size={16} color={colors.danger} />
                <Text style={styles.errorMessage}>{errorMsg}</Text>
              </View>
            )}
          </ScrollView>

          {/* CTA */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                saving && { opacity: 0.6 },
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
            </Pressable>
          </View>
        </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderColor: colors.line,
    borderTopWidth: 1,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryAmount: {
    ...typography.monoMedium,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryMeta: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  sectionLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
    marginBottom: spacing.xs,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: colors.danger,
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  errorMessage: {
    ...typography.bodySmall,
    color: colors.danger,
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  saveBtn: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
  },
});
