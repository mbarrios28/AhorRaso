import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { db, merchants, profile } from '@/core/db';
import { and, eq, isNull } from 'drizzle-orm';
import { Category, CategorySelector } from '@/features/categories';
import { transactionsRepository } from '../data/transactions.repository';
import { PaymentMethod } from '../domain/types';

const FREQUENT_PLACES = ['Menú UNSA', 'Fotocopias', 'Combi', 'Tambo+'];

export const NewExpenseScreen: React.FC = () => {
  // Estado del formulario
  const [amountStr, setAmountStr] = useState('15.50');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [place, setPlace] = useState('Menú UNSA');
  const [placesList, setPlacesList] = useState<string[]>(FREQUENT_PLACES);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('digital');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDateOffset, setSelectedDateOffset] = useState<0 | 1>(0); // 0 = Hoy, 1 = Ayer
  const [currentBalanceCents, setCurrentBalanceCents] = useState<number>(0);

  // Cargar saldo actual del perfil y establecimientos guardados en SQLite
  React.useEffect(() => {
    let mounted = true;
    // Lecturas síncronas sobre SQLite local; se difieren al microtask para no
    // ejecutar setState directamente en el cuerpo del efecto (regla
    // react-hooks/set-state-in-effect), manteniendo la misma conducta.
    queueMicrotask(() => {
      try {
        // 1. Saldo actual
        const userProf = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
        if (mounted && userProf) {
          setCurrentBalanceCents(userProf.initialBalanceCents);
        }

        // 2. Establecimientos guardados
        const saved = db
          .select()
          .from(merchants)
          .where(and(eq(merchants.userId, DEV_USER_ID), isNull(merchants.deletedAt)))
          .all();
        const names = saved.map((m) => m.name);
        const combined = Array.from(new Set([...FREQUENT_PLACES, ...names]));
        if (mounted) {
          setPlacesList(combined);
        }
      } catch (e) {
        console.error('Error al inicializar formulario de gasto:', e);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Cálculo de fecha según offset (0 = Hoy, 1 = Ayer)
  const targetDate = new Date();
  if (selectedDateOffset === 1) {
    targetDate.setDate(targetDate.getDate() - 1);
  }
  const occurredOnISO = targetDate.toISOString().split('T')[0];

  // Cálculo de montos
  const parsedAmount = parseFloat(amountStr) || 0;
  const amountCents = Math.round(parsedAmount * 100);

  // Atajos para sumar al monto (+5, +10, +20)
  const handleAddAmount = (extra: number) => {
    const current = parseFloat(amountStr) || 0;
    const next = (current + extra).toFixed(2);
    setAmountStr(next);
  };

  const handleSave = () => {
    setErrorMsg(null);

    // Validación básica de entrada
    if (amountCents <= 0) {
      setErrorMsg('Ingresa un monto válido mayor a 0');
      return;
    }

    if (!selectedCategory) {
      setErrorMsg('Debes seleccionar una categoría');
      return;
    }

    try {
      transactionsRepository.createExpense(DEV_USER_ID, {
        amountCents,
        occurredOn: occurredOnISO,
        categoryId: selectedCategory.id,
        merchantName: place.trim() || undefined,
        paymentMethod,
        note: note.trim() || undefined,
        entryMethod: 'manual',
      });

      // Retornar a la vista anterior tras registro exitoso
      router.back();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al registrar el gasto');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.headerButton}
            accessibilityLabel="Cerrar formulario"
          >
            <Icon name="X" size={22} color={colors.ink2} />
          </Pressable>
          <Text style={styles.headerTitle}>Nuevo gasto</Text>
          <Pressable
            onPress={() => Alert.alert('Dictado por voz', 'RF-003 en desarrollo por Dev C')}
            style={styles.headerButton}
            accessibilityLabel="Voz"
          >
            <Icon name="Mic" size={20} color={colors.ink2} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* 1. Sección de Monto Hero */}
          <View style={styles.amountSection}>
            <Text style={styles.sectionLabel}>MONTO</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>S/</Text>
              <TextInput
                value={amountStr}
                onChangeText={(val) => {
                  setErrorMsg(null);
                  // Solo permitir números y un punto decimal
                  const sanitized = val.replace(/[^0-9.]/g, '');
                  setAmountStr(sanitized);
                }}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                selectTextOnFocus
              />
            </View>

            {/* Botones de incremento rápido */}
            <View style={styles.quickAddRow}>
              {[5, 10, 20].map((add) => (
                <Pressable
                  key={add}
                  onPress={() => handleAddAmount(add)}
                  style={styles.quickChip}
                >
                  <Text style={styles.quickChipText}>+ {add}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 2. Fecha y Estado */}
          <View style={styles.metaRow}>
            <View style={styles.dateSelector}>
              <Pressable
                onPress={() => setSelectedDateOffset(0)}
                style={[
                  styles.datePill,
                  selectedDateOffset === 0 && styles.datePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.datePillText,
                    selectedDateOffset === 0 && styles.datePillTextActive,
                  ]}
                >
                  Hoy
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedDateOffset(1)}
                style={[
                  styles.datePill,
                  selectedDateOffset === 1 && styles.datePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.datePillText,
                    selectedDateOffset === 1 && styles.datePillTextActive,
                  ]}
                >
                  Ayer
                </Text>
              </Pressable>
              <Text style={styles.dateISO}>{occurredOnISO}</Text>
            </View>

            <View style={styles.offlinePill}>
              <View style={styles.statusDot} />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          </View>

          {/* 3. Selector de Categorías (Bloque 4) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CATEGORÍA</Text>
            <CategorySelector
              selectedId={selectedCategory?.id || null}
              onSelect={(cat) => setSelectedCategory(cat)}
              type="expense"
            />
          </View>

          {/* 4. Establecimiento */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ESTABLECIMIENTO</Text>
            <View style={styles.inputContainer}>
              <Icon name="Store" size={18} color={colors.ink3} />
              <TextInput
                value={place}
                onChangeText={setPlace}
                placeholder="¿Dónde compraste?"
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
              />
            </View>

            {/* Chips rápidos de establecimientos */}
            <View style={styles.placesRow}>
              {placesList.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setPlace(item)}
                  style={[
                    styles.placeChip,
                    place === item && styles.placeChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.placeChipText,
                      place === item && styles.placeChipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 5. Método de Pago (Segmented Control) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MÉTODO DE PAGO</Text>
            <View style={styles.segmentedControl}>
              <Pressable
                onPress={() => setPaymentMethod('cash')}
                style={[
                  styles.segmentTab,
                  paymentMethod === 'cash' && styles.segmentTabActive,
                ]}
              >
                <Icon
                  name="Banknote"
                  size={16}
                  color={paymentMethod === 'cash' ? colors.ink : colors.ink3}
                />
                <Text
                  style={[
                    styles.segmentText,
                    paymentMethod === 'cash' && styles.segmentTextActive,
                  ]}
                >
                  Efectivo
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setPaymentMethod('digital')}
                style={[
                  styles.segmentTab,
                  paymentMethod === 'digital' && styles.segmentTabActive,
                ]}
              >
                <Icon
                  name="Smartphone"
                  size={16}
                  color={paymentMethod === 'digital' ? colors.ink : colors.ink3}
                />
                <Text
                  style={[
                    styles.segmentText,
                    paymentMethod === 'digital' && styles.segmentTextActive,
                  ]}
                >
                  Yape / Plin
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 6. Nota Opcional */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTA</Text>
            <View style={styles.inputContainer}>
              <Icon name="FileText" size={18} color={colors.ink3} />
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Almuerzo con compañeros (opcional)"
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
                maxLength={200}
              />
            </View>
          </View>

          {/* Error visual si existe */}
          {errorMsg && (
            <View style={styles.errorContainer}>
              <Icon name="AlertCircle" size={16} color={colors.danger} />
              <Text style={styles.errorMessage}>{errorMsg}</Text>
            </View>
          )}

          {/* Hint de impacto en saldo en tiempo real */}
          <View
            style={[
              styles.hintCard,
              currentBalanceCents - amountCents < 0 && styles.hintCardWarning,
            ]}
          >
            <Icon
              name={currentBalanceCents - amountCents < 0 ? 'AlertTriangle' : 'PiggyBank'}
              size={18}
              color={currentBalanceCents - amountCents < 0 ? colors.tertiary : colors.secondary}
            />
            <View style={styles.hintContent}>
              <Text style={styles.hintTitle}>
                {currentBalanceCents - amountCents < 0
                  ? 'Excede tu saldo disponible'
                  : 'Impacto en tu saldo'}
              </Text>
              <Text style={styles.hintText}>
                Saldo actual: S/ {(currentBalanceCents / 100).toFixed(2)} → Te quedarán:{' '}
                <Text
                  style={[
                    styles.hintHighlight,
                    currentBalanceCents - amountCents < 0 && { color: colors.tertiary },
                  ]}
                >
                  S/ {((currentBalanceCents - amountCents) / 100).toFixed(2)}
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* 7. Botón CTA Inferior */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={styles.saveBtnText}>
              Guardar gasto ·{' '}
              <Text style={styles.saveBtnAmount}>
                S/ {parsedAmount.toFixed(2)}
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    height: 52,
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  scrollContent: {
    padding: spacing.gutter,
    paddingBottom: 40,
    gap: spacing.base,
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  sectionLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
    marginBottom: spacing.xs,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  currencyPrefix: {
    ...typography.monoMedium,
    fontSize: 22,
    color: colors.ink3,
  },
  amountInput: {
    ...typography.amountHero,
    color: colors.ink,
    minWidth: 180,
    textAlign: 'center',
    padding: 0,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickChip: {
    paddingHorizontal: spacing.base,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: {
    ...typography.monoSmall,
    color: colors.ink2,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  datePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  datePillActive: {
    backgroundColor: colors.surface3,
    borderColor: colors.lineFocus,
  },
  datePillText: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
  },
  datePillTextActive: {
    color: colors.ink,
    fontFamily: fontFamilies.bodySemiBold,
  },
  dateISO: {
    ...typography.monoSmall,
    fontSize: 11,
    color: colors.ink3,
    marginLeft: 2,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  offlineText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
  },
  section: {
    gap: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    height: 48,
  },
  textInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 14,
    padding: 0,
  },
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  placeChip: {
    paddingHorizontal: spacing.md,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeChipSelected: {
    backgroundColor: colors.surface3,
    borderColor: colors.lineFocus,
    borderWidth: 1,
  },
  placeChipText: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
  },
  placeChipTextSelected: {
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
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
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    padding: spacing.base,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  hintCardWarning: {
    borderColor: 'rgba(223, 108, 107, 0.4)',
    backgroundColor: 'rgba(223, 108, 107, 0.08)',
  },
  hintContent: {
    flex: 1,
    gap: 2,
  },
  hintTitle: {
    ...typography.labelSmall,
    color: colors.ink,
    fontSize: 12,
  },
  hintText: {
    ...typography.bodySmall,
    color: colors.ink2,
    lineHeight: 16,
    fontSize: 12,
  },
  hintHighlight: {
    fontFamily: fontFamilies.monoBold,
    color: colors.secondary,
  },
  footer: {
    padding: spacing.gutter,
    paddingBottom: Platform.OS === 'ios' ? spacing.gutter : spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  saveBtn: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
    fontSize: 16,
  },
  saveBtnAmount: {
    fontFamily: fontFamilies.monoBold,
  },
});
