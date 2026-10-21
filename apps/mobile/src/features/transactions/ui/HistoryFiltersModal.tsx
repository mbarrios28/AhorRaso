import React, { useState } from 'react';
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
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { Category, Merchant } from '@/core/db';
import {
  HISTORY_DATE_REGEX,
  HISTORY_RANGE_PRESETS,
  HistoryFilters,
  HistoryOrder,
  HistoryRangePreset,
  parseAmountToCents,
  resolveHistoryRangePreset,
} from '../domain/history';

export interface HistoryFiltersModalProps {
  visible: boolean;
  /** Filtros avanzados aplicados actualmente (sin `type` ni `search`, que viven en la barra). */
  filters: HistoryFilters;
  categories: Category[];
  merchants: Merchant[];
  onApply: (filters: HistoryFilters) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Filtros avanzados del historial: fechas, categoría, establecimiento y montos. */
export const HistoryFiltersModal: React.FC<HistoryFiltersModalProps> = ({
  visible,
  filters,
  categories,
  merchants,
  onApply,
  onReset,
  onClose,
}) => {
  // El formulario se monta solo con el modal visible: cada apertura parte de
  // los filtros aplicados, sin necesidad de efectos de sincronización.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
        <HistoryFiltersForm
          filters={filters}
          categories={categories}
          merchants={merchants}
          onApply={onApply}
          onReset={onReset}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
};

type HistoryFiltersFormProps = Omit<HistoryFiltersModalProps, 'visible'>;

const HistoryFiltersForm: React.FC<HistoryFiltersFormProps> = ({
  filters,
  categories,
  merchants,
  onApply,
  onReset,
  onClose,
}) => {
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo] = useState(filters.to ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(filters.categoryId ?? null);
  const [merchantId, setMerchantId] = useState<string | null>(filters.merchantId ?? null);
  const [merchantFilter, setMerchantFilter] = useState('');
  const [minAmount, setMinAmount] = useState(
    filters.minAmountCents !== undefined ? (filters.minAmountCents / 100).toFixed(2) : ''
  );
  const [maxAmount, setMaxAmount] = useState(
    filters.maxAmountCents !== undefined ? (filters.maxAmountCents / 100).toFixed(2) : ''
  );
  const [order, setOrder] = useState<HistoryOrder>(filters.order ?? 'date_desc');
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (id: HistoryRangePreset) => {
    const range = resolveHistoryRangePreset(id);
    setFrom(range.from ?? '');
    setTo(range.to ?? '');
    setError(null);
  };

  const handleApply = () => {
    const cleanFrom = from.trim();
    const cleanTo = to.trim();

    if (cleanFrom && !HISTORY_DATE_REGEX.test(cleanFrom)) {
      setError('La fecha "desde" debe tener el formato AAAA-MM-DD.');
      return;
    }
    if (cleanTo && !HISTORY_DATE_REGEX.test(cleanTo)) {
      setError('La fecha "hasta" debe tener el formato AAAA-MM-DD.');
      return;
    }
    if (cleanFrom && cleanTo && cleanFrom > cleanTo) {
      setError('La fecha "desde" no puede ser posterior a la fecha "hasta".');
      return;
    }

    const minAmountCents = parseAmountToCents(minAmount);
    if (minAmountCents === null) {
      setError('El monto mínimo no es válido (usa hasta 2 decimales).');
      return;
    }
    const maxAmountCents = parseAmountToCents(maxAmount);
    if (maxAmountCents === null) {
      setError('El monto máximo no es válido (usa hasta 2 decimales).');
      return;
    }
    if (
      minAmountCents !== undefined &&
      maxAmountCents !== undefined &&
      minAmountCents > maxAmountCents
    ) {
      setError('El monto mínimo no puede superar al monto máximo.');
      return;
    }

    onApply({
      from: cleanFrom || undefined,
      to: cleanTo || undefined,
      categoryId: categoryId ?? undefined,
      merchantId: merchantId ?? undefined,
      minAmountCents,
      maxAmountCents,
      order,
    });
    onClose();
  };

  const handleReset = () => {
    setFrom('');
    setTo('');
    setCategoryId(null);
    setMerchantId(null);
    setMerchantFilter('');
    setMinAmount('');
    setMaxAmount('');
    setOrder('date_desc');
    setError(null);
    onReset();
  };

  const visibleMerchants = merchantFilter.trim()
    ? merchants.filter((merchant) =>
        merchant.name.toLowerCase().includes(merchantFilter.trim().toLowerCase())
      )
    : merchants;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.overlay}
    >
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Filtros del historial</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Cerrar filtros"
          >
            <Icon name="X" size={20} color={colors.ink2} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. Rango de fechas */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>RANGO DE FECHAS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {HISTORY_RANGE_PRESETS.map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() => applyPreset(preset.id)}
                  style={styles.presetChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Rango ${preset.label}`}
                >
                  <Text style={styles.presetChipText}>{preset.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Desde</Text>
                <TextInput
                  value={from}
                  onChangeText={(value) => {
                    setFrom(value);
                    setError(null);
                  }}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.ink3}
                  style={styles.input}
                  autoCapitalize="none"
                  maxLength={10}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Hasta</Text>
                <TextInput
                  value={to}
                  onChangeText={(value) => {
                    setTo(value);
                    setError(null);
                  }}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.ink3}
                  style={styles.input}
                  autoCapitalize="none"
                  maxLength={10}
                />
              </View>
            </View>
          </View>

          {/* 2. Categoría */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CATEGORÍA</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              <Pressable
                onPress={() => setCategoryId(null)}
                style={[styles.chip, categoryId === null && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityLabel="Todas las categorías"
              >
                <Text style={[styles.chipText, categoryId === null && styles.chipTextSelected]}>
                  Todas
                </Text>
              </Pressable>
              {categories.map((category) => {
                const isSelected = categoryId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => setCategoryId(isSelected ? null : category.id)}
                    style={[styles.chip, isSelected && { borderColor: category.color }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Categoría ${category.name}`}
                  >
                    <Icon
                      name={category.icon}
                      size={13}
                      color={isSelected ? category.color : colors.ink3}
                    />
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* 3. Establecimiento (Escenario 1 de HU-05) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ESTABLECIMIENTO</Text>
            {merchants.length === 0 ? (
              <Text style={styles.helperText}>
                Aún no registraste establecimientos. Se crean al anotar el lugar de un gasto.
              </Text>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Icon name="Store" size={16} color={colors.ink3} />
                  <TextInput
                    value={merchantFilter}
                    onChangeText={setMerchantFilter}
                    placeholder="Buscar establecimiento"
                    placeholderTextColor={colors.ink3}
                    style={styles.textInput}
                    autoCapitalize="none"
                  />
                  {merchantFilter.length > 0 && (
                    <Pressable
                      onPress={() => setMerchantFilter('')}
                      accessibilityLabel="Limpiar búsqueda de establecimiento"
                    >
                      <Icon name="X" size={16} color={colors.ink3} />
                    </Pressable>
                  )}
                </View>

                <View style={styles.merchantChips}>
                  <Pressable
                    onPress={() => setMerchantId(null)}
                    style={[styles.chip, merchantId === null && styles.chipSelected]}
                    accessibilityRole="button"
                    accessibilityLabel="Todos los establecimientos"
                  >
                    <Text style={[styles.chipText, merchantId === null && styles.chipTextSelected]}>
                      Todos
                    </Text>
                  </Pressable>
                  {visibleMerchants.map((merchant) => {
                    const isSelected = merchantId === merchant.id;
                    return (
                      <Pressable
                        key={merchant.id}
                        onPress={() => setMerchantId(isSelected ? null : merchant.id)}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Establecimiento ${merchant.name}`}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {merchant.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {visibleMerchants.length === 0 && (
                    <Text style={styles.helperText}>Sin coincidencias para «{merchantFilter}».</Text>
                  )}
                </View>
              </>
            )}
          </View>

          {/* 4. Monto */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>MONTO (S/)</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Mínimo</Text>
                <TextInput
                  value={minAmount}
                  onChangeText={(value) => {
                    setMinAmount(value.replace(/[^0-9.,]/g, ''));
                    setError(null);
                  }}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Máximo</Text>
                <TextInput
                  value={maxAmount}
                  onChangeText={(value) => {
                    setMaxAmount(value.replace(/[^0-9.,]/g, ''));
                    setError(null);
                  }}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>
          </View>

          {/* 5. Orden */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ORDEN CRONOLÓGICO</Text>
            <View style={styles.segmentedControl}>
              <Pressable
                onPress={() => setOrder('date_desc')}
                style={[styles.segmentTab, order === 'date_desc' && styles.segmentTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: order === 'date_desc' }}
              >
                <Text style={[styles.segmentText, order === 'date_desc' && styles.segmentTextActive]}>
                  Más recientes
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOrder('date_asc')}
                style={[styles.segmentTab, order === 'date_asc' && styles.segmentTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: order === 'date_asc' }}
              >
                <Text style={[styles.segmentText, order === 'date_asc' && styles.segmentTextActive]}>
                  Más antiguos
                </Text>
              </Pressable>
            </View>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Icon name="AlertCircle" size={16} color={colors.danger} />
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Acciones */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Limpiar todos los filtros"
          >
            <Icon name="RotateCcw" size={16} color={colors.ink2} />
            <Text style={styles.resetBtnText}>Limpiar</Text>
          </Pressable>
          <Pressable
            onPress={handleApply}
            style={({ pressed }) => [
              styles.applyBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Aplicar filtros"
          >
            <Text style={styles.applyBtnText}>Aplicar filtros</Text>
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
    maxHeight: '90%',
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
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  helperText: {
    ...typography.bodySmall,
    color: colors.ink3,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.base,
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipText: {
    ...typography.bodySmall,
    color: colors.ink2,
    fontSize: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateField: {
    flex: 1,
    gap: spacing.xxs,
  },
  dateFieldLabel: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
  },
  input: {
    height: 44,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontFamily: fontFamilies.mono,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  textInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 14,
    padding: 0,
  },
  merchantChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipSelected: {
    backgroundColor: colors.surface3,
    borderColor: colors.lineFocus,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 12,
  },
  chipTextSelected: {
    color: colors.ink,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 3,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    ...typography.bodyMedium,
    color: colors.ink3,
    fontSize: 13,
  },
  segmentTextActive: {
    color: colors.ink,
    fontWeight: '600',
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
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  resetBtn: {
    height: 50,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  resetBtnText: {
    ...typography.labelMedium,
    color: colors.ink2,
  },
  applyBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
  },
});
