import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { budgetsRepository } from '@/features/budgets/data/budgets.repository';
import { BudgetWithCategory } from '@/features/budgets/domain/types';
import { BudgetFormModal } from '@/features/budgets/ui/BudgetFormModal';
import { BudgetCard } from '@/features/budgets/ui/BudgetCard';
import {
  alertsRepository,
  AlertBanner,
  NotificationSettingsModal,
  BudgetAlertTriggered,
} from '@/features/alerts';

export default function BudgetsTab() {
  const [activeBudgets, setActiveBudgets] = useState<BudgetWithCategory[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [budgetToEdit, setBudgetToEdit] = useState<BudgetWithCategory | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<BudgetAlertTriggered[]>([]);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const loadBudgets = useCallback(() => {
    try {
      const list = budgetsRepository.listActive(DEV_USER_ID);
      setActiveBudgets(list);

      // Evaluación reactiva de alertas de presupuesto (RF-011)
      const evalResult = alertsRepository.evaluateBudgetAlerts(DEV_USER_ID);
      const recent = alertsRepository.getRecentAlerts(DEV_USER_ID, 3);
      const combined = [...evalResult.alerts];
      for (const r of recent) {
        if (
          !combined.some(
            (c) => c.budgetId === r.budgetId && c.thresholdPercent === r.thresholdPercent
          )
        ) {
          combined.push(r);
        }
      }
      setActiveAlerts(combined);
    } catch (e) {
      console.error('Error al cargar presupuestos y alertas:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBudgets();
    }, [loadBudgets])
  );

  // Totales agregados (computados estrictamente sobre el periodo activo)
  const totalBudgetCents = activeBudgets.reduce((acc, b) => acc + b.amountCents, 0);
  const totalSpentCents = activeBudgets.reduce((acc, b) => acc + b.spentCents, 0);
  const availableCents = Math.max(0, totalBudgetCents - totalSpentCents);
  const overallPct =
    totalBudgetCents > 0
      ? Math.min(100, Math.round((totalSpentCents / totalBudgetCents) * 100))
      : 0;

  const handleOpenCreate = () => {
    setModalMode('create');
    setBudgetToEdit(null);
    setModalVisible(true);
  };

  const handleEdit = (budget: BudgetWithCategory) => {
    setModalMode('edit');
    setBudgetToEdit(budget);
    setModalVisible(true);
  };

  const handleDelete = (budget: BudgetWithCategory) => {
    const executeDelete = () => {
      try {
        budgetsRepository.delete(DEV_USER_ID, budget.id);
        loadBudgets();
      } catch (e) {
        console.error('Error al eliminar presupuesto:', e);
        if (Platform.OS === 'web') {
          window.alert('No se pudo eliminar el presupuesto seleccionado.');
        } else {
          Alert.alert('Error', 'No se pudo eliminar el presupuesto seleccionado.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(
          `¿Estás seguro de que deseas eliminar el presupuesto de "${budget.categoryName}"?`
        );
      if (confirmed) {
        executeDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Presupuesto',
        `¿Estás seguro de que deseas eliminar el presupuesto de "${budget.categoryName}"? Esta acción no se puede deshacer.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Presupuestos</Text>
            <Text style={styles.headerSubtitle}>Límites de gasto por categoría</Text>
          </View>
          <View style={styles.headerButtons}>
            <Pressable
              style={styles.bellButton}
              onPress={() => setSettingsModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Configurar alertas y umbrales"
            >
              <Icon name="Bell" size={16} color={colors.primary} />
            </Pressable>
            <Pressable
              style={styles.addButton}
              onPress={handleOpenCreate}
              accessibilityRole="button"
              accessibilityLabel="Establecer presupuesto"
            >
              <Icon name="Plus" size={16} color="#0D0D0F" />
              <Text style={styles.addButtonText}>Establecer</Text>
            </Pressable>
          </View>
        </View>

        {/* Banner de Alertas Reactivas (RF-011 / RNF-010) */}
        <AlertBanner
          alerts={activeAlerts}
          onDismiss={(alertId) =>
            setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId))
          }
        />

        {/* Card Resumen General */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>PRESUPUESTO TOTAL ACTIVO</Text>
          <Text style={styles.summaryAmount}>
            S/ {(totalBudgetCents / 100).toFixed(2)}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${overallPct}%`,
                  backgroundColor: overallPct >= 100 ? colors.danger : colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              Gastado: S/ {(totalSpentCents / 100).toFixed(2)} ({overallPct}%)
            </Text>
            <Text style={[styles.progressText, { color: colors.secondary }]}>
              Disponible: S/ {(availableCents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Categorías con Presupuesto */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>LÍMITES POR CATEGORÍA</Text>
            <Text style={styles.countBadge}>
              {activeBudgets.length} configurado{activeBudgets.length === 1 ? '' : 's'}
            </Text>
          </View>

          {activeBudgets.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIcon}>
                <Icon name="PieChart" size={28} color={colors.ink3} />
              </View>
              <Text style={styles.emptyStateTitle}>Sin presupuestos definidos</Text>
              <Text style={styles.emptyStateSubtitle}>
                Establece un tope de gasto por categoría para controlar tus finanzas y prevenir sobregiros.
              </Text>
              <Pressable
                style={styles.emptyStateBtn}
                onPress={handleOpenCreate}
              >
                <Icon name="Plus" size={16} color="#0D0D0F" />
                <Text style={styles.emptyStateBtnText}>Nuevo Presupuesto</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.categoryList}>
              {activeBudgets.map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          )}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>RF-006 & RNF-009 · PRESUPUESTOS Y CONFIABILIDAD</Text>
          </View>
          <Text style={styles.infoText}>
            Presupuestos almacenados en SQLite local con control estricto de unicidad por categoría y periodo,
            sincronizados automáticamente vía la cola Outbox.
          </Text>
        </View>
      </ScrollView>

      {/* Modal Dual para Crear / Editar Presupuesto (RF-006) */}
      <BudgetFormModal
        visible={modalVisible}
        mode={modalMode}
        initialBudget={budgetToEdit}
        onClose={() => {
          setModalVisible(false);
          setBudgetToEdit(null);
        }}
        onSaved={() => {
          loadBudgets();
        }}
      />

      {/* Modal de Configuración de Alertas y Umbrales (RF-010) */}
      <NotificationSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        onSaved={() => {
          loadBudgets();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.gutter,
    paddingBottom: spacing.xxxl,
    gap: spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: {
    ...typography.titleLarge,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bellButton: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  addButtonText: {
    ...typography.labelSmall,
    color: '#0D0D0F',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.xs,
  },
  summaryLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  summaryAmount: {
    ...typography.amountLarge,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginVertical: spacing.xxs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
  },
  progressText: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  countBadge: {
    ...typography.monoSmall,
    fontSize: 11,
    color: colors.ink3,
  },
  categoryList: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  emptyStateContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyStateIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyStateTitle: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  emptyStateSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
    lineHeight: 18,
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  emptyStateBtnText: {
    ...typography.labelSmall,
    color: '#0D0D0F',
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  infoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderColor: colors.line,
    borderWidth: 1,
  },
  infoBadgeText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink2,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.ink3,
    lineHeight: 18,
  },
});
