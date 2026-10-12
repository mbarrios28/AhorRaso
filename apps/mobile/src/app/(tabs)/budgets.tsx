import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { db, categories, Category } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import { eq } from 'drizzle-orm';

export default function BudgetsTab() {
  const [expenseCats, setExpenseCats] = useState<Category[]>([]);

  useFocusEffect(
    useCallback(() => {
      try {
        const list = db
          .select()
          .from(categories)
          .where(eq(categories.userId, DEV_USER_ID))
          .all()
          .filter((c) => c.type === 'expense');
        setExpenseCats(list);
      } catch (e) {
        console.error('Error al cargar categorías en presupuestos:', e);
      }
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Presupuestos</Text>
          <View style={styles.periodBadge}>
            <Text style={styles.periodText}>Octubre 2026</Text>
          </View>
        </View>

        {/* Card Resumen General */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>PRESUPUESTO MENSUAL</Text>
          <Text style={styles.summaryAmount}>S/ 350.00</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: '45%' }]} />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>Gastado: S/ 157.50 (45%)</Text>
            <Text style={[styles.progressText, { color: colors.secondary }]}>Disponible: S/ 192.50</Text>
          </View>
        </View>

        {/* Categorías con Presupuesto */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LÍMITES POR CATEGORÍA</Text>
          <View style={styles.categoryList}>
            {expenseCats.map((cat, index) => {
              // Valores ilustrativos para mostrar la maqueta de Dev B
              const limits = [120, 50, 60, 40, 50, 30];
              const limit = limits[index % limits.length];
              const pct = Math.min(100, (index + 2) * 15);

              return (
                <View key={cat.id} style={styles.categoryRow}>
                  <View style={[styles.catIconBox, { borderColor: colors.line }]}>
                    <Icon name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <View style={styles.catInfo}>
                    <View style={styles.catHeader}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      <Text style={styles.catLimit}>Tope: S/ {limit}</Text>
                    </View>
                    <View style={styles.catBarBg}>
                      <View
                        style={[
                          styles.catBarFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: pct > 80 ? colors.tertiary : cat.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>RF-006 & RF-010 · PRESUPUESTOS Y ALERTAS</Text>
          </View>
          <Text style={styles.infoText}>
            Asignado a Dev B para cálculo de sobregiro por periodos, disparadores pg_cron
            y notificaciones push automáticas al alcanzar el 80% y 100%.
          </Text>
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: {
    ...typography.titleLarge,
  },
  periodBadge: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  periodText: {
    ...typography.monoSmall,
    fontSize: 11,
    color: colors.ink2,
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
    backgroundColor: colors.primary,
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
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
    marginBottom: spacing.xxs,
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
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
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
  },
  catName: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  catLimit: {
    ...typography.monoSmall,
    color: colors.ink3,
    fontSize: 11,
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
    borderRadius: radius.xs,
  },
  infoBadgeText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.primary,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.ink2,
    lineHeight: 18,
  },
});
