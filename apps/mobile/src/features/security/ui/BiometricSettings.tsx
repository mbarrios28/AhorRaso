import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthenticationType } from 'expo-local-authentication';
import { colors, radius, spacing, typography } from '@/core/theme';
import {
  biometricService,
  type BiometricAvailability,
  type BiometricAuthenticationResult,
  type BiometricDisableResult,
  type BiometricEnableResult,
} from '../data/biometric.service';

type FormMode = 'disable' | null;

function availabilityMessage(availability: BiometricAvailability): string {
  if (availability.error) return 'No se pudo consultar la biometría del dispositivo.';
  if (!availability.hardwareAvailable || availability.authenticationTypes.length === 0) {
    return 'Este dispositivo no ofrece autenticación biométrica compatible.';
  }
  if (!availability.enrolled) {
    return 'No hay huellas u otros datos biométricos registrados. Configúralos en Ajustes de Android.';
  }

  const methods: string[] = [];
  for (const type of availability.authenticationTypes) {
    switch (type) {
      case AuthenticationType.FINGERPRINT:
        methods.push('huella');
        break;
      case AuthenticationType.FACIAL_RECOGNITION:
        methods.push('reconocimiento facial');
        break;
      case AuthenticationType.IRIS:
        methods.push('iris');
        break;
    }
  }
  return `Disponible: ${methods.join(', ')}.`;
}

function enableMessage(result: BiometricEnableResult): string {
  switch (result.status) {
    case 'enabled':
      return 'Autenticación biométrica activada.';
    case 'pin-not-configured':
      return 'Configura primero el PIN local de AhorRaso.';
    case 'not-available':
      return 'Este dispositivo no dispone de biometría compatible. Puedes conservar el PIN.';
    case 'not-enrolled':
      return 'Registra una huella o biometría desde los ajustes de Android e inténtalo de nuevo.';
    case 'failed':
      return 'La autenticación no fue correcta. Puedes continuar con el PIN local.';
    case 'cancelled':
      return 'Autenticación cancelada. Puedes continuar con el PIN local.';
    case 'busy':
      return 'Ya hay una solicitud biométrica en curso.';
    default:
      return 'No se pudo activar la biometría. No se autorizó el cambio.';
  }
}

function authenticationMessage(result: BiometricAuthenticationResult): string {
  switch (result.status) {
    case 'success':
      return 'Autenticación biométrica correcta. Esta prueba no desbloquea las pantallas de la app.';
    case 'failed':
      return 'La autenticación no fue correcta. Puedes probar el PIN local.';
    case 'cancelled':
      return 'Autenticación cancelada. Puedes probar el PIN local.';
    case 'busy':
      return 'Ya hay una solicitud biométrica en curso.';
    default:
      return 'Ocurrió un error biométrico. No se autorizó el acceso; puedes probar el PIN local.';
  }
}

function disableMessage(result: BiometricDisableResult): string {
  switch (result.status) {
    case 'disabled':
      return 'Autenticación biométrica desactivada. El PIN sigue configurado.';
    case 'invalid':
      return result.retryAfterSeconds > 0
        ? `PIN incorrecto. Espera ${result.retryAfterSeconds} s para volver a intentar.`
        : 'PIN incorrecto.';
    case 'locked':
      return `Por seguridad, espera ${result.retryAfterSeconds} s antes de intentar.`;
    case 'not-configured':
      return 'No hay un PIN configurado para validar este cambio.';
    default:
      return 'No se pudo validar el PIN ni actualizar la preferencia biométrica.';
  }
}

