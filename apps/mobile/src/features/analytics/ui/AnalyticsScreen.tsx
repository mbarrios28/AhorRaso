import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import {
  ConsumptionAnalysisReport,
  RecommendationPriority,
  SavingsRecommendation,
} from '../domain/types';
import { analyticsRepository } from '../data/analytics.repository';

function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

function getPriorityStyle(priority: RecommendationPriority): {
  label: string;
  bg: string;
  border: string;
  color: string;
  icon: string;
} {
  switch (priority) {
    case 'high':
      return {
        label: 'ALTO IMPACTO',
        bg: 'rgba(223, 108, 107, 0.14)',
        border: 'rgba(223, 108, 107, 0.35)',
        color: colors.tertiary,
        icon: 'Flame',
      };
    case 'medium':
      return {
        label: 'OPORTUNIDAD',
        bg: 'rgba(245, 158, 11, 0.14)',
        border: 'rgba(245, 158, 11, 0.35)',
        color: colors.warning,
        icon: 'Sparkles',
      };
    case 'low':
    default:
      return {
        label: 'HÁBITO INTELIGENTE',
        bg: 'rgba(34, 197, 94, 0.12)',
        border: 'rgba(34, 197, 94, 0.3)',
        color: colors.secondary,
        icon: 'CheckCircle2',
      };
  }
}

