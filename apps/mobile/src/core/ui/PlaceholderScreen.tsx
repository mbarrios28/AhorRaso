import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from './Icon';

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
  iconName: string;
  devAssigned: string;
  rfCode: string;
}

/**
 * Pantalla placeholder limpia para secciones en desarrollo por otros miembros del equipo.
 * Respeta el Design System de Stitch para mantener la coherencia en toda la app.
 */
export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({
  title,
  subtitle,
  iconName,
  devAssigned,
  rfCode,
}) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        {/* Card Informativa */}
        <View style={styles.centerContent}>
          <View style={styles.iconContainer}>
            <Icon name={iconName} size={32} color={colors.primary} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{rfCode}</Text>
            </View>
            <View style={[styles.badge, styles.devBadge]}>
              <Text style={[styles.badgeText, styles.devBadgeText]}>{devAssigned}</Text>
            </View>
          </View>
        </View>
      </View>
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
    padding: spacing.gutter,
  },
  header: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: spacing.xxl,
  },
  headerTitle: {
    ...typography.titleLarge,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xxxl,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    ...typography.titleMedium,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    textAlign: 'center',
    color: colors.ink2,
    maxWidth: 280,
    marginBottom: spacing.base,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.labelSmall,
    color: colors.primary,
  },
  devBadge: {
    backgroundColor: colors.surface,
  },
  devBadgeText: {
    color: colors.ink3,
  },
});
