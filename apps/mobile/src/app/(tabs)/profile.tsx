import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { NotificationSettingsModal } from '@/features/alerts';
import { db, profile } from '@/core/db';
import { DEV_USER_ID, LEGACY_DEMO_PROFILE_NAME } from '@/core/dev/constants';
import { eq } from 'drizzle-orm';
import { BiometricSettings } from '@/features/security/ui/BiometricSettings';
import { PinSettings } from '@/features/security/ui/PinSettings';
import { useSecurity } from '@/features/security/ui/AuthSession';

const profileFields = {
  displayName: profile.displayName,
  currency: profile.currency,
  locale: profile.locale,
  timezone: profile.timezone,
};

export default function ProfileTab() {
  const { lock } = useSecurity();
  const [userProfile, setUserProfile] = useState<Pick<typeof profile.$inferSelect, keyof typeof profileFields> | null>(null);
  const [alertsModalVisible, setAlertsModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      try {
        const p = db.select(profileFields).from(profile).where(eq(profile.id, DEV_USER_ID)).get();
        if (p) setUserProfile(p);
      } catch (e) {
        console.error('Error al cargar perfil:', e);
      }
    }, [])
  );

  const displayName = userProfile?.displayName === LEGACY_DEMO_PROFILE_NAME ? null : userProfile?.displayName;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.backButton, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Volver a Inicio"
          >
            <Icon name="ArrowLeft" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Perfil y Ajustes</Text>
        </View>

        {/* Tarjeta de Usuario */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {displayName?.charAt(0) || 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName || 'Usuario'}</Text>
          </View>
        </View>

        {/* Preferencias Locales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCIAS REGIONALES</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="Coins" size={18} color={colors.ink2} />
                <Text style={styles.rowLabel}>Moneda</Text>
              </View>
              <Text style={styles.rowValue}>{userProfile?.currency || 'PEN'} (S/)</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="Globe" size={18} color={colors.ink2} />
                <Text style={styles.rowLabel}>Idioma y Región</Text>
              </View>
              <Text style={styles.rowValue}>{userProfile?.locale || 'es-PE'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="Clock" size={18} color={colors.ink2} />
                <Text style={styles.rowLabel}>Zona Horaria</Text>
              </View>
              <Text style={styles.rowValue}>{userProfile?.timezone || 'America/Lima'}</Text>
            </View>
          </View>
        </View>

        {/* Categorías (RF-005) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CATEGORÍAS</Text>
          <Pressable
            onPress={() => router.push('/categories')}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Gestionar categorías"
          >
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="Tags" size={18} color={colors.primary} />
                <Text style={styles.rowLabel}>Gestionar categorías</Text>
              </View>
              <Icon name="ChevronRight" size={18} color={colors.ink3} />
            </View>
          </Pressable>
        </View>

        {/* Alertas y Umbrales (RF-010 / RF-011) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ALERTAS Y NOTIFICACIONES</Text>
          <Pressable
            onPress={() => setAlertsModalVisible(true)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Configurar alertas y umbrales de presupuesto"
          >
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="Bell" size={18} color={colors.primary} />
                <Text style={styles.rowLabel}>Configurar alertas y umbrales</Text>
              </View>
              <Icon name="ChevronRight" size={18} color={colors.ink3} />
            </View>
          </Pressable>
        </View>

        {/* Seguridad y Datos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SEGURIDAD Y ACCESO</Text>
          <View style={styles.card}>
            <PinSettings />
            <View style={styles.divider} />
            <BiometricSettings />
            <View style={styles.divider} />
            <Text style={styles.securityHint}>AhorRaso se bloquea tras un minuto de inactividad.</Text>
            <Pressable accessibilityRole="button" onPress={lock} style={styles.row}>
              <Text style={styles.rowLabel}>Bloquear sesión</Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>
      {/* Modal de Configuración de Alertas y Umbrales (RF-010) */}
      <NotificationSettingsModal
        visible={alertsModalVisible}
        onClose={() => setAlertsModalVisible(false)}
      />
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
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleLarge,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface2,
    borderColor: colors.lineFocus,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.titleMedium,
    color: colors.primary,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
    marginBottom: spacing.xxs,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  cardPressed: {
    backgroundColor: colors.surface2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.ink,
  },
  rowValue: {
    ...typography.monoMedium,
    color: colors.ink2,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.xs,
  },
  securityHint: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
});
