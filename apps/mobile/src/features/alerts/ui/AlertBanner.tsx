import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { BudgetAlertTriggered } from '../domain/types';

interface AlertBannerProps {
  alerts: BudgetAlertTriggered[];
  onDismiss?: (alertId?: string) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onDismiss }) => {
  if (alerts.length === 0) return null;

  return (
    <View style={styles.container}>
      {alerts.map((alert) => {
        const isOverBudget = alert.thresholdPercent >= 100;
        const isWarning = alert.thresholdPercent >= 80;

        const bannerColor = isOverBudget
          ? colors.danger
          : isWarning
          ? colors.tertiary
          : colors.primary;

        const title = isOverBudget
          ? `¡Límite superado en ${alert.categoryName}!`
          : isWarning
          ? `¡Cuidado! ${alert.thresholdPercent}% alcanzado en ${alert.categoryName}`
          : `Aviso: 50% de presupuesto en ${alert.categoryName}`;

        const spentFormatted = (alert.spentCents / 100).toFixed(2);
        const limitFormatted = (alert.budgetAmountCents / 100).toFixed(2);

        return (
          <View
            key={alert.id || `${alert.budgetId}-${alert.thresholdPercent}`}
            style={[styles.bannerCard, { borderLeftColor: bannerColor }]}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: `${bannerColor}20`, borderColor: bannerColor },
              ]}
            >
              <Icon
                name={isOverBudget ? 'AlertOctagon' : 'AlertTriangle'}
                size={18}
                color={bannerColor}
              />
            </View>

            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: bannerColor }]}>{title}</Text>
              <Text style={styles.message}>
                Has consumido S/ {spentFormatted} de tu tope de S/ {limitFormatted} (
                {alert.currentPercent}%).
              </Text>
            </View>

            {onDismiss ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Descartar alerta"
                hitSlop={8}
                onPress={() => onDismiss(alert.id)}
                style={styles.closeBtn}
              >
                <Icon name="X" size={16} color={colors.ink3} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginVertical: spacing.xxs,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodySmall,
    fontWeight: '700',
    fontSize: 12,
  },
  message: {
    ...typography.bodySmall,
    color: colors.ink2,
    fontSize: 11,
    lineHeight: 15,
  },
  closeBtn: {
    padding: spacing.xxs,
  },
});