export function BiometricSettings() {
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<FormMode>(null);
  const [pin, setPin] = useState('');
  const [showFallback, setShowFallback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [nextAvailability, nextEnabled] = await Promise.all([
        biometricService.getAvailability(),
        biometricService.isEnabled(),
      ]);
      setAvailability(nextAvailability);
      setEnabled(nextEnabled);
      setShowFallback(
        nextAvailability.error ||
          !nextAvailability.hardwareAvailable ||
          !nextAvailability.enrolled
      );
    } catch {
      setAvailability(null);
      setEnabled(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([biometricService.getAvailability(), biometricService.isEnabled()])
      .then(([nextAvailability, nextEnabled]) => {
        if (!active) return;
        setAvailability(nextAvailability);
        setEnabled(nextEnabled);
        setShowFallback(
          nextAvailability.error ||
            !nextAvailability.hardwareAvailable ||
            !nextAvailability.enrolled
        );
      })
      .catch(() => {
        if (active) {
          setAvailability(null);
          setEnabled(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const clearForm = useCallback(() => {
    setPin('');
    setMode(null);
  }, []);

  const startDisable = useCallback(() => {
    setMessage(null);
    setMessageIsError(false);
    setPin('');
    setMode('disable');
  }, []);

  const testBiometric = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const result = await biometricService.authenticate();
      setMessage(authenticationMessage(result));
      setMessageIsError(result.status !== 'success');
      setShowFallback(result.status !== 'success');
    } catch {
      setMessage('No se pudo completar la autenticación. No se autorizó el acceso.');
      setMessageIsError(true);
      setShowFallback(true);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const enableBiometric = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const result = await biometricService.enable();
      setMessage(enableMessage(result));
      setMessageIsError(result.status !== 'enabled');
      if (result.status === 'enabled') {
        setEnabled(true);
        setShowFallback(false);
      } else if (
        result.status === 'not-available' ||
        result.status === 'not-enrolled' ||
        result.status === 'failed' ||
        result.status === 'cancelled' ||
        result.status === 'error'
      ) {
        setShowFallback(true);
      }
    } catch {
      setMessage('No se pudo activar la biometría. No se autorizó el cambio.');
      setMessageIsError(true);
      setShowFallback(true);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const submitDisable = useCallback(async () => {
    if (busy || pin.length !== 6) return;
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const result = await biometricService.disable(pin);
      setMessage(disableMessage(result));
      setMessageIsError(result.status !== 'disabled');
      if (result.status === 'disabled') {
        setEnabled(false);
        clearForm();
      }
    } catch {
      setMessage('No se pudo desactivar la biometría. No se modificó la preferencia.');
      setMessageIsError(true);
    } finally {
      setBusy(false);
      setPin('');
    }
  }, [busy, clearForm, pin]);

  const submitFallback = useCallback(async () => {
    if (busy || pin.length !== 6) return;
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const result = await biometricService.validatePinFallback(pin);
      if (result.status === 'valid') {
        setMessage(
          'PIN correcto. Esta comprobación no desbloquea las pantallas de la app; el bloqueo global aún no está implementado.'
        );
        setMessageIsError(false);
      } else if (result.status === 'invalid' || result.status === 'locked') {
        setMessage(
          result.retryAfterSeconds > 0
            ? `PIN incorrecto o bloqueado. Espera ${result.retryAfterSeconds} s antes de volver a intentar.`
            : 'PIN incorrecto.'
        );
        setMessageIsError(true);
      } else if (result.status === 'not-configured') {
        setMessage('No hay un PIN local configurado.');
        setMessageIsError(true);
      } else {
        setMessage('No se pudo validar el PIN de forma segura.');
        setMessageIsError(true);
      }
    } catch {
      setMessage('No se pudo validar el PIN de forma segura.');
      setMessageIsError(true);
    } finally {
      setBusy(false);
      setPin('');
    }
  }, [busy, pin]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Autenticación biométrica</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Autenticación biométrica</Text>
        <Text style={styles.description}>
          Android gestiona la huella y no se guardan datos biométricos en AhorRaso.
        </Text>
      </View>

      <Text style={styles.status}>
        {enabled === null
          ? 'No se pudo leer la preferencia segura.'
          : enabled
            ? 'Biometría activada'
            : 'Biometría desactivada'}
      </Text>
      <Text style={availability?.error ? styles.error : styles.description}>
        {availability
          ? availabilityMessage(availability)
          : 'No se pudo cargar el estado biométrico.'}
      </Text>
      {availability && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setLoading(true);
            void loadStatus();
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Actualizar disponibilidad</Text>
        </Pressable>
      )}

      {enabled === null ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setLoading(true);
            setMessage(null);
            void loadStatus();
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Reintentar</Text>
        </Pressable>
      ) : enabled ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={startDisable}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>Desactivar biometría</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy || !availability?.hardwareAvailable || !availability.enrolled}
            onPress={() => void testBiometric()}
            style={({ pressed }) => [
              styles.secondaryButton,
              (busy || !availability?.hardwareAvailable || !availability.enrolled) &&
                styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryText}>Probar biometría</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={
              busy ||
              !availability?.hardwareAvailable ||
              !availability.enrolled ||
              availability.error
            }
            onPress={() => void enableBiometric()}
            style={({ pressed }) => [
              styles.actionButton,
              (busy ||
                !availability?.hardwareAvailable ||
                !availability.enrolled ||
                availability.error) &&
                styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Text style={styles.actionText}>Activar biometría</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={
              busy ||
              !availability?.hardwareAvailable ||
              !availability.enrolled ||
              availability.error
            }
            onPress={() => void testBiometric()}
            style={({ pressed }) => [
              styles.secondaryButton,
              (busy ||
                !availability?.hardwareAvailable ||
                !availability.enrolled ||
                availability.error) &&
                styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryText}>Probar biometría</Text>
          </Pressable>
        </View>
      )}

      {mode === 'disable' && (
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Confirma con el PIN de AhorRaso para desactivar.</Text>
          <PinInput pin={pin} setPin={setPin} editable={!busy} />
          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={clearForm}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy || pin.length !== 6}
              onPress={() => void submitDisable()}
              style={({ pressed }) => [
                styles.actionButton,
                (busy || pin.length !== 6) && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}
            >
              {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.actionText}>Confirmar</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {showFallback && mode === null && (
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Alternativa: valida el PIN local de AhorRaso.</Text>
          <PinInput pin={pin} setPin={setPin} editable={!busy} />
          <Pressable
            accessibilityRole="button"
            disabled={busy || pin.length !== 6}
            onPress={() => void submitFallback()}
            style={({ pressed }) => [
              styles.secondaryButton,
              (busy || pin.length !== 6) && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryText}>Validar PIN alternativo</Text>
            )}
          </Pressable>
        </View>
      )}

      {message && (
        <Text
          accessibilityRole="alert"
          style={messageIsError ? styles.error : styles.success}
        >
          {message}
        </Text>
      )}
      <Text style={styles.footnote}>
        La biometría y el PIN se configuran como métodos locales; todavía no bloquean ni desbloquean
        globalmente las pantallas de la aplicación.
      </Text>
    </View>
  );
}

interface PinInputProps {
  pin: string;
  setPin: (value: string) => void;
  editable: boolean;
}

function PinInput({ pin, setPin, editable }: PinInputProps) {
  return (
    <TextInput
      accessibilityLabel="PIN de AhorRaso"
      autoComplete="off"
      autoCorrect={false}
      editable={editable}
      keyboardType="number-pad"
      maxLength={6}
      onChangeText={(text) => setPin(text.replace(/\D/g, '').slice(0, 6))}
      secureTextEntry
      style={styles.input}
      value={pin}
    />
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
  status: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  actions: {
    gap: spacing.xs,
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
  secondaryButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: {
    ...typography.bodySmall,
    color: colors.ink2,
  },
  form: {
    gap: spacing.sm,
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
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
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
