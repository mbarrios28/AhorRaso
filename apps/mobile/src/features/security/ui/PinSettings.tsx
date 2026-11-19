import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/core/theme';
import { PinServiceError, pinService } from '../data/pin.service';

type PinMode = 'setup' | 'change' | null;

function getServiceErrorMessage(error: unknown): string {
  if (!(error instanceof PinServiceError)) {
    return 'No se pudo completar la operación. Inténtalo nuevamente.';
  }
  switch (error.code) {
    case 'INVALID_FORMAT':
      return 'El PIN debe tener exactamente seis dígitos.';
    case 'CONFIRMATION_MISMATCH':
      return 'Los PIN ingresados no coinciden.';
    case 'ALREADY_CONFIGURED':
      return 'Ya existe un PIN configurado.';
    default:
      return 'No se pudo guardar el PIN de forma segura. Inténtalo nuevamente.';
  }
}

export function PinSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [mode, setMode] = useState<PinMode>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const isMounted = useRef(true);

  const loadStatus = useCallback(async () => {
    try {
      const hasPin = await pinService.hasPin();
      if (isMounted.current) setConfigured(hasPin);
    } catch {
      if (isMounted.current) {
        setConfigured(null);
      }
    } finally {
      if (isMounted.current) setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    queueMicrotask(() => {
      if (isMounted.current) void loadStatus();
    });
    return () => {
      isMounted.current = false;
    };
  }, [loadStatus]);

  const retryStatus = useCallback(() => {
    setLoadingStatus(true);
    setMessage(null);
    setMessageIsError(false);
    void loadStatus();
  }, [loadStatus]);

  const clearFields = useCallback(() => {
    setCurrentPin('');
    setNewPin('');
    setConfirmation('');
  }, []);

  const closeForm = useCallback(() => {
    setMode(null);
    clearFields();
    setMessage(null);
    setMessageIsError(false);
  }, [clearFields]);

  const begin = useCallback(
    (nextMode: Exclude<PinMode, null>) => {
      clearFields();
      setMessage(null);
      setMessageIsError(false);
      setMode(nextMode);
    },
    [clearFields]
  );

  const submit = useCallback(async () => {
    if (!mode || busy) return;
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);

    try {
      if (mode === 'setup') {
        await pinService.configurePin(newPin, confirmation);
        setConfigured(true);
        setMessage('PIN configurado correctamente.');
        setMode(null);
      } else {
        const result = await pinService.changePin(currentPin, newPin, confirmation);
        if (result.status === 'valid') {
          setConfigured(true);
          setMessage('PIN cambiado correctamente.');
          setMode(null);
        } else if (result.status === 'invalid') {
          setMessage(
            result.retryAfterSeconds > 0
              ? `PIN actual incorrecto. Espera ${result.retryAfterSeconds} s para volver a intentar.`
              : 'Ingresa el PIN actual de seis dígitos.'
          );
          setMessageIsError(true);
        } else if (result.status === 'locked') {
          setMessage(`Por seguridad, espera ${result.retryAfterSeconds} s antes de intentar.`);
          setMessageIsError(true);
        } else if (result.status === 'not-configured') {
          setConfigured(false);
          setMessage('No hay un PIN configurado para cambiar.');
          setMessageIsError(true);
        } else {
          setMessage('No se pudo validar o guardar el PIN de forma segura.');
          setMessageIsError(true);
        }
      }
      clearFields();
    } catch (error) {
      clearFields();
      setMessage(getServiceErrorMessage(error));
      setMessageIsError(true);
      if (error instanceof PinServiceError && error.code === 'ALREADY_CONFIGURED') {
        setConfigured(true);
        setMode(null);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, clearFields, confirmation, currentPin, mode, newPin]);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>PIN de acceso local</Text>
        <Text style={styles.description}>
          Protege esta instalación. No es una contraseña de cuenta.
        </Text>
      </View>

      {loadingStatus ? (
        <ActivityIndicator color={colors.primary} />
      ) : configured === null ? (
        <View style={styles.errorState}>
          <Text style={styles.error}>
            La configuración no está disponible. No se puede iniciar ni reemplazar un PIN.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retryStatus}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : mode === null ? (
        <View style={styles.actionRow}>
          <Text style={styles.status}>
            {configured ? 'PIN configurado' : 'PIN no configurado'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => begin(configured ? 'change' : 'setup')}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>
              {configured ? 'Cambiar PIN' : 'Configurar PIN'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          {mode === 'change' && (
            <PinField
              label="PIN actual"
              value={currentPin}
              onChangeText={setCurrentPin}
              editable={!busy}
            />
          )}
          <PinField
            label="Nuevo PIN"
            value={newPin}
            onChangeText={setNewPin}
            editable={!busy}
          />
          <PinField
            label="Confirmar PIN"
            value={confirmation}
            onChangeText={setConfirmation}
            editable={!busy}
          />
          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={closeForm}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={
                busy ||
                newPin.length !== 6 ||
                confirmation.length !== 6 ||
                (mode === 'change' && currentPin.length !== 6)
              }
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.actionButton,
                (busy ||
                  newPin.length !== 6 ||
                  confirmation.length !== 6 ||
                  (mode === 'change' && currentPin.length !== 6)) &&
                  styles.disabled,
                pressed && !busy && styles.pressed,
              ]}
            >
              {busy ? (
                <View style={styles.busyLabel}>
                  <ActivityIndicator size="small" color={colors.bg} />
                  <Text style={styles.actionText}>Guardando…</Text>
                </View>
              ) : (
                <Text style={styles.actionText}>
                  {mode === 'setup' ? 'Guardar PIN' : 'Actualizar PIN'}
                </Text>
              )}
            </Pressable>
          </View>
          {busy && (
            <Text style={styles.busyMessage}>
              Derivando y guardando el verificador seguro. Puede tardar varios segundos.
            </Text>
          )}
        </View>
      )}

      {message && (
        <Text style={messageIsError ? styles.error : styles.success} accessibilityRole="alert">
          {message}
        </Text>
      )}
      <Text style={styles.footnote}>
        Los intentos fallidos activan esperas progresivas. No existe una recuperación automática
        del PIN.
      </Text>
    </View>
  );
}

interface PinFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
}

function PinField({ label, value, onChangeText, editable }: PinFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoComplete="off"
        autoCorrect={false}
        editable={editable}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))}
        secureTextEntry
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  heading: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.ink,
  },
  description: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  status: {
    ...typography.bodySmall,
    color: colors.ink2,
    flex: 1,
  },
  actionButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  actionText: {
    ...typography.bodySmall,
    color: colors.bg,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
  form: {
    gap: spacing.sm,
  },
  errorState: {
    gap: spacing.xs,
  },
  field: {
    gap: spacing.xxs,
  },
  fieldLabel: {
    ...typography.labelSmall,
    color: colors.ink2,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.base,
    ...typography.monoMedium,
    color: colors.ink,
    letterSpacing: 8,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  busyLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  busyMessage: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  cancelButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  cancelText: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  error: {
    ...typography.bodySmall,
    color: colors.danger,
  },
  success: {
    ...typography.bodySmall,
    color: colors.secondary,
  },
  footnote: {
    ...typography.bodySmall,
    color: colors.ink3,
    lineHeight: 18,
  },
});
