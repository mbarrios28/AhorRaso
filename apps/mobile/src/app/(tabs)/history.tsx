import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { db, transactions, categories, Transaction, Category } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import { eq, desc, isNull, and } from 'drizzle-orm';

interface HistoryItem extends Transaction {
  category?: Category;
}

export default function HistoryTab() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [totalSpentCents, setTotalSpentCents] = useState(0);

  useFocusEffect(
    useCallback(() => {
      try {
        const txList = db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, DEV_USER_ID),
              isNull(transactions.deletedAt)
            )
          )
          .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
          .all();

        const allCats = db.select().from(categories).where(eq(categories.userId, DEV_USER_ID)).all();
        const catMap = new Map(allCats.map((c) => [c.id, c]));

        const enriched = txList.map((tx) => ({
          ...tx,
          category: catMap.get(tx.categoryId),
        }));

        setItems(enriched);

        const sum = txList
          .filter((t) => t.type === 'expense')
          .reduce((acc, curr) => acc + curr.amountCents, 0);
        setTotalSpentCents(sum);
      } catch (e) {
        console.error('Error al cargar historial:', e);
      }
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Historial de Movimientos</Text>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeLabel}>TOTAL EGRESOS</Text>
            <Text style={styles.totalBadgeValue}>
              S/ {(totalSpentCents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Lista */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TODAS LAS TRANSACCIONES</Text>
            <Text style={styles.countText}>{items.length} registros</Text>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.iconCircle}>
                <Icon name="ReceiptText" size={28} color={colors.ink3} />
              </View>
              <Text style={styles.emptyTitle}>Sin movimientos aún</Text>
              <Text style={styles.emptySubtitle}>
                Los gastos que registres con el botón (+) aparecerán auditados aquí.
              </Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {items.map((tx) => {
                const cat = tx.category;
                const formatted = (tx.amountCents / 100).toFixed(2);
                return (
                  <View key={tx.id} style={styles.row}>
                    <View style={[styles.iconBox, { borderColor: colors.line }]}>
                      <Icon
                        name={cat?.icon || 'Tag'}
                        size={18}
                        color={cat?.color || colors.primary}
                      />
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {cat?.name || 'Transacción'}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {tx.note || (tx.paymentMethod === 'cash' ? 'Efectivo' : 'Yape / Plin')} · {tx.occurredOn}
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>- S/ {formatted}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>RF-009 · HISTORIAL DE MOVIMIENTOS</Text>
          </View>
          <Text style={styles.infoText}>
            Asignado a Dev A para paginación por keyset, filtros por fecha y búsqueda por comercio.
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
    flex: 1,
  },
  totalBadge: {
    alignItems: 'flex-end',
  },
  totalBadgeLabel: {
    ...typography.labelSmall,
    fontSize: 9,
    color: colors.ink3,
  },
  totalBadgeValue: {
    ...typography.monoMedium,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  countText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    textAlign: 'center',
    maxWidth: 260,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  rowSub: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  rowAmount: {
    ...typography.monoMedium,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
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
