import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { db, profile, transactions, categories, Profile, Transaction, Category } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import { eq, desc } from 'drizzle-orm';

interface TransactionWithCategory extends Transaction {
  category?: Category;
}

export default function DashboardScreen() {
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<TransactionWithCategory[]>([]);

  // useFocusEffect se ejecuta cada vez que el usuario vuelve a esta pantalla (ej. tras guardar un gasto)
  useFocusEffect(
    useCallback(() => {
      try {
        // 1. Cargar saldo actualizado
        const p = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
        if (p) setUserProfile(p);

        // 2. Cargar transacciones recientes con su categoría
        const txList = db
          .select()
          .from(transactions)
          .where(eq(transactions.userId, DEV_USER_ID))
          .orderBy(desc(transactions.createdAt))
          .limit(10)
          .all();

        const allCategories = db.select().from(categories).where(eq(categories.userId, DEV_USER_ID)).all();
        const catMap = new Map(allCategories.map((c) => [c.id, c]));

        const enriched: TransactionWithCategory[] = txList.map((tx) => ({
          ...tx,
          category: catMap.get(tx.categoryId),
        }));

        setRecentExpenses(enriched);
      } catch (e) {
        console.error('Error al actualizar datos del dashboard:', e);
      }
    }, [])
  );

  const balance = userProfile ? (userProfile.initialBalanceCents / 100).toFixed(2) : '0.00';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Superior */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {userProfile?.displayName || 'Estudiante'}</Text>
            <Text style={styles.campus}>UNSA · Arequipa</Text>
          </View>
          <View style={styles.headerAction}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Offline-First</Text>
          </View>
        </View>

        {/* Card Principal de Saldo */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>SALDO DISPONIBLE</Text>
          <Text style={styles.balanceAmount}>S/ {balance}</Text>
          <View style={styles.balanceFooter}>
            <Text style={styles.balanceFooterText}>
              {recentExpenses.length} transacciones registradas localmente
            </Text>
          </View>
        </View>

        {/* CTA Rápido para Nuevo Gasto (RF-002) */}
        <Pressable
          onPress={() => router.push('/new-expense')}
          style={({ pressed }) => [
            styles.ctaCard,
            pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
          ]}
        >
          <View style={styles.ctaIcon}>
            <Icon name="Plus" size={20} color="#0D0D0F" strokeWidth={2.4} />
          </View>
          <View style={styles.ctaContent}>
            <Text style={styles.ctaTitle}>Registrar nuevo gasto</Text>
            <Text style={styles.ctaSubtitle}>Captura rápida en punto de venta (RF-002)</Text>
          </View>
          <Icon name="ChevronRight" size={18} color={colors.ink3} />
        </Pressable>

        {/* Lista de Movimientos Recientes */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>ÚLTIMOS MOVIMIENTOS</Text>
            <Text style={styles.sectionHint}>SQLite local</Text>
          </View>

          {recentExpenses.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="Receipt" size={28} color={colors.ink3} />
              <Text style={styles.emptyText}>Aún no has registrado gastos hoy.</Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {recentExpenses.map((tx) => {
                const cat = tx.category;
                const formattedAmount = (tx.amountCents / 100).toFixed(2);
                return (
                  <View key={tx.id} style={styles.txRow}>
                    <View
                      style={[
                        styles.txIconBox,
                        { backgroundColor: colors.surface2, borderColor: colors.line },
                      ]}
                    >
                      <Icon
                        name={cat?.icon || 'Tag'}
                        size={18}
                        color={cat?.color || colors.primary}
                      />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txCategoryName} numberOfLines={1}>
                        {cat?.name || 'Gasto'}
                      </Text>
                      <Text style={styles.txMeta} numberOfLines={1}>
                        {tx.note || (tx.paymentMethod === 'cash' ? 'Efectivo' : 'Yape / Plin')} · {tx.occurredOn}
                      </Text>
                    </View>
                    <Text style={styles.txAmount}>
                      - S/ {formattedAmount}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Nota del Monorepo / Módulo */}
        <View style={styles.infoSection}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>RF-008 · DASHBOARD FINANCIERO</Text>
          </View>
          <Text style={styles.infoTitle}>Módulo Compartido</Text>
          <Text style={styles.infoText}>
            Esta vista servirá como contenedor para las métricas de consumo y presupuestos
            de Dev A y Dev B.
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
    paddingTop: spacing.xs,
    marginBottom: spacing.xs,
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
  balanceLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
    marginBottom: spacing.xs,
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
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  ctaIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContent: {
    flex: 1,
  },
  ctaTitle: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  ctaSubtitle: {
    ...typography.bodySmall,
    color: colors.ink2,
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
  transactionsList: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
  },
  txCategoryName: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  txMeta: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    ...typography.monoMedium,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.xs,
    marginTop: spacing.sm,
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
  infoTitle: {
    ...typography.titleSmall,
    marginTop: spacing.xs,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.ink2,
    lineHeight: 18,
  },
});