export const AnalyticsScreen: React.FC = () => {
  const [report, setReport] = useState<ConsumptionAnalysisReport | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        const data = analyticsRepository.getConsumptionReport(DEV_USER_ID);
        setReport(data);
      } catch (e) {
        console.error('Error al cargar reporte de análisis:', e);
      }
    }, [])
  );

  const handleRefresh = () => {
    try {
      const fresh = analyticsRepository.getConsumptionReport(DEV_USER_ID, new Date(), {
        forceRefresh: true,
      });
      setReport(fresh);
    } catch (e) {
      console.error('Error al recalcular reporte:', e);
    }
  };

  const maxWeekdayCents =
    report?.weekdayBreakdown.reduce((max, d) => Math.max(max, d.totalCents), 0) ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Cabecera */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio"
        >
          <Icon name="ArrowLeft" size={20} color={colors.ink} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Análisis e Insights</Text>
          <Text style={styles.headerSubtitle}>
            {report ? `${report.periodMonthName} ${report.periodYear}` : 'Patrones y Ahorro'}
          </Text>
        </View>

        <Pressable
          onPress={handleRefresh}
          style={styles.aiBadgeBtn}
          accessibilityRole="button"
          accessibilityLabel="Actualizar análisis"
        >
          <Icon name="Sparkles" size={14} color={colors.primary} />
          <Text style={styles.aiBadgeText}>IA Local</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {!report || !report.hasEnoughData ? (
          /* Estado vacío amigable cuando aún no hay gastos en el mes */
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Icon name="Sparkles" size={28} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              Aún no hay suficientes gastos para analizar
            </Text>
            <Text style={styles.emptySubtitle}>
              Registra tus compras diarias por voz o manualmente para que el motor
              analítico detecte gastos hormiga, variaciones mensuales y oportunidades de
              ahorro.
            </Text>
            <Pressable
              onPress={() => router.push('/new-expense')}
              style={styles.emptyCtaBtn}
              accessibilityRole="button"
              accessibilityLabel="Registrar mi primer gasto"
            >
              <Icon name="Plus" size={16} color="#0D0D0F" />
              <Text style={styles.emptyCtaText}>Registrar gasto</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 1. Resumen Ejecutivo del Periodo */}
            <View style={styles.heroSummaryCard}>
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={styles.heroLabel}>
                    GASTO ANALIZADO ({report.periodMonthName.toUpperCase()})
                  </Text>
                  <Text style={styles.heroAmount}>
                    {formatSoles(report.totalExpenseCents)}
                  </Text>
                </View>

                {report.monthlyComparison.hasPreviousMonthData ? (
                  <View
                    style={[
                      styles.deltaBadge,
                      report.monthlyComparison.deltaCents > 0
                        ? styles.deltaBadgeUp
                        : styles.deltaBadgeDown,
                    ]}
                  >
                    <Icon
                      name={
                        report.monthlyComparison.deltaCents > 0
                          ? 'TrendingUp'
                          : 'TrendingDown'
                      }
                      size={13}
                      color={
                        report.monthlyComparison.deltaCents > 0
                          ? colors.tertiary
                          : colors.secondary
                      }
                    />
                    <Text
                      style={[
                        styles.deltaBadgeText,
                        {
                          color:
                            report.monthlyComparison.deltaCents > 0
                              ? colors.tertiary
                              : colors.secondary,
                        },
                      ]}
                    >
                      {report.monthlyComparison.deltaPercentage > 0 ? '+' : ''}
                      {report.monthlyComparison.deltaPercentage}% vs. mes ant.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.deltaBadgeNeutral}>
                    <Text style={styles.deltaBadgeNeutralText}>
                      {report.transactionCount}{' '}
                      {report.transactionCount === 1 ? 'compra' : 'compras'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Bloque destacado de Ahorro Potencial Identificado */}
              <View style={styles.potentialSavingsBanner}>
                <View style={styles.potentialLeft}>
                  <View style={styles.potentialIconBox}>
                    <Icon name="PiggyBank" size={18} color="#0D0D0F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.potentialLabel}>
                      AHORRO POTENCIAL IDENTIFICADO
                    </Text>
                    <Text style={styles.potentialSubtext}>
                      Aplicando {report.recommendations.length}{' '}
                      {report.recommendations.length === 1
                        ? 'recomendación activa'
                        : 'recomendaciones activas'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.potentialAmount}>
                  +{formatSoles(report.totalPotentialSavingsCents)}
                  <Text style={styles.potentialUnit}>/mes</Text>
                </Text>
              </View>
            </View>

            {/* 2. Sección: Recomendaciones Inteligentes (RF-013) */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  RECOMENDACIONES INTELIGENTES
                </Text>
                <Text style={styles.sectionBadge}>RF-013 · ON-DEVICE</Text>
              </View>

              {report.recommendations.map((rec: SavingsRecommendation) => {
                const pStyle = getPriorityStyle(rec.priority);
                return (
                  <View key={rec.id} style={styles.recCard}>
                    <View style={styles.recHeaderRow}>
                      <View
                        style={[
                          styles.priorityChip,
                          {
                            backgroundColor: pStyle.bg,
                            borderColor: pStyle.border,
                          },
                        ]}
                      >
                        <Icon name={pStyle.icon} size={12} color={pStyle.color} />
                        <Text
                          style={[styles.priorityChipText, { color: pStyle.color }]}
                        >
                          {pStyle.label}
                        </Text>
                      </View>

                      {rec.estimatedMonthlySavingsCents > 0 && (
                        <View style={styles.recSavingsBadge}>
                          <Text style={styles.recSavingsText}>
                            Ahorra {formatSoles(rec.estimatedMonthlySavingsCents)}/mes
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.recTitle}>{rec.title}</Text>
                    <Text style={styles.recDescription}>{rec.description}</Text>

                    <View style={styles.tipBox}>
                      <Icon name="Lightbulb" size={15} color={colors.primary} />
                      <Text style={styles.tipText}>{rec.actionableTip}</Text>
                    </View>

                    {/* Acción rápida para vincular o abonar a meta de ahorro (/savings) */}
                    <View style={styles.recFooterRow}>
                      <Pressable
                        onPress={() => router.push('/savings')}
                        style={styles.recGoalBtn}
                        accessibilityRole="button"
                        accessibilityLabel={
                          rec.relatedGoalName
                            ? `Abonar a meta ${rec.relatedGoalName}`
                            : 'Vincular con una meta de ahorro'
                        }
                      >
                        <Icon name="Target" size={14} color={colors.secondary} />
                        <Text style={styles.recGoalBtnText}>
                          {rec.relatedGoalName
                            ? `Destinar a "${rec.relatedGoalName}"`
                            : 'Impulsar meta de ahorro'}
                        </Text>
                        <Icon name="ChevronRight" size={14} color={colors.secondary} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* 3. Sección: Detector de Gastos Hormiga (RF-012) */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>DETECTOR DE GASTOS HORMIGA</Text>
                <Text style={styles.sectionBadge}>
                  ≤ {formatSoles(report.antExpenses.thresholdCents)}
                </Text>
              </View>

              <View
                style={[
                  styles.antCard,
                  report.antExpenses.detected && styles.antCardDetected,
                ]}
              >
                <View style={styles.antTopRow}>
                  <View style={styles.antIconBox}>
                    <Icon
                      name={report.antExpenses.detected ? 'AlertTriangle' : 'ShieldCheck'}
                      size={20}
                      color={
                        report.antExpenses.detected ? colors.warning : colors.secondary
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.antTitle}>
                      {report.antExpenses.detected
                        ? `${report.antExpenses.occurrenceCount} micro-compras recurrentes detectadas`
                        : 'Gastos hormiga bajo control'}
                    </Text>
                    <Text style={styles.antSubtitle}>
                      {report.antExpenses.occurrenceCount > 0
                        ? `Representan el ${report.antExpenses.percentageOfMonthlySpend}% de tu gasto mensual (ticket prom. ${formatSoles(
                            report.antExpenses.averageAntCents
                          )})`
                        : 'No registras compras menores acumuladas en este periodo.'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.antTotalAmount,
                      {
                        color: report.antExpenses.detected
                          ? colors.warning
                          : colors.secondary,
                      },
                    ]}
                  >
                    {formatSoles(report.antExpenses.totalAntCents)}
                  </Text>
                </View>

                {report.antExpenses.byCategory.length > 0 && (
                  <View style={styles.antChipsRow}>
                    {report.antExpenses.byCategory.slice(0, 3).map((cat) => (
                      <View key={cat.categoryId} style={styles.antCategoryChip}>
                        <View
                          style={[
                            styles.antCatDot,
                            { backgroundColor: cat.categoryColor },
                          ]}
                        />
                        <Text style={styles.antCatText}>
                          {cat.categoryName}: {cat.count}x ({formatSoles(cat.totalCents)})
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* 4. Sección: Distribución y Variación por Categoría (RF-012) */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>CONCENTRACIÓN POR CATEGORÍA</Text>
                <Text style={styles.sectionBadge}>TOP CONSUMO</Text>
              </View>

              <View style={styles.categoriesCard}>
                {report.categoryPatterns.map((cat, idx) => {
                  const isLast = idx === report.categoryPatterns.length - 1;
                  const deltaInfo = report.monthlyComparison.categoryDeltas.find(
                    (d) => d.categoryId === cat.categoryId
                  );
                  const showDelta =
                    report.monthlyComparison.hasPreviousMonthData &&
                    deltaInfo &&
                    deltaInfo.previousMonthCents > 0;

                  return (
                    <View
                      key={cat.categoryId}
                      style={[
                        styles.catPatternRow,
                        !isLast && styles.catPatternRowBorder,
                      ]}
                    >
                      <View style={styles.catPatternHeader}>
                        <View style={styles.catPatternLeft}>
                          <View
                            style={[
                              styles.catIconBox,
                              { backgroundColor: colors.surface2 },
                            ]}
                          >
                            <Icon
                              name={cat.categoryIcon}
                              size={16}
                              color={cat.categoryColor}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.catPatternName} numberOfLines={1}>
                              {cat.categoryName}
                            </Text>
                            <Text style={styles.catPatternMeta}>
                              {cat.transactionCount}{' '}
                              {cat.transactionCount === 1 ? 'compra' : 'compras'} · Prom.{' '}
                              {formatSoles(cat.averageTicketCents)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.catPatternRight}>
                          <Text style={styles.catPatternAmount}>
                            {formatSoles(cat.totalCents)}
                          </Text>
                          <View style={styles.catSubMetaRow}>
                            <Text style={styles.catPatternPct}>
                              {cat.percentageOfTotal}%
                            </Text>
                            {showDelta && deltaInfo && (
                              <Text
                                style={[
                                  styles.catDeltaMini,
                                  {
                                    color:
                                      deltaInfo.deltaCents > 0
                                        ? colors.tertiary
                                        : colors.secondary,
                                  },
                                ]}
                              >
                                ({deltaInfo.deltaPercentage > 0 ? '+' : ''}
                                {deltaInfo.deltaPercentage}%)
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>

                      <View style={styles.catBarTrack}>
                        <View
                          style={[
                            styles.catBarFill,
                            {
                              width: `${Math.min(
                                100,
                                Math.max(4, cat.percentageOfTotal)
                              )}%`,
                              backgroundColor: cat.categoryColor || colors.primary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 5. Sección: Patrón Temporal y Día Pico de la Semana (RF-012) */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>RITMO SEMANAL Y DÍA PICO</Text>
                {report.peakDay && (
                  <Text style={styles.sectionBadge}>
                    PICO: {report.peakDay.dayName.toUpperCase()}
                  </Text>
                )}
              </View>

              <View style={styles.temporalCard}>
                {report.peakDay && (
                  <View style={styles.peakBannerRow}>
                    <Icon name="Calendar" size={16} color={colors.primary} />
                    <Text style={styles.peakBannerText}>
                      Tu mayor volumen de gasto ocurre los{' '}
                      <Text style={styles.peakHighlight}>{report.peakDay.dayName}</Text>{' '}
                      ({formatSoles(report.peakDay.totalCents)} ·{' '}
                      {report.peakDay.percentageOfTotal}% del total).
                    </Text>
                  </View>
                )}

                <View style={styles.weekdayBarsRow}>
                  {report.weekdayBreakdown.map((day) => {
                    const isPeak =
                      report.peakDay &&
                      report.peakDay.dayIndex === day.dayIndex &&
                      day.totalCents > 0;
                    const heightPct =
                      maxWeekdayCents > 0
                        ? Math.max(8, Math.round((day.totalCents / maxWeekdayCents) * 100))
                        : 8;

                    return (
                      <View key={day.dayIndex} style={styles.weekdayCol}>
                        <Text
                          style={[
                            styles.weekdayPctText,
                            isPeak && styles.weekdayPctTextPeak,
                          ]}
                        >
                          {day.percentageOfTotal}%
                        </Text>
                        <View style={styles.weekdayBarTrack}>
                          <View
                            style={[
                              styles.weekdayBarFill,
                              {
                                height: `${heightPct}%`,
                                backgroundColor: isPeak
                                  ? colors.primary
                                  : day.totalCents > 0
                                  ? colors.ink3
                                  : colors.surface3,
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.weekdayLabel,
                            isPeak && styles.weekdayLabelPeak,
                          ]}
                        >
                          {day.shortName}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    height: 56,
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...typography.monoSmall,
    color: colors.ink3,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  aiBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  aiBadgeText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  container: {
    padding: spacing.gutter,
    paddingBottom: spacing.xxxl,
    gap: spacing.base,
  },
  heroSummaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heroLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
    fontSize: 10.5,
  },
  heroAmount: {
    ...typography.amountLarge,
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 2,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  deltaBadgeUp: {
    backgroundColor: 'rgba(223, 108, 107, 0.12)',
    borderColor: 'rgba(223, 108, 107, 0.3)',
  },
  deltaBadgeDown: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  deltaBadgeText: {
    ...typography.monoSmall,
    fontSize: 10.5,
    fontWeight: '700',
  },
  deltaBadgeNeutral: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  deltaBadgeNeutralText: {
    ...typography.monoSmall,
    fontSize: 10.5,
    color: colors.ink2,
  },
  potentialSavingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.32)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  potentialLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  potentialIconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  potentialLabel: {
    ...typography.labelSmall,
    color: colors.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  potentialSubtext: {
    ...typography.bodySmall,
    color: colors.ink2,
    fontSize: 11.5,
  },
  potentialAmount: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 17,
    color: colors.secondary,
  },
  potentialUnit: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 11,
    color: colors.ink3,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  sectionBadge: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
  },
  recCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  recHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  priorityChipText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
  recSavingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  recSavingsText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 10.5,
    color: colors.secondary,
  },
  recTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    fontSize: 14.5,
    fontWeight: '700',
    marginTop: 2,
  },
  recDescription: {
    ...typography.bodySmall,
    color: colors.ink2,
    lineHeight: 18,
    fontSize: 12.5,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  tipText: {
    ...typography.bodySmall,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  recFooterRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  recGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  recGoalBtnText: {
    ...typography.labelSmall,
    color: colors.secondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  antCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.sm,
  },
  antCardDetected: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  antTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  antIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  antTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '700',
  },
  antSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11.5,
    marginTop: 2,
  },
  antTotalAmount: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
  },
  antChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  antCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
  },
  antCatDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  antCatText: {
    ...typography.monoSmall,
    color: colors.ink2,
    fontSize: 10.5,
  },
  categoriesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.md,
  },
  catPatternRow: {
    gap: spacing.xs,
  },
  catPatternRowBorder: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  catPatternHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catPatternLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  catIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPatternName: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  catPatternMeta: {
    ...typography.monoSmall,
    color: colors.ink3,
    fontSize: 10.5,
  },
  catPatternRight: {
    alignItems: 'flex-end',
  },
  catPatternAmount: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  catSubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  catPatternPct: {
    ...typography.monoSmall,
    fontSize: 10.5,
    color: colors.ink3,
  },
  catDeltaMini: {
    ...typography.monoSmall,
    fontSize: 10.5,
    fontWeight: '700',
  },
  catBarTrack: {
    width: '100%',
    height: 5,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  temporalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.md,
  },
  peakBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  peakBannerText: {
    ...typography.bodySmall,
    color: colors.ink2,
    fontSize: 12,
    flex: 1,
  },
  peakHighlight: {
    color: colors.primary,
    fontWeight: '700',
  },
  weekdayBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 110,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  weekdayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weekdayPctText: {
    ...typography.monoSmall,
    fontSize: 9.5,
    color: colors.ink3,
  },
  weekdayPctTextPeak: {
    color: colors.primary,
    fontWeight: '700',
  },
  weekdayBarTrack: {
    width: 18,
    height: 64,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weekdayBarFill: {
    width: '100%',
    borderRadius: radius.sm,
  },
  weekdayLabel: {
    ...typography.monoSmall,
    fontSize: 11,
    color: colors.ink3,
  },
  weekdayLabelPeak: {
    color: colors.primary,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    textAlign: 'center',
    fontSize: 15,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyCtaBtn: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  emptyCtaText: {
    ...typography.labelMedium,
    color: '#0D0D0F',
    fontWeight: '700',
  },
});
