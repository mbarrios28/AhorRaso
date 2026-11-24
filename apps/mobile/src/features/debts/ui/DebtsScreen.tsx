import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import type { Debt } from '@/core/db/schema';
import { DEV_USER_ID } from '@/core/dev/constants';
import { colors, radius, spacing, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { debtsRepository } from '../data/debts.repository';
import { prioritizeDebts } from '../domain/prioritize';
import { type DebtStrategy, formatDebtDecimal } from '../domain/types';
import { DebtFormModal } from './DebtFormModal';

const strategies: { value: DebtStrategy; label: string }[] = [
  { value: 'snowball', label: 'Bola de nieve' },
  { value: 'avalanche', label: 'Avalancha' },
];

export function DebtsScreen() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [readError, setReadError] = useState(false);
  const [strategy, setStrategy] = useState<DebtStrategy>('avalanche');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    try {
      setDebts(debtsRepository.list(DEV_USER_ID));
      setReadError(false);
    } catch {
      setReadError(true);
    }
  }, []);

  useFocusEffect(load);
  const ordered = prioritizeDebts(debts, strategy);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Icon name="ArrowLeft" size={20} color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={typography.titleLarge}>Priorizar deudas</Text>
        <Text style={styles.secondary}>Elige un método para decidir a qué deuda destinar el dinero adicional.</Text>
        <Pressable accessibilityRole="button" onPress={() => setFormOpen(true)} style={styles.add}>
          <Icon name="Plus" size={18} color={colors.bg} />
          <Text style={styles.addText}>Registrar deuda</Text>
        </Pressable>

        <View style={styles.selector}>
          {strategies.map(({ value, label }) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: value === strategy }}
              style={[styles.option, value === strategy && styles.selected]}
              onPress={() => setStrategy(value)}
            >
              <Text style={typography.labelLarge}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {readError ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.secondary}>No se pudieron cargar tus deudas.</Text>
            <Pressable accessibilityRole="button" onPress={load} style={styles.option}>
              <Text style={typography.labelLarge}>Reintentar</Text>
            </Pressable>
          </View>
        ) : ordered.length === 0 ? (
          <View style={styles.card}>
            <Text style={typography.labelLarge}>Aún no tienes deudas registradas</Text>
            <Text style={styles.secondary}>Registra una deuda para empezar a ordenar tus prioridades.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.secondary}>
              Cubre primero los pagos mínimos exigidos. Luego destina el dinero adicional a la primera deuda.
            </Text>
            {ordered.map((debt, index) => (
              <View key={debt.id} style={[styles.card, index === 0 && styles.priority]}>
                <Text style={index === 0 ? styles.priorityLabel : styles.secondary}>
                  {index + 1}. {index === 0 ? 'Deuda prioritaria' : 'Prioridad'}
                </Text>
                <Text style={typography.labelLarge}>{debt.name}</Text>
                <Text style={styles.secondary}>Saldo pendiente  S/ {formatDebtDecimal(debt.outstandingBalanceCents)}</Text>
                <Text style={styles.secondary}>Tasa anual  {formatDebtDecimal(debt.annualInterestRateBps)} %</Text>
                <Text style={styles.secondary}>Pago mínimo  S/ {formatDebtDecimal(debt.minimumPaymentCents)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
      {formOpen && (
        <DebtFormModal
          onClose={() => setFormOpen(false)}
          onSave={(input) => {
            debtsRepository.create(DEV_USER_ID, input);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.gutter, gap: spacing.md },
  back: { alignSelf: 'flex-start', padding: spacing.md },
  secondary: { ...typography.labelMedium, color: colors.ink2 },
  add: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  addText: { ...typography.labelLarge, color: colors.bg },
  selector: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: { backgroundColor: colors.surface3, borderColor: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.xs,
  },
  priority: { borderColor: colors.primary },
  priorityLabel: { ...typography.labelMedium, color: colors.secondary },
});
