import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { db, profile, Profile } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import { eq } from 'drizzle-orm';
import { dashboardRepository, DashboardSummary } from '@/features/dashboard';

export default function DashboardScreen() {
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  // useFocusEffect se ejecuta cada vez que el usuario vuelve a la pantalla
  // Garantiza RNF-003: carga síncrona inmediata desde SQLite local en < 50 ms.
  useFocusEffect(
    useCallback(() => {
      try {
        // 1. Cargar perfil del usuario
        const p = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
        if (p) setUserProfile(p);

        // 2. Obtener resumen financiero completo (RF-008 / HU-04)
        const dashData = dashboardRepository.getDashboardSummary(DEV_USER_ID);
        setSummary(dashData);
      } catch (e) {
        console.error('Error al actualizar datos del dashboard:', e);
      }
    }, [])
  );

  const monthLabel = summary ? summary.monthName.slice(0, 3).toUpperCase() : 'MES';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* 1. Header Superior */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {userProfile?.displayName || 'Estudiante UNSA'}</Text>
            <Text style={styles.campus}>UNSA · Arequipa</Text>
          </View>
          <View style={styles.headerAction}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Offline-First</Text>
          </View>
        </View>

        {/* 2. Card Principal: Saldo Disponible */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeaderRow}>
            <Text style={styles.balanceLabel}>SALDO DISPONIBLE</Text>
            <View style={styles.balanceTrendBadge}>
              <Icon name="TrendingUp" size={12} color={colors.secondary} />
              <Text style={styles.balanceTrendText}>Activo</Text>
            </View>
          </View>
          <Text style={styles.balanceAmount}>{summary?.formattedBalance || 'S/ 0.00'}</Text>
          <View style={styles.balanceFooter}>
            <Text style={styles.balanceFooterText}>
              Disponible para {summary?.monthName || 'el mes'} · {summary?.totalTransactionsCount || 0} transacciones locales
            </Text>
          </View>
        </View>

        {/* 3. Acciones Rápidas (CTAs del equipo: Nuevo Gasto y Nuevo Ingreso) */}
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => router.push('/new-expense')}
            style={({ pressed }) => [
              styles.ctaCardHalf,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Registrar nuevo gasto"
          >
            <View style={styles.ctaIconExpense}>
              <Icon name="ArrowDownRight" size={18} color="#0D0D0F" strokeWidth={2.4} />
            </View>
            <View style={styles.ctaHalfContent}>
              <Text style={styles.ctaHalfTitle}>Nuevo gasto</Text>
              <Text style={styles.ctaHalfSubtitle}>Punto de venta (RF-002)</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/new-income')}
            style={({ pressed }) => [
              styles.ctaCardHalf,
              styles.ctaCardIncome,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Registrar nuevo ingreso"
          >
            <View style={styles.ctaIconIncome}>
              <Icon name="ArrowUpRight" size={18} color="#0D0D0F" strokeWidth={2.4} />
            </View>
            <View style={styles.ctaHalfContent}>
              <Text style={styles.ctaHalfTitle}>Nuevo ingreso</Text>
              <Text style={styles.ctaHalfSubtitle}>Registrar entrada (RF-001)</Text>
            </View>
          </Pressable>
        </View>

        {/* 4. Resumen Mensual: Ingresos vs Gastos del Mes (RF-008 / HU-04) */}
        <View style={styles.summaryGrid}>
          {/* Card Ingresos del Mes */}
          <View style={styles.summaryMetricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricLabel}>INGRESOS ({monthLabel})</Text>
              <Icon name="ArrowUpRight" size={14} color={colors.secondary} />
            </View>
            <Text style={[styles.metricAmount, { color: colors.ink }]}>
              {summary?.formattedMonthlyIncome || 'S/ 0.00'}
            </Text>
          </View>

          {/* Card Gastos del Mes */}
          <View style={styles.summaryMetricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricLabel}>GASTOS ({monthLabel})</Text>
              <Icon name="ArrowDownRight" size={14} color={colors.tertiary} />
            </View>
            <Text style={[styles.metricAmount, { color: colors.ink }]}>
              {summary?.formattedMonthlyExpense || 'S/ 0.00'}
            </Text>
          </View>
        </View>

        {/* 5. Proyección Fin de Mes y Diario Seguro (RF-008 / HU-04) */}
        <View style={styles.projectionCard}>
          <View style={styles.projectionHeaderRow}>
            <Text style={styles.projectionTitle}>PROYECCIÓN FIN DE MES</Text>
            <View style={styles.safeDailyBadge}>
              <Text style={styles.safeDailyAmount}>
                {summary?.projection.formattedSafeDaily || 'S/ 0.00'}
              </Text>
              <Text style={styles.safeDailyUnit}> / día</Text>
            </View>
          </View>

          <View style={styles.projectionSubRow}>
            <Text style={styles.projectionDaysText}>
              Quedan {summary?.projection.daysRemaining ?? 0} días de ciclo
            </Text>
            <Text style={styles.projectionLabelBadge}>DIARIO SEGURO</Text>
          </View>

          {/* Barra de progreso del ciclo mensual */}
          <View style={styles.cycleProgressTrack}>
            <View
              style={[
                styles.cycleProgressFill,
                { width: `${summary?.projection.cycleElapsedPercentage || 0}%` },
              ]}
            />
          </View>
          <Text style={styles.cycleElapsedText}>
            {summary?.projection.cycleElapsedPercentage || 0}% del ciclo consumido
          </Text>
        </View>

        {/* 6. Gastos por Categoría (RF-008 / HU-04) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>GASTOS POR CATEGORÍA</Text>
            <Text style={styles.sectionHint}>{summary?.monthName?.toUpperCase() || 'OCTUBRE'}</Text>
          </View>

          {!summary || summary.categoryExpenses.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="PieChart" size={26} color={colors.ink3} />
              <Text style={styles.emptyText}>Aún no has registrado gastos este mes.</Text>
            </View>
          ) : (
            <View style={styles.categoryExpensesCard}>
              {summary.categoryExpenses.map((cat, index) => {
                const isLast = index === summary.categoryExpenses.length - 1;
                return (
                  <View
                    key={cat.categoryId}
                    style={[styles.categoryExpenseRow, !isLast && styles.categoryRowBorder]}
                  >
                    <View style={styles.catRowHeader}>
                      <View style={styles.catIconAndTitle}>
                        <View style={[styles.catIconCircle, { backgroundColor: colors.surface2 }]}>
                          <Icon name={cat.categoryIcon} size={16} color={cat.categoryColor} />
                        </View>
                        <Text style={styles.catNameText} numberOfLines={1}>
                          {cat.categoryName}
                        </Text>
                      </View>
                      <View style={styles.catAmounts}>
                        <Text style={styles.catAmountText}>{cat.formattedAmount}</Text>
                        <Text style={styles.catPercentageText}>{cat.percentage}%</Text>
                      </View>
                    </View>

                    {/* Barra de progreso de la categoría */}
                    <View style={styles.catProgressBarTrack}>
                      <View
                        style={[
                          styles.catProgressBarFill,
                          {
                            width: `${Math.min(100, Math.max(3, cat.percentage))}%`,
                            backgroundColor: cat.categoryColor || colors.secondary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* 7. Metas de Ahorro (Mock desacoplado de RF-007) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>METAS DE AHORRO</Text>
            <Text style={styles.sectionActionText}>GESTIONAR</Text>
          </View>

          <View style={styles.goalCard}>
            <View style={styles.goalHeaderRow}>
              <View style={styles.goalInfoLeft}>
                <View style={styles.goalIconCircle}>
                  <Icon name="Laptop" size={18} color={colors.secondary} />
                </View>
                <View>
                  <Text style={styles.goalTitle}>{summary?.activeGoal.title || 'Laptop para ciclo'}</Text>
                  <Text style={styles.goalDeadline}>{summary?.activeGoal.deadlineText || 'Meta para marzo 2027'}</Text>
                </View>
              </View>
              <View style={styles.goalAmountsRight}>
                <Text style={styles.goalAmountText}>
                  {summary?.activeGoal.formattedCurrent || 'S/ 120.00'}{' '}
                  <Text style={styles.goalTargetText}>/ {summary?.activeGoal.formattedTarget || 'S/ 500.00'}</Text>
                </Text>
                <Text style={styles.goalPercentageBadge}>{summary?.activeGoal.percentage || 24}%</Text>
              </View>
            </View>

            {/* Barra de progreso de la meta */}
            <View style={styles.goalProgressTrack}>
              <View
                style={[
                  styles.goalProgressFill,
                  { width: `${summary?.activeGoal.percentage || 24}%` },
                ]}
              />
            </View>
          </View>
        </View>
      </ScrollView>
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
    paddingTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  greeting: {
    ...typography.titleMedium,
    color: colors.ink,
  },
  campus: {
    ...typography.bodySmall,
    color: colors.ink3,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  statusText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink2,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  balanceLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  balanceTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  balanceTrendText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.secondary,
  },
  balanceAmount: {
    ...typography.amountLarge,
    fontSize: 36,
    lineHeight: 42,
    color: colors.ink,
  },
  balanceFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  balanceFooterText: {
    ...typography.bodySmall,
    color: colors.ink3,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaCardHalf: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ctaCardIncome: {
    backgroundColor: colors.surface,
  },
  ctaIconExpense: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconIncome: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaHalfContent: {
    marginTop: 2,
  },
  ctaHalfTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    fontSize: 13,
  },
  ctaHalfSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryMetricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  metricLabel: {
    ...typography.labelSmall,
    fontSize: 10,
    color: colors.ink3,
  },
  metricAmount: {
    ...typography.monoMedium,
    fontSize: 16,
    fontWeight: '700',
  },
  projectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.xs,
  },
  projectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  safeDailyBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  safeDailyAmount: {
    ...typography.monoMedium,
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 14,
  },
  safeDailyUnit: {
    ...typography.monoSmall,
    fontSize: 11,
    color: colors.ink3,
  },
  projectionSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  projectionDaysText: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  projectionLabelBadge: {
    ...typography.monoSmall,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.ink3,
    textTransform: 'uppercase',
  },
  cycleProgressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  cycleProgressFill: {
    height: '100%',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
  },
  cycleElapsedText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
    marginTop: 2,
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
  sectionHint: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
  },
  sectionActionText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.secondary,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.ink3,
  },
  categoryExpensesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.md,
  },
  categoryExpenseRow: {
    gap: spacing.xs,
  },
  categoryRowBorder: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  catRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catIconAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  catIconCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catNameText: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '500',
    flex: 1,
  },
  catAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catAmountText: {
    ...typography.monoMedium,
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  catPercentageText: {
    ...typography.monoSmall,
    fontSize: 11,
    color: colors.ink3,
    width: 32,
    textAlign: 'right',
  },
  catProgressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  catProgressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  goalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.sm,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  goalIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    ...typography.titleSmall,
    fontSize: 13,
    color: colors.ink,
  },
  goalDeadline: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
    marginTop: 2,
  },
  goalAmountsRight: {
    alignItems: 'flex-end',
  },
  goalAmountText: {
    ...typography.monoMedium,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  goalTargetText: {
    color: colors.ink3,
    fontWeight: '400',
  },
  goalPercentageBadge: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.secondary,
    fontWeight: '700',
    marginTop: 2,
  },
  goalProgressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
  },
});
