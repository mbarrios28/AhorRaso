import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/core/theme';
import { biometricService } from '../data/biometric.service';
import { PinField } from './PinSettings';

export function BiometricSettings() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    void Promise.all([biometricService.isUsable(), biometricService.isEnabled()]).then(([usable, preferred]) => {
      if (current) { setAvailable(usable); setEnabled(preferred); }
    }, () => {
      if (current) setMessage('No pudimos consultar tus ajustes de biometría.');
    });
    return () => { current = false; };
  }, []);

  async function enable() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await biometricService.enable();
      if (result.status === 'enabled') setEnabled(true);
      else setMessage('No pudimos activar la biometría. Puedes seguir usando tu PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy || !/^\d{6}$/.test(pin)) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await biometricService.disable(pin);
      if (result.status === 'disabled') {
        setEnabled(false);
        setDisabling(false);
      } else if ((result.status === 'invalid' || result.status === 'locked') && result.retryAfterSeconds) {
        setMessage(`Intenta nuevamente después de ${result.retryAfterSeconds} s.`);
      } else {
        setMessage('No pudimos confirmar tu PIN.');
      }
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  if (!available && !enabled && !message) return null;

  return (
    <View style={styles.form}>
      {!disabling && enabled && (
        <Button title="Desactivar biometría" disabled={busy} onPress={() => { setMessage(''); setDisabling(true); }} />
      )}
      {available && enabled === false && (
        <Button title="Activar biometría" disabled={busy} onPress={() => void enable()} />
      )}
      {disabling && (
        <>
          <PinField label="PIN actual" value={pin} onChangeText={setPin} editable={!busy} />
          <Button title="Confirmar" disabled={busy || !/^\d{6}$/.test(pin)} onPress={() => void disable()} />
          <Button title="Cancelar" disabled={busy}
            onPress={() => { setPin(''); setDisabling(false); setMessage(''); }} />
        </>
      )}
      {busy && <ActivityIndicator color={colors.primary} />}
      {message !== '' && <Text style={styles.text} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  text: { ...typography.bodySmall, color: colors.ink2 },
});
