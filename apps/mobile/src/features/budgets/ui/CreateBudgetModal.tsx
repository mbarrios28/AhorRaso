import React, { useState, useEffect } from 'react';
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
import { router } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { categoriesRepository } from '@/features/categories/data/categories.repository';
import { Category } from '@/core/db';
import { budgetsRepository } from '../data/budgets.repository';
import {
  BudgetPeriod,
  calculatePeriodRange,
  Budget,
} from '../domain/types';
import { BudgetError } from '../domain/errors';

interface CreateBudgetModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (budget: Budget) => void;
  userId?: string;
}

const PERIOD_OPTIONS: { label: string; value: BudgetPeriod; description: string }[] = [
  { label: 'Semanal', value: 'weekly', description: 'Lunes a Domingo' },
  { label: 'Quincenal', value: 'biweekly', description: '15 días calendario' },
  { label: 'Mensual', value: 'monthly', description: 'Mes calendario' },
];

export const CreateBudgetModal: React.FC<CreateBudgetModalProps> = ({
  visible,
  onClose,
  onSaved,
  userId = DEV_USER_ID,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {visible ? (
        <CreateBudgetForm
          onClose={onClose}
          onSaved={onSaved}
          userId={userId}
        />
      ) : null}
    </Modal>
  );
};

interface CreateBudgetFormProps {
  onClose: () => void;
  onSaved: (budget: Budget) => void;
  userId: string;
}

const CreateBudgetForm: React.FC<CreateBudgetFormProps> = ({
  onClose,
  onSaved,
  userId,
}) => {
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [periodType, setPeriodType] = useState<BudgetPeriod>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cargar categorías de gasto
  useEffect(() => {
    try {
      const cats = categoriesRepository.getByUser(userId, 'expense');
      setCategoriesList(cats);
      if (cats.length > 0) {
        setSelectedCategoryId(cats[0].id);
      }
    } catch (e) {
      console.error('Error al cargar categorías para presupuesto:', e);
    }
  }, [userId]);

  const periodRange = calculatePeriodRange(periodType);

  const selectedCategory = categoriesList.find((c) => c.id === selectedCategoryId);

  const handleSave = () => {
    setError(null);

    // Validación previa de campo
    const cleanedAmount = amountStr.replace(',', '.').trim();
    const parsedAmount = parseFloat(cleanedAmount);

    if (!cleanedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido mayor a 0 (ej. 150.00)');
      return;
    }

    if (!selectedCategoryId) {
      setError('Debes seleccionar una categoría de gasto');
      return;
    }

    const amountCents = Math.round(parsedAmount * 100);

    setSaving(true);
    try {
      const created = budgetsRepository.create(userId, {
        categoryId: selectedCategoryId,
        amountCents,
        periodType,
        periodStart: periodRange.periodStart,
        periodEnd: periodRange.periodEnd,
      });

      onSaved(created);
      onClose();
    } catch (err: any) {
      if (err instanceof BudgetError) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado al guardar el presupuesto');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNavigateToCategories = () => {
    onClose();
    router.push('/categories');
  };

  const isEmptyCategories = categoriesList.length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.overlay}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Cabecera */}
        <View style={styles.header}>
          <Text style={styles.title}>Establecer Presupuesto</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar modal"
            hitSlop={12}
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Icon name="X" size={20} color={colors.ink3} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isEmptyCategories ? (
            /* Empty State: no hay categorías de gasto */
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Icon name="Tag" size={32} color={colors.ink3} />
              </View>
              <Text style={styles.emptyTitle}>No tienes categorías de gasto</Text>
              <Text style={styles.emptyDescription}>
                Para definir un presupuesto, primero debes contar con al menos una categoría de gasto registrada.
              </Text>
              <Pressable
                style={styles.createCatBtn}
                onPress={handleNavigateToCategories}
              >
                <Icon name="Plus" size={16} color="#0D0D0F" />
                <Text style={styles.createCatBtnText}>Crear Categoría</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Selección de Categoría */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CATEGORÍA DE GASTO</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoriesScroll}
                >
                  {categoriesList.map((cat) => {
                    const isSelected = cat.id === selectedCategoryId;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          setSelectedCategoryId(cat.id);
                          setError(null);
                        }}
                        style={[
                          styles.categoryChip,
                          isSelected && {
                            borderColor: cat.color,
                            backgroundColor: colors.surface2,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.catIconBox,
                            {
                              backgroundColor: isSelected ? cat.color : colors.surface,
                              borderColor: colors.line,
                            },
                          ]}
                        >
                          <Icon
                            name={cat.icon}
                            size={16}
                            color={isSelected ? '#FFFFFF' : cat.color}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryChipText,
                            isSelected && { color: colors.ink, fontWeight: '700' },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Selección de Periodo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PERIODO DE PRESUPUESTO</Text>
                <View style={styles.periodTabs}>
                  {PERIOD_OPTIONS.map((opt) => {
                    const isSelected = periodType === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          setPeriodType(opt.value);
                          setError(null);
                        }}
                        style={[
                          styles.periodTab,
                          isSelected && styles.periodTabSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.periodTabText,
                            isSelected && styles.periodTabTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Rango de fechas calculado */}
                <View style={styles.rangeBox}>
                  <Icon name="Calendar" size={14} color={colors.ink3} />
                  <Text style={styles.rangeText}>
                    Vigencia: {periodRange.periodStart} al {periodRange.periodEnd}
                  </Text>
                </View>
              </View>

              {/* Monto del Límite */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>LÍMITE DE GASTO MÁXIMO</Text>
                <View style={[styles.amountInputContainer, error ? styles.inputError : null]}>
                  <Text style={styles.currencyPrefix}>S/</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.ink3}
                    keyboardType="decimal-pad"
                    value={amountStr}
                    onChangeText={(val) => {
                      setAmountStr(val);
                      setError(null);
                    }}
                    autoFocus={false}
                  />
                </View>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>

              {/* Resumen del Presupuesto a Crear */}
              {selectedCategory ? (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Categoría seleccionada:</Text>
                    <Text style={[styles.summaryVal, { color: selectedCategory.color }]}>
                      {selectedCategory.name}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Periodo:</Text>
                    <Text style={styles.summaryVal}>
                      {PERIOD_OPTIONS.find((p) => p.value === periodType)?.label}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Footer con Botón Guardar */}
        {!isEmptyCategories ? (
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Guardando...' : 'Establecer Presupuesto'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.base,
    borderTopWidth: 1,
    borderColor: colors.line,
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
  scrollArea: {
    maxHeight: 460,
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  categoriesScroll: {
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  catIconBox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  categoryChipText: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  periodTabSelected: {
    backgroundColor: colors.primary,
  },
  periodTabText: {
    ...typography.labelSmall,
    color: colors.ink3,
    fontWeight: '600',
  },
  periodTabTextSelected: {
    color: '#0D0D0F',
    fontWeight: '700',
  },
  rangeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: 2,
  },
  rangeText: {
    ...typography.monoSmall,
    color: colors.ink3,
    fontSize: 11,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  currencyPrefix: {
    ...typography.amountLarge,
    color: colors.primary,
    fontSize: 20,
    marginRight: spacing.xs,
  },
  amountInput: {
    flex: 1,
    ...typography.amountLarge,
    fontSize: 22,
    color: colors.ink,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontSize: 12,
  },
  summaryCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.bodySmall,
    color: colors.ink3,
  },
  summaryVal: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyDescription: {
    ...typography.bodySmall,
    color: colors.ink3,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  createCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  createCatBtnText: {
    ...typography.labelMedium,
    color: '#0D0D0F',
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  saveButton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
  },
});
