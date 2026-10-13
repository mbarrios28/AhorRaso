import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { db, profile, Profile } from '@/core/db';
import { DEV_USER_ID } from '@/core/dev/constants';
import { eq } from 'drizzle-orm';

export default function ProfileTab() {
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        const p = db.select().from(profile).where(eq(profile.id, DEV_USER_ID)).get();
        if (p) setUserProfile(p);
      } catch (e) {
        console.error('Error al cargar perfil:', e);
      }
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Perfil y Ajustes</Text>
        </View>

        {/* Tarjeta de Usuario */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userProfile?.displayName?.charAt(0) || 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{userProfile?.displayName || 'Usuario'}</Text>
            <Text style={styles.userSub}>Estudiante · UNSA Arequipa</Text>
            <Text style={styles.userUuid} numberOfLines={1}>
              ID: {userProfile?.id || DEV_USER_ID}
            </Text>
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

        {/* Seguridad y Datos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SEGURIDAD Y BASE LOCAL</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="Database" size={18} color={colors.primary} />
                <Text style={styles.rowLabel}>Motor SQLite</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Drizzle ORM</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Icon name="CloudOff" size={18} color={colors.secondary} />
                <Text style={styles.rowLabel}>Modo de Operación</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.surface3 }]}>
                <Text style={[styles.badgeText, { color: colors.secondary }]}>100% Offline</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Módulo asignado a Dev C */}
        <View style={styles.infoBox}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>RF-018 · SEGURIDAD Y ACCESO</Text>
          </View>
          <Text style={styles.infoText}>
            Módulo asignado a Dev C para autenticación por PIN, biometría y sesión Supabase Auth.
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
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
  userSub: {
    ...typography.bodySmall,
    color: colors.ink2,
    marginTop: 2,
  },
  userUuid: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
    marginTop: 4,
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
  badge: {
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  badgeText: {
    ...typography.monoSmall,
    color: colors.primary,
    fontSize: 11,
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
