import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Switch,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { alertsRepository } from '../data/alerts.repository';
import { NotificationPreferences } from '../domain/types';

interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  onSaved?: (prefs: NotificationPreferences) => void;
}

const AVAILABLE_THRESHOLDS = [
  { value: 50, label: '50 %', desc: 'Aviso preventivo a la mitad del presupuesto' },
  { value: 80, label: '80 %', desc: 'Atención cercana al límite de gasto' },
  { value: 100, label: '100 %', desc: 'Tope alcanzado o sobregiro presupuestal' },
];

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  visible,
  onClose,
  userId = DEV_USER_ID,
  onSaved,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [selectedThresholds, setSelectedThresholds] = useState<number[]>([50, 80, 100]);
  const [channelInApp, setChannelInApp] = useState(true);
  const [channelPush, setChannelPush] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Cargar preferencias guardadas al abrir
  useEffect(() => {
    if (visible) {
      try {
        const prefs = alertsRepository.getPreferences(userId);
        setEnabled(prefs.enabled);
        setSelectedThresholds(prefs.thresholds);
        setChannelInApp(prefs.channelInApp);
        setChannelPush(prefs.channelPush);
        setFeedback(null);
      } catch (e) {
        console.error('Error al cargar preferencias de alerta:', e);
      }
    }
  }, [visible, userId]);

  const toggleThreshold = (val: number) => {
    setSelectedThresholds((prev) => {
      if (prev.includes(val)) {
        if (prev.length === 1) {
          // No permitir desmarcar todos si las alertas están activas
          return prev;
        }
        return prev.filter((t) => t !== val);
      } else {
        return [...prev, val].sort((a, b) => a - b);
      }
    });
  };

  const handleSave = () => {
    setSaving(true);
    try {
      const saved = alertsRepository.savePreferences(userId, {
        enabled,
        thresholds: selectedThresholds,
        channelInApp,
        channelPush,
      });
      if (onSaved) onSaved(saved);
      onClose();
    } catch (e: any) {
      setFeedback('Error al guardar preferencias de alerta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Alertas y Umbrales</Text>
              <Text style={styles.subtitle}>Configura avisos de presupuesto (RF-010)</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar ajustes"
              hitSlop={12}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Icon name="X" size={20} color={colors.ink3} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Switch Maestro */}
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <View style={styles.switchTitleRow}>
                    <Icon
                      name="Bell"
                      size={18}
                      color={enabled ? colors.primary : colors.ink3}
                    />
                    <Text style={styles.cardTitle}>Alertas de Presupuesto</Text>
                  </View>
                  <Text style={styles.cardDescription}>
                    Recibe notificaciones cuando el gasto se acerque o supere los límites fijados.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{ false: colors.surface3, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Umbrales de Porcentaje */}
            <View style={[styles.section, !enabled && styles.disabledSection]}>
              <Text style={styles.sectionTitle}>UMBRALES DE ALERTA</Text>
              <Text style={styles.sectionSubtitle}>
                Elige en qué porcentajes del presupuesto deseas recibir aviso:
              </Text>

              <View style={styles.thresholdsList}>
                {AVAILABLE_THRESHOLDS.map((t) => {
                  const isChecked = selectedThresholds.includes(t.value);
                  return (
                    <Pressable
                      key={t.value}
                      style={[
                        styles.thresholdRow,
                        isChecked && styles.thresholdRowActive,
                      ]}
                      onPress={() => enabled && toggleThreshold(t.value)}
                      disabled={!enabled}
                    >
                      <View style={styles.thresholdBadge}>
                        <Text
                          style={[
                            styles.thresholdBadgeText,
                            isChecked && styles.thresholdBadgeTextActive,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </View>
                      <View style={styles.thresholdInfo}>
                        <Text style={styles.thresholdDesc}>{t.desc}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          isChecked && styles.checkboxActive,
                        ]}
                      >
                        {isChecked && (
                          <Icon name="Check" size={14} color="#0D0D0F" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Canales de Alerta */}
            <View style={[styles.section, !enabled && styles.disabledSection]}>
              <Text style={styles.sectionTitle}>CANALES DE NOTIFICACIÓN</Text>

              <View style={styles.card}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.rowLabel}>Alertas In-App</Text>
                    <Text style={styles.rowSub}>Banners visibles dentro de la app</Text>
                  </View>
                  <Switch
                    value={channelInApp}
                    onValueChange={setChannelInApp}
                    disabled={!enabled}
                    trackColor={{ false: colors.surface3, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.rowLabel}>Notificaciones Push</Text>
                    <Text style={styles.rowSub}>Avisos en la barra del dispositivo</Text>
                  </View>
                  <Switch
                    value={channelPush}
                    onValueChange={setChannelPush}
                    disabled={!enabled}
                    trackColor={{ false: colors.surface3, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </View>

            {/* Caja Informativa Anti-Spam (RNF-010) */}
            <View style={styles.infoBox}>
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>RNF-010 · CONTROL ANTI-SPAM</Text>
              </View>
              <Text style={styles.infoText}>
                Para evitar avisos repetitivos e invasivos, cada umbral solo emitirá una única notificación por periodo presupuestal.
              </Text>
            </View>

            {feedback ? <Text style={styles.errorText}>{feedback}</Text> : null}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Guardando...' : 'Guardar Preferencias'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.base,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  scrollArea: {
    maxHeight: 480,
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  switchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '700',
  },
  cardDescription: {
    ...typography.bodySmall,
    color: colors.ink3,
    lineHeight: 16,
  },
  section: {
    gap: spacing.xs,
  },
  disabledSection: {
    opacity: 0.45,
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginBottom: spacing.xxs,
  },
  thresholdsList: {
    gap: spacing.xs,
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  thresholdRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  thresholdBadge: {
    minWidth: 54,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdBadgeText: {
    ...typography.monoMedium,
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '700',
  },
  thresholdBadgeTextActive: {
    color: colors.primary,
  },
  thresholdInfo: {
    flex: 1,
  },
  thresholdDesc: {
    ...typography.bodySmall,
    color: colors.ink,
    fontSize: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  rowSub: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.sm,
  },
  infoBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  infoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderColor: colors.line,
    borderWidth: 1,
  },
  infoBadgeText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink2,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.ink3,
    lineHeight: 16,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  saveBtn: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
  },
});
