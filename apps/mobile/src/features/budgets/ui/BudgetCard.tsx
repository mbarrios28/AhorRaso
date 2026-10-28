import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { BudgetWithCategory } from '../domain/types';

export interface BudgetCardProps {
  budget: BudgetWithCategory;
  onEdit: (budget: BudgetWithCategory) => void;
  onDelete: (budget: BudgetWithCategory) => void;
}

export const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  onEdit,
  onDelete,
}) => {
  const limitAmount = (budget.amountCents / 100).toFixed(2);
  const spentAmount = (budget.spentCents / 100).toFixed(2);
  const pct =
    budget.amountCents > 0
      ? Math.min(100, Math.round((budget.spentCents / budget.amountCents) * 100))
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

  const getBarColor = () => {
    if (pct >= 100) return colors.danger;
    if (pct >= 80) return colors.tertiary;
    return budget.categoryColor || colors.primary;
  };

  return (
    <View style={styles.cardContainer}>
      <View style={styles.mainRow}>
        {/* Icono de la categoría */}
        <View
          style={[
            styles.catIconBox,
            { borderColor: colors.line, backgroundColor: colors.surface2 },
          ]}
        >
          <Icon
            name={budget.categoryIcon || 'Tag'}
            size={18}
            color={budget.categoryColor || colors.primary}
          />
        </View>

        {/* Información central */}
        <View style={styles.catInfo}>
          <View style={styles.catHeader}>
            <View style={styles.catTitleRow}>
              <Text style={styles.catName} numberOfLines={1}>
                {budget.categoryName}
              </Text>
              <View style={styles.periodBadge}>
                <Text style={styles.periodBadgeText}>
                  {formatPeriodLabel(budget.periodType)}
                </Text>
              </View>
            </View>

            {/* Acciones de Edición y Eliminación */}
            <View style={styles.actionButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar presupuesto de ${budget.categoryName}`}
                hitSlop={8}
                onPress={() => onEdit(budget)}
                style={styles.iconBtn}
              >
                <Icon name="Pencil" size={15} color={colors.ink2} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Eliminar presupuesto de ${budget.categoryName}`}
                hitSlop={8}
                onPress={() => onDelete(budget)}
                style={[styles.iconBtn, styles.deleteIconBtn]}
              >
                <Icon name="Trash2" size={15} color={colors.danger} />
              </Pressable>
            </View>
          </View>

          {/* Monto tope */}
          <Text style={styles.catLimit}>Tope: S/ {limitAmount}</Text>

          {/* Barra de progreso de consumo */}
          <View style={styles.catBarBg}>
            <View
              style={[
                styles.catBarFill,
                {
                  width: `${pct}%`,
                  backgroundColor: getBarColor(),
                },
              ]}
            />
          </View>

          {/* Footer con gasto actual y fechas del periodo activo */}
          <View style={styles.catFooter}>
            <Text
              style={[
                styles.catSpentText,
                pct >= 100 && { color: colors.danger, fontWeight: '700' },
              ]}
            >
              Gastado: S/ {spentAmount} ({pct}%)
            </Text>
            <Text style={styles.catPeriodDates}>
              {budget.periodStart} - {budget.periodEnd}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  catIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
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
    flex: 1,
    marginRight: spacing.xs,
  },
  catName: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
    flexShrink: 1,
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
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIconBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
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
    marginTop: 2,
  },
  catBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  catFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
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
});
