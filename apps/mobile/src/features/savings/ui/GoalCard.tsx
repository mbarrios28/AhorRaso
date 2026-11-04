import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { SavingsGoalWithSimulation } from '../domain/types';
import { formatSimulationPeriodLabel } from '../domain/simulation';

export interface GoalCardProps {
  goal: SavingsGoalWithSimulation;
  onAddProgress: (goal: SavingsGoalWithSimulation) => void;
  onDelete: (goal: SavingsGoalWithSimulation) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  onAddProgress,
  onDelete,
}) => {
  const currentSol = (goal.currentAmountCents / 100).toFixed(2);
  const targetSol = (goal.targetAmountCents / 100).toFixed(2);
  const periodicSol = (goal.periodicSavingsCents / 100).toFixed(2);
  const pct = Math.min(100, Math.max(0, goal.simulation.progressPercentage));

  const formatFrequencyLabel = (freq: string) => {
    switch (freq) {
      case 'weekly':
        return 'Semanal';
      case 'biweekly':
        return 'Quincenal';
      case 'monthly':
      default:
        return 'Mensual';
    }
  };

  const isCompleted = goal.status === 'completed' || goal.simulation.isCompleted;

  return (
    <View style={styles.cardContainer}>
      {/* Cabecera: Título, Frecuencia y Acciones */}
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <View style={styles.iconBox}>
            <Icon
              name={isCompleted ? 'CheckCircle2' : 'Target'}
              size={18}
              color={isCompleted ? colors.secondary : colors.primary}
            />
          </View>
          <View style={styles.nameColumn}>
            <Text style={styles.goalName} numberOfLines={1}>
              {goal.name}
            </Text>
            <View style={styles.badgesRow}>
              <View style={styles.freqBadge}>
                <Text style={styles.freqBadgeText}>
                  {formatFrequencyLabel(goal.frequency)}
                </Text>
              </View>
              {isCompleted ? (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>Completada</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.actionButtons}>
          {!isCompleted && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abonar a la meta ${goal.name}`}
              hitSlop={8}
              onPress={() => onAddProgress(goal)}
              style={[styles.iconBtn, styles.addBtn]}
            >
              <Icon name="Plus" size={16} color={colors.primary} />
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar meta ${goal.name}`}
            hitSlop={8}
            onPress={() => onDelete(goal)}
            style={[styles.iconBtn, styles.deleteBtn]}
          >
            <Icon name="Trash2" size={16} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      {/* Montos y Progreso */}
      <View style={styles.amountsRow}>
        <Text style={styles.currentAmountText}>
          S/ {currentSol}
          <Text style={styles.targetAmountText}> / S/ {targetSol}</Text>
        </Text>
        <Text
          style={[
            styles.percentageText,
            isCompleted && { color: colors.secondary, fontWeight: '700' },
          ]}
        >
          {pct}%
        </Text>
      </View>

      {/* Barra de Progreso */}
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${pct}%`,
              backgroundColor: isCompleted ? colors.secondary : colors.primary,
            },
          ]}
        />
      </View>

      {/* Proyección y Cuota Periódica (RF-014) */}
      <View style={styles.projectionCard}>
        <View style={styles.projectionRow}>
          <View style={styles.projectionItem}>
            <Text style={styles.projectionLabel}>Cuota de ahorro</Text>
            <Text style={styles.projectionValue}>S/ {periodicSol}</Text>
          </View>

          <View style={styles.projectionDivider} />

          <View style={styles.projectionItem}>
            <Text style={styles.projectionLabel}>Tiempo estimado</Text>
            <Text style={styles.projectionValue}>
              {isCompleted
                ? 'Completado'
                : formatSimulationPeriodLabel(
                    goal.simulation.periodsNeeded,
                    goal.frequency
                  )}
            </Text>
          </View>

          <View style={styles.projectionDivider} />

          <View style={styles.projectionItem}>
            <Text style={styles.projectionLabel}>Fecha estimada</Text>
            <Text style={styles.projectionValue}>
              {goal.simulation.estimatedDate}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameColumn: {
    flex: 1,
    gap: 2,
  },
  goalName: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  freqBadge: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  freqBadgeText: {
    ...typography.monoSmall,
    color: colors.ink2,
  },
  completedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  completedBadgeText: {
    ...typography.monoSmall,
    color: colors.secondary,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    borderColor: 'rgba(14, 163, 113, 0.4)',
  },
  deleteBtn: {
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  currentAmountText: {
    ...typography.amountLarge,
    color: colors.ink,
  },
  targetAmountText: {
    ...typography.bodyMedium,
    color: colors.ink3,
    fontWeight: 'normal',
  },
  percentageText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  projectionCard: {
    marginTop: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  projectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectionItem: {
    flex: 1,
    alignItems: 'center',
  },
  projectionLabel: {
    ...typography.monoSmall,
    color: colors.ink3,
    marginBottom: 2,
  },
  projectionValue: {
    ...typography.bodySmall,
    color: colors.ink,
    fontWeight: '600',
  },
  projectionDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.line,
  },
});
