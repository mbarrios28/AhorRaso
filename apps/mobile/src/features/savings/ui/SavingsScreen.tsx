import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { SavingsGoalWithSimulation } from '../domain/types';
import { savingsRepository } from '../data/savings.repository';
import { GoalCard } from './GoalCard';
import { CreateGoalModal } from './CreateGoalModal';
import { AddProgressModal } from './AddProgressModal';

export const SavingsScreen: React.FC = () => {
  const [activeGoals, setActiveGoals] = useState<SavingsGoalWithSimulation[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoalWithSimulation | null>(null);

  const loadGoals = useCallback(() => {
    try {
      const list = savingsRepository.listActive(DEV_USER_ID);
      setActiveGoals(list);
    } catch (e) {
      console.error('Error al cargar metas de ahorro:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  // Métricas agregadas
  const totalSavedCents = activeGoals.reduce((sum, g) => sum + g.currentAmountCents, 0);
  const totalTargetCents = activeGoals.reduce((sum, g) => sum + g.targetAmountCents, 0);
  const overallPercentage =
    totalTargetCents > 0
      ? Math.min(100, Math.round((totalSavedCents / totalTargetCents) * 100))
      : 0;

  const handleOpenAddProgress = (goal: SavingsGoalWithSimulation) => {
    setSelectedGoal(goal);
    setProgressModalVisible(true);
  };

  const handleDeleteGoal = (goal: SavingsGoalWithSimulation) => {
    const executeDelete = () => {
      try {
        savingsRepository.delete(DEV_USER_ID, goal.id);
        loadGoals();
      } catch (e) {
        console.error('Error al eliminar meta de ahorro:', e);
        if (Platform.OS === 'web') {
          window.alert('No se pudo eliminar la meta seleccionada.');
        } else {
          Alert.alert('Error', 'No se pudo eliminar la meta seleccionada.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(`¿Estás seguro de que deseas eliminar la meta "${goal.name}"?`);
      if (confirmed) {
        executeDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Meta',
        `¿Estás seguro de que deseas eliminar la meta "${goal.name}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Encabezado */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Metas de Ahorro
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
              Proyección y disciplina financiera (RF-007 / RF-014)
            </Text>
          </View>

          <Pressable
            style={styles.createButton}
            onPress={() => setCreateModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Crear nueva meta de ahorro"
          >
            <Icon name="Plus" size={16} color="#0D0D0F" strokeWidth={2.5} />
            <Text style={styles.createButtonText}>Nueva Meta</Text>
          </Pressable>
        </View>

        {/* Resumen Agregado (si hay metas activas) */}
        {activeGoals.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryIconBox}>
                <Icon name="PiggyBank" size={20} color={colors.secondary} />
              </View>
              <View style={styles.summaryTitleCol}>
                <Text style={styles.summaryLabel}>Total acumulado en metas</Text>
                <Text style={styles.summaryAmount}>
                  S/ {(totalSavedCents / 100).toFixed(2)}
                  <Text style={styles.summaryTarget}>
                    {' '}
                    / S/ {(totalTargetCents / 100).toFixed(2)}
                  </Text>
                </Text>
              </View>
            </View>

            <View style={styles.summaryBarBg}>
              <View
                style={[
                  styles.summaryBarFill,
                  {
                    width: `${overallPercentage}%`,
                    backgroundColor: colors.secondary,
                  },
                ]}
              />
            </View>

            <View style={styles.summaryFooter}>
              <Text style={styles.summaryFooterText}>
                {activeGoals.length} {activeGoals.length === 1 ? 'meta activa' : 'metas activas'}
              </Text>
              <Text style={styles.summaryFooterPct}>{overallPercentage}% completado</Text>
            </View>
          </View>
        )}

        {/* Lista de Metas o Empty State */}
        {activeGoals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Icon name="Target" size={40} color={colors.ink3} />
            </View>
            <Text style={styles.emptyTitle}>Sin metas de ahorro activas</Text>
            <Text style={styles.emptyDescription}>
              Define tus objetivos (fondo de emergencia, viajes, compras importantes) y simula tu
              tiempo de ahorro en tiempo real.
            </Text>
            <Pressable
              style={styles.emptyCtaButton}
              onPress={() => setCreateModalVisible(true)}
            >
              <Icon name="Plus" size={18} color="#0D0D0F" strokeWidth={2.5} />
              <Text style={styles.emptyCtaText}>Crear Primera Meta</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.goalsList}>
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onAddProgress={handleOpenAddProgress}
                onDelete={handleDeleteGoal}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal de Creación */}
      <CreateGoalModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSaved={() => {
          setCreateModalVisible(false);
          loadGoals();
        }}
      />

      {/* Modal de Abono */}
      <AddProgressModal
        visible={progressModalVisible}
        goal={selectedGoal}
        onClose={() => {
          setProgressModalVisible(false);
          setSelectedGoal(null);
        }}
        onSaved={() => {
          setProgressModalVisible(false);
          setSelectedGoal(null);
          loadGoals();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    padding: spacing.base,
    paddingBottom: spacing.xl * 2,
    gap: spacing.base,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  headerTitle: {
    ...typography.titleLarge,
    color: colors.ink,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  createButtonText: {
    ...typography.titleSmall,
    color: '#0D0D0F',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryIconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitleCol: {
    flex: 1,
  },
  summaryLabel: {
    ...typography.monoSmall,
    color: colors.ink3,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    ...typography.amountLarge,
    color: colors.ink,
    marginTop: 2,
  },
  summaryTarget: {
    ...typography.bodyMedium,
    color: colors.ink3,
    fontWeight: 'normal',
  },
  summaryBarBg: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 4,
  },
  summaryBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryFooterText: {
    ...typography.monoSmall,
    color: colors.ink2,
  },
  summaryFooterPct: {
    ...typography.monoSmall,
    color: colors.secondary,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.sm,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.titleMedium,
    color: colors.ink,
  },
  emptyDescription: {
    ...typography.bodyMedium,
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  emptyCtaText: {
    ...typography.titleSmall,
    color: '#0D0D0F',
    fontWeight: '700',
  },
  goalsList: {
    gap: spacing.sm,
  },
});
