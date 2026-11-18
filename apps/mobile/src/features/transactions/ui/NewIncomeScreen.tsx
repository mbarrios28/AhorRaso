import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { db, profile } from '@/core/db';
import { eq } from 'drizzle-orm';
import { categoriesRepository, Category, CategorySelector } from '@/features/categories';
import { transactionsRepository } from '../data/transactions.repository';
import { voiceLearningRepository } from '../data/voiceLearning.repository';
import { SpeechAlternative } from '../domain/types';
import { formatLocalDateISO, parseVoiceIncomeFromAlternatives } from '../domain/voiceParser';
import { VoiceRecordingModal } from './VoiceRecordingModal';

const FREQUENT_SOURCES = [
  'Sueldo / Salario',
  'Mesada',
  'Trabajo freelance',
  'Beca',
  'Proyecto',
  'Venta',
];

export const NewIncomeScreen: React.FC = () => {
  // Estado del formulario
  const [amountStr, setAmountStr] = useState('100.00');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [learnedHints, setLearnedHints] = useState<string[]>([]);
  const [source, setSource] = useState('Sueldo / Salario');
  const [note, setNote] = useState('');
  const [entryMethod, setEntryMethod] = useState<'manual' | 'voice'>('manual');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiBannerText, setAiBannerText] = useState<string | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [selectedDateOffset, setSelectedDateOffset] = useState<0 | 1>(0); // 0 = Hoy, 1 = Ayer
  const [customOccurredOn, setCustomOccurredOn] = useState<string | null>(null);
  const [currentBalanceCents, setCurrentBalanceCents] = useState<number>(0);

  // Cargar saldo actual, categorías de ingreso y aprendizaje adaptativo desde SQLite
  React.useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      try {
        const userProf = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
        if (mounted && userProf) {
          setCurrentBalanceCents(userProf.initialBalanceCents);
        }

        const cats = categoriesRepository.getByUser(DEV_USER_ID, 'income');
        if (mounted) {
          setCategoriesList(cats);
          setSelectedCategory((prev) => prev ?? cats[0] ?? null);
        }

        const learned = voiceLearningRepository.getAll(DEV_USER_ID);
        if (mounted) {
          setLearnedHints(learned.slice(0, 15).map((l) => l.phrase));
        }
      } catch (e) {
        console.error('Error al inicializar formulario de ingreso:', e);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const contextualHints = useMemo(
    () =>
      Array.from(
        new Set([
          ...FREQUENT_SOURCES,
          ...categoriesList.map((c) => c.name),
          ...learnedHints,
        ])
      ),
    [categoriesList, learnedHints]
  );

  // Cálculo de fecha local según offset (0 = Hoy, 1 = Ayer) o fecha explícita dictada
  const targetDate = new Date();
  if (selectedDateOffset === 1) {
    targetDate.setDate(targetDate.getDate() - 1);
  }
  const occurredOnISO = customOccurredOn || formatLocalDateISO(targetDate);

  // Cálculo de montos
  const parsedAmount = parseFloat(amountStr) || 0;
  const amountCents = Math.round(parsedAmount * 100);

  // Atajos para sumar al monto (+50, +100, +200, +500)
  const handleAddAmount = (extra: number) => {
    const current = parseFloat(amountStr) || 0;
    const next = (current + extra).toFixed(2);
    setAmountStr(next);
  };

  const handleSelectDateOffset = (offset: 0 | 1) => {
    setSelectedDateOffset(offset);
    setCustomOccurredOn(null);
  };

  const handleProcessVoiceTranscript = (
    transcript: string,
    alternatives: SpeechAlternative[] = []
  ) => {
    try {
      const latestCats = categoriesRepository.getByUser(DEV_USER_ID, 'income');
      const activeCategories = latestCats.length > 0 ? latestCats : categoriesList;
      if (latestCats.length > 0) {
        setCategoriesList(latestCats);
      }

      const learnedMatches = voiceLearningRepository.getAll(DEV_USER_ID).map((l) => ({
        phrase: l.phrase,
        categoryId: l.categoryId,
        merchantName: l.merchantName,
        hitCount: l.hitCount,
      }));
      const historicalSamples = voiceLearningRepository.getHistoricalCategorySamples(
        DEV_USER_ID,
        'income'
      );

      const parsed = parseVoiceIncomeFromAlternatives(transcript, alternatives, {
        userCategories: activeCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
        learnedMatches,
        historicalSamples,
        defaultDate: occurredOnISO,
      });

      if (!parsed) return;

      if (parsed.amountCents > 0) {
        setAmountStr((parsed.amountCents / 100).toFixed(2));
      }

      const matchedCat = parsed.categoryId
        ? activeCategories.find((c) => c.id === parsed.categoryId) || null
        : parsed.categoryName
        ? activeCategories.find(
            (c) => c.name.toLowerCase() === parsed.categoryName!.toLowerCase()
          ) || null
        : null;
      setSelectedCategory(matchedCat);

      if (parsed.source) {
        setSource(parsed.source);
      }
      setNote('');
      setEntryMethod('voice');
      setErrorMsg(null);

      const now = new Date();
      const todayISO = formatLocalDateISO(now);
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayISO = formatLocalDateISO(yest);
      if (parsed.occurredOn === todayISO) {
        setSelectedDateOffset(0);
        setCustomOccurredOn(null);
      } else if (parsed.occurredOn === yesterdayISO) {
        setSelectedDateOffset(1);
        setCustomOccurredOn(null);
      } else {
        setCustomOccurredOn(parsed.occurredOn);
      }

      setAiBannerText(
        matchedCat
          ? 'Dictado procesado: revisa los campos y guarda tu ingreso'
          : 'Dictado procesado: selecciona una categoría para guardar tu ingreso'
      );
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al procesar el dictado de ingreso');
    }
  };

  const handleSave = () => {
    setErrorMsg(null);

    // Validación básica de entrada antes de delegar al dominio
    if (amountCents <= 0) {
      setErrorMsg('Ingresa un monto válido mayor a 0');
      return;
    }

    if (!source || source.trim().length === 0) {
      setErrorMsg('Debes especificar la fuente u origen del ingreso');
      return;
    }

    if (!selectedCategory) {
      setErrorMsg('Debes seleccionar una categoría de ingreso');
      return;
    }

    try {
      const cleanSource = source.trim();
      const cleanNote = note.trim();

      transactionsRepository.createIncome(DEV_USER_ID, {
        amountCents,
        occurredOn: occurredOnISO,
        categoryId: selectedCategory.id,
        source: cleanSource,
        note: cleanNote || undefined,
        entryMethod,
      });

      if (cleanSource.length >= 3) {
        voiceLearningRepository.learnPhrase(DEV_USER_ID, cleanSource, selectedCategory.id);
      }
      if (cleanNote.length >= 3 && cleanNote.toLowerCase() !== cleanSource.toLowerCase()) {
        voiceLearningRepository.learnPhrase(DEV_USER_ID, cleanNote, selectedCategory.id);
      }

      // Retorno inmediato a la vista anterior (< 50 ms)
      router.back();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al registrar el ingreso');
    }
  };

  const projectedBalanceCents = currentBalanceCents + amountCents;

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
          <Text style={styles.headerTitle}>Nuevo ingreso</Text>
          <Pressable
            onPress={() => setIsVoiceModalOpen(true)}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Dictar ingreso por voz"
          >
            <Icon name="Mic" size={20} color={colors.secondary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* 1. Sección de Monto Hero */}
          <View style={styles.amountSection}>
            <Text style={styles.sectionLabel}>MONTO RECIBIDO</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>+ S/</Text>
              <TextInput
                value={amountStr}
                onChangeText={(val) => {
                  setErrorMsg(null);
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
              {[50, 100, 200, 500].map((add) => (
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

          {/* Banner de dictado por voz */}
          {aiBannerText && (
            <View style={styles.aiBanner}>
              <View style={styles.aiBannerLeft}>
                <Icon name="Sparkles" size={16} color={colors.secondary} />
                <Text style={styles.aiBannerText}>{aiBannerText}</Text>
              </View>
              <Pressable onPress={() => setAiBannerText(null)}>
                <Icon name="X" size={16} color={colors.ink3} />
              </Pressable>
            </View>
          )}

          {/* 2. Fecha y Estado */}
          <View style={styles.metaRow}>
            <View style={styles.dateSelector}>
              <Pressable
                onPress={() => handleSelectDateOffset(0)}
                style={[
                  styles.datePill,
                  !customOccurredOn && selectedDateOffset === 0 && styles.datePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.datePillText,
                    !customOccurredOn && selectedDateOffset === 0 && styles.datePillTextActive,
                  ]}
                >
                  Hoy
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleSelectDateOffset(1)}
                style={[
                  styles.datePill,
                  !customOccurredOn && selectedDateOffset === 1 && styles.datePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.datePillText,
                    !customOccurredOn && selectedDateOffset === 1 && styles.datePillTextActive,
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

          {/* 3. Selector de Categorías de Ingreso (RF-004) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CATEGORÍA DE INGRESO</Text>
            <CategorySelector
              selectedId={selectedCategory?.id || null}
              onSelect={(cat) => {
                setErrorMsg(null);
                setSelectedCategory(cat);
              }}
              type="income"
              autoSelectFirst={false}
            />
          </View>

          {/* 4. Fuente u Origen del Ingreso (RF-001) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FUENTE U ORIGEN</Text>
            <View style={styles.inputContainer}>
              <Icon name="Briefcase" size={18} color={colors.ink3} />
              <TextInput
                value={source}
                onChangeText={(val) => {
                  setErrorMsg(null);
                  setSource(val);
                }}
                placeholder="Ej. Salario, Mesada, Trabajo freelance..."
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
                maxLength={100}
              />
            </View>

            {/* Chips rápidos de fuentes habituales */}
            <View style={styles.sourcesRow}>
              {FREQUENT_SOURCES.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setErrorMsg(null);
                    setSource(item);
                  }}
                  style={[
                    styles.sourceChip,
                    source === item && styles.sourceChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.sourceChipText,
                      source === item && styles.sourceChipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 5. Nota Opcional */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTA (OPCIONAL)</Text>
            <View style={styles.inputContainer}>
              <Icon name="FileText" size={18} color={colors.ink3} />
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Detalle o referencia adicional..."
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

          {/* Hint de impacto positivo en saldo en tiempo real */}
          <View style={styles.hintCard}>
            <Icon name="TrendingUp" size={18} color={colors.secondary} />
            <View style={styles.hintContent}>
              <Text style={styles.hintTitle}>Impacto positivo en tu saldo</Text>
              <Text style={styles.hintText}>
                Saldo actual: S/ {(currentBalanceCents / 100).toFixed(2)} → Pasará a:{' '}
                <Text style={styles.hintHighlight}>
                  S/ {(projectedBalanceCents / 100).toFixed(2)}
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* 6. Botón CTA Inferior */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={styles.saveBtnText}>
              Guardar ingreso ·{' '}
              <Text style={styles.saveBtnAmount}>
                S/ {parsedAmount.toFixed(2)}
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {isVoiceModalOpen && (
        <VoiceRecordingModal
          visible={isVoiceModalOpen}
          mode="income"
          contextualHints={contextualHints}
          onClose={() => setIsVoiceModalOpen(false)}
          onProcessTranscript={handleProcessVoiceTranscript}
        />
      )}
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
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  aiBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  aiBannerText: {
    ...typography.bodySmall,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
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
    color: colors.secondary,
    fontWeight: '700',
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
    backgroundColor: colors.secondary,
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
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  sourceChip: {
    paddingHorizontal: spacing.md,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceChipSelected: {
    backgroundColor: colors.surface3,
    borderColor: colors.lineFocus,
    borderWidth: 1,
  },
  sourceChipText: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
  },
  sourceChipTextSelected: {
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
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
    padding: spacing.base,
    borderRadius: radius.md,
    marginTop: spacing.xs,
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
    backgroundColor: colors.secondary,
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
