import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { db, merchants, profile } from '@/core/db';
import { and, eq, isNull } from 'drizzle-orm';
import { Category, categoriesRepository } from '@/features/categories';
import { transactionsRepository } from '../data/transactions.repository';
import { voiceLearningRepository } from '../data/voiceLearning.repository';
import { parseVoiceTranscript } from '../domain/voiceParser';
import { ExpenseAccordionCard, ExpenseItemState } from './ExpenseAccordionCard';
import { VoiceRecordingModal } from './VoiceRecordingModal';

const FREQUENT_PLACES = ['Menú UNSA', 'Fotocopias', 'Combi', 'Tambo+'];

export const NewExpenseScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  // Lista de categorías y establecimientos
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [placesList, setPlacesList] = useState<string[]>(FREQUENT_PLACES);
  const [selectedDateOffset, setSelectedDateOffset] = useState<0 | 1>(0); // 0 = Hoy, 1 = Ayer

  // Estado del modal de voz y banner de IA
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [aiBannerText, setAiBannerText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lista dinámica de compras en formato acordeón
  const [cards, setCards] = useState<ExpenseItemState[]>([
    {
      id: 'card-init-1',
      amountStr: '',
      selectedCategory: null,
      place: '',
      paymentMethod: 'digital',
      note: '',
      entryMethod: 'manual',
    },
  ]);
  const [openCardId, setOpenCardId] = useState<string | null>('card-init-1');

  // Inicialización de categorías y saldo de perfil
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      try {
        // 1. Categorías del usuario
        const cats = categoriesRepository.getByUser(DEV_USER_ID, 'expense');
        if (mounted) {
          setCategoriesList(cats);
          // Asignar categoría inicial por defecto si aún no está asignada
          setCards((prev) =>
            prev.map((c) =>
              c.selectedCategory ? c : { ...c, selectedCategory: cats[0] || null }
            )
          );
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
        console.error('Error al inicializar NewExpenseScreen:', e);
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

  // Cálculo del total acumulado en todas las cards
  const totalAmount = cards.reduce((sum, c) => {
    const val = parseFloat(c.amountStr) || 0;
    return sum + val;
  }, 0);
  const totalCents = Math.round(totalAmount * 100);

  // Toggle de acordeón para una card
  const handleToggleCard = (cardId: string) => {
    setOpenCardId((prev) => (prev === cardId ? null : cardId));
  };

  // Añadir una nueva card vacía al acordeón
  const handleAddNewCard = () => {
    const newId = Crypto.randomUUID();
    const newCard: ExpenseItemState = {
      id: newId,
      amountStr: '',
      selectedCategory: null,
      place: '',
      paymentMethod: 'digital',
      note: '',
      entryMethod: 'manual',
    };
    setCards((prev) => [...prev, newCard]);
    setOpenCardId(newId);
  };

  // Eliminar una card del acordeón
  const handleDeleteCard = (cardId: string) => {
    if (cards.length <= 1) return;
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    if (openCardId === cardId) {
      setOpenCardId(null);
    }
  };

  // Actualizar los datos de una card
  const handleUpdateCard = (cardId: string, updated: Partial<ExpenseItemState>) => {
    setErrorMsg(null);
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, ...updated } : c))
    );
  };

  // Procesamiento del dictado por voz (HU-10)
  const handleProcessVoiceTranscript = (transcript: string) => {
    try {
      // 1. Obtener aprendizajes adaptativos del usuario desde SQLite
      const learnedMatches = voiceLearningRepository.getAll(DEV_USER_ID).map((l) => ({
        phrase: l.phrase,
        categoryId: l.categoryId,
        merchantName: l.merchantName,
        hitCount: l.hitCount,
      }));

      // 2. Procesar transcripción con el parser NLP no rígido
      const parsedExpenses = parseVoiceTranscript(transcript, {
        userCategories: categoriesList.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
        learnedMatches,
        knownPlaces: placesList,
        defaultDate: occurredOnISO,
      });

      if (parsedExpenses.length === 0) return;

      // Si el dictado detectó que el gasto fue de ayer, ajustar el selector de fecha automáticamente
      const todayISO = new Date().toISOString().split('T')[0];
      if (parsedExpenses[0]?.occurredOn && parsedExpenses[0].occurredOn !== todayISO) {
        setSelectedDateOffset(1);
      }

      // 3. Convertir resultados a ExpenseItemState
      const newCards: ExpenseItemState[] = parsedExpenses.map((pe) => {
        const cat =
          categoriesList.find((c) => c.id === pe.categoryId) ||
          categoriesList.find(
            (c) => c.name.toLowerCase() === (pe.categoryName || '').toLowerCase()
          ) ||
          categoriesList[0] ||
          null;

        return {
          id: Crypto.randomUUID(),
          amountStr: (pe.amountCents / 100).toFixed(2),
          selectedCategory: cat,
          place: pe.merchantName || '',
          paymentMethod: pe.paymentMethod,
          note: pe.note || '',
          entryMethod: 'voice',
        };
      });

      // 4. Reemplazar o poblar la lista
      setCards(newCards);
      setOpenCardId(newCards[0].id);
      setAiBannerText(
        `Dictado procesado: ${newCards.length} ${
          newCards.length === 1 ? 'compra organizada' : 'compras organizadas'
        }`
      );
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al procesar el dictado de voz');
    }
  };

  // Guardar todas las compras de la lista
  const handleSaveAll = () => {
    setErrorMsg(null);

    // Validaciones
    if (cards.length === 0) {
      setErrorMsg('No hay compras para registrar');
      return;
    }

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const parsed = parseFloat(card.amountStr) || 0;
      const cents = Math.round(parsed * 100);

      if (cents <= 0) {
        setErrorMsg(`La compra #${i + 1} tiene un monto inválido`);
        setOpenCardId(card.id);
        return;
      }

      if (!card.selectedCategory) {
        setErrorMsg(`La compra #${i + 1} necesita una categoría`);
        setOpenCardId(card.id);
        return;
      }
    }

    try {
      // Guardar cada gasto en la base de datos local y registrar autoaprendizaje
      for (const card of cards) {
        const parsed = parseFloat(card.amountStr) || 0;
        const cents = Math.round(parsed * 100);

        transactionsRepository.createExpense(DEV_USER_ID, {
          amountCents: cents,
          occurredOn: occurredOnISO,
          categoryId: card.selectedCategory!.id,
          merchantName: card.place.trim() || undefined,
          paymentMethod: card.paymentMethod,
          note: card.note.trim() || undefined,
          entryMethod: card.entryMethod,
        });

        // Autoaprendizaje adaptativo: registrar el patrón frase/comercio -> categoría
        const learnCandidate = card.place.trim() || card.note.trim();
        if (learnCandidate.length >= 3) {
          voiceLearningRepository.learnPhrase(
            DEV_USER_ID,
            learnCandidate,
            card.selectedCategory!.id,
            card.place.trim() || undefined
          );
        }
      }

      // Regresar tras registro exitoso
      router.back();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al guardar los gastos');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Header con botón de voz integrado */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => router.back()}
              style={styles.headerButton}
              accessibilityLabel="Cerrar formulario"
            >
              <Icon name="X" size={20} color={colors.ink2} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>Registrar gastos</Text>
              <Text style={styles.headerSubtitle}>
                {cards.length} {cards.length === 1 ? 'compra en lista' : 'compras en lista'}
              </Text>
            </View>
          </View>

          {/* Botón de Dictado por Voz Inteligente */}
          <Pressable
            onPress={() => setIsVoiceModalOpen(true)}
            style={styles.micBtn}
            accessibilityRole="button"
            accessibilityLabel="Activar dictado por voz"
          >
            <Icon name="Mic" size={17} color={colors.primary} />
            <Text style={styles.micBtnText}>Dictar</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Fecha y Estado Offline */}
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

          {/* Banner de Feedback de IA tras dictado */}
          {aiBannerText && (
            <View style={styles.aiBanner}>
              <View style={styles.aiBannerLeft}>
                <Icon name="Sparkles" size={18} color={colors.primary} />
                <Text style={styles.aiBannerText}>{aiBannerText}</Text>
              </View>
              <Pressable
                onPress={() => setAiBannerText(null)}
                style={styles.closeAiBannerBtn}
              >
                <Icon name="X" size={16} color={colors.ink3} />
              </Pressable>
            </View>
          )}

          {/* Encabezado de la lista con botón para agregar otra compra */}
          <View style={styles.listHeaderRow}>
            <Text style={styles.counterTitle}>
              {cards.length} {cards.length === 1 ? 'COMPRA EN ESTA SESIÓN' : 'COMPRAS EN ESTA SESIÓN'}
            </Text>
            <Pressable
              onPress={handleAddNewCard}
              style={styles.addInlineBtn}
              accessibilityLabel="Añadir otra compra"
            >
              <Icon name="PlusCircle" size={16} color={colors.primary} />
              <Text style={styles.addInlineBtnText}>Añadir otra compra</Text>
            </Pressable>
          </View>

          {/* Lista de Acordeones de Compra */}
          <View style={styles.accordionContainer}>
            {cards.map((card, idx) => (
              <ExpenseAccordionCard
                key={card.id}
                card={card}
                index={idx}
                isOpen={openCardId === card.id}
                canDelete={cards.length > 1}
                onToggle={() => handleToggleCard(card.id)}
                onDelete={() => handleDeleteCard(card.id)}
                onUpdate={(updated) => handleUpdateCard(card.id, updated)}
                categoriesList={categoriesList}
                placesList={placesList}
              />
            ))}
          </View>

          {/* Botón Inferior para Añadir Nueva Card */}
          <Pressable
            onPress={handleAddNewCard}
            style={styles.addBottomDashedBtn}
            accessibilityRole="button"
            accessibilityLabel="Añadir otra compra a esta lista"
          >
            <Icon name="PlusCircle" size={18} color={colors.primary} />
            <Text style={styles.addBottomDashedBtnText}>
              Añadir otra compra a esta lista
            </Text>
          </Pressable>

          {/* Mensaje de error visual */}
          {errorMsg && (
            <View style={styles.errorContainer}>
              <Icon name="AlertCircle" size={16} color={colors.danger} />
              <Text style={styles.errorMessage}>{errorMsg}</Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky Footer Dinámico con Total General */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable
            onPress={handleSaveAll}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Guardar ${cards.length} compra(s) por un total de S/ ${totalAmount.toFixed(2)}`}
          >
            <Icon name="Check" size={20} color="#0D0D0F" />
            <Text style={styles.saveBtnText}>
              {cards.length === 1 ? 'Guardar compra' : `Guardar ${cards.length} compras`} ·{' '}
              <Text style={styles.saveBtnAmount}>S/ {totalAmount.toFixed(2)}</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Modal de Dictado por Voz Manos Libres montado bajo demanda */}
      {isVoiceModalOpen && (
        <VoiceRecordingModal
          visible={isVoiceModalOpen}
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
    backgroundColor: '#0D0D0F',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    height: 56,
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42, 42, 47, 0.4)',
    backgroundColor: '#0D0D0F',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.ink3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  micBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  micBtnText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  scrollContent: {
    padding: spacing.gutter,
    paddingBottom: 40,
    gap: spacing.base,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xxs,
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
    fontFamily: fontFamilies.monoMedium,
    fontSize: 11,
    color: colors.ink3,
    marginLeft: 2,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#18181B',
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
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.ink3,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
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
  },
  closeAiBannerBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  counterTitle: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1.2,
  },
  addInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addInlineBtnText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  accordionContainer: {
    gap: spacing.base,
  },
  addBottomDashedBtn: {
    width: '100%',
    paddingVertical: spacing.base,
    borderRadius: 18,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#2A2A2F',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: spacing.xxs,
  },
  addBottomDashedBtnText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontSize: 13.5,
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
  footer: {
    padding: spacing.gutter,
    paddingBottom: Platform.OS === 'ios' ? spacing.gutter : spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42, 42, 47, 0.3)',
    backgroundColor: '#0D0D0F',
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
    fontSize: 15.5,
  },
  saveBtnAmount: {
    fontFamily: fontFamilies.monoBold,
  },
});
