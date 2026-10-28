import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { budgetsRepository } from '@/features/budgets/data/budgets.repository';
import { BudgetWithCategory } from '@/features/budgets/domain/types';
import { CreateBudgetModal } from '@/features/budgets/ui/CreateBudgetModal';
import {
  alertsRepository,
  AlertBanner,
  NotificationSettingsModal,
  BudgetAlertTriggered,
} from '@/features/alerts';

export default function BudgetsTab() {
  const [activeBudgets, setActiveBudgets] = useState<BudgetWithCategory[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
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

  // Totales agregados
  const totalBudgetCents = activeBudgets.reduce((acc, b) => acc + b.amountCents, 0);
  const totalSpentCents = activeBudgets.reduce((acc, b) => acc + b.spentCents, 0);
  const availableCents = Math.max(0, totalBudgetCents - totalSpentCents);
  const overallPct =
    totalBudgetCents > 0
      ? Math.min(100, Math.round((totalSpentCents / totalBudgetCents) * 100))
      : 0;

  const formatPeriodLabel = (type: string) => {
    switch (type) {
      case 'weekly':
        return 'Semanal';
      case 'biweekly':
        return 'Quincenal';
      case 'monthly':
      default:
        return 'Mensual';
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
              onPress={() => setModalVisible(true)}
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
                onPress={() => setModalVisible(true)}
              >
                <Icon name="Plus" size={16} color="#0D0D0F" />
                <Text style={styles.emptyStateBtnText}>Nuevo Presupuesto</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.categoryList}>
              {activeBudgets.map((budget) => {
                const limitAmount = (budget.amountCents / 100).toFixed(2);
                const spentAmount = (budget.spentCents / 100).toFixed(2);
                const pct =
                  budget.amountCents > 0
                    ? Math.min(100, Math.round((budget.spentCents / budget.amountCents) * 100))
                    : 0;

                return (
                  <View key={budget.id} style={styles.categoryRow}>
                    <View
                      style={[
                        styles.catIconBox,
                        { borderColor: colors.line, backgroundColor: colors.surface2 },
                      ]}
                    >
                      <Icon
                        name={budget.categoryIcon}
                        size={18}
                        color={budget.categoryColor}
                      />
                    </View>
                    <View style={styles.catInfo}>
                      <View style={styles.catHeader}>
                        <View style={styles.catTitleRow}>
                          <Text style={styles.catName}>{budget.categoryName}</Text>
                          <View style={styles.periodBadge}>
                            <Text style={styles.periodBadgeText}>
                              {formatPeriodLabel(budget.periodType)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.catLimit}>Tope: S/ {limitAmount}</Text>
                      </View>
                      <View style={styles.catBarBg}>
                        <View
                          style={[
                            styles.catBarFill,
                            {
                              width: `${pct}%`,
                              backgroundColor:
                                pct >= 100
                                  ? colors.danger
                                  : pct >= 80
                                  ? colors.tertiary
                                  : budget.categoryColor,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.catFooter}>
                        <Text style={styles.catSpentText}>
                          Gastado: S/ {spentAmount} ({pct}%)
                        </Text>
                        <Text style={styles.catPeriodDates}>
                          {budget.periodStart} - {budget.periodEnd}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
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

      {/* Modal para Crear Presupuesto (RF-006) */}
      <CreateBudgetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
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
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  catIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catInfo: {
    flex: 1,
    gap: 6,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  catName: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  periodBadge: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  periodBadgeText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink2,
  },
  catLimit: {
    ...typography.monoSmall,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  catBarBg: {
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  catFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catSpentText: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
  },
  catPeriodDates: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
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
