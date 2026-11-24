import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/core/theme';
import { pinService } from '../data/pin.service';

export function PinField({ label, value, onChangeText, editable }: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
}) {
  return (
    <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.ink3}
      keyboardType="number-pad" maxLength={6} secureTextEntry editable={editable}
      value={value} onChangeText={onChangeText} style={styles.input} />
  );
}

export function PinSettings() {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function clear() {
    setCurrent('');
    setPin('');
    setConfirmation('');
  }

  async function save() {
    if (busy || !/^\d{6}$/.test(current) || !/^\d{6}$/.test(pin) || pin !== confirmation) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await pinService.changePin(current, pin, confirmation);
      if (result.status === 'valid') {
        setEditing(false);
        setMessage('El PIN se actualizó.');
      } else if (result.status === 'invalid' || result.status === 'locked') {
        setMessage(result.retryAfterSeconds
          ? `Intenta nuevamente después de ${result.retryAfterSeconds} s.`
          : 'El PIN actual es incorrecto.');
      } else {
        setMessage('No pudimos actualizar tu PIN. Inténtalo nuevamente.');
      }
    } catch {
      setMessage('No pudimos actualizar tu PIN. Inténtalo nuevamente.');
    } finally {
      clear();
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      {!editing ? <Button title="Cambiar PIN" onPress={() => { setMessage(''); setEditing(true); }} /> : (
        <>
          <PinField label="PIN actual" value={current} onChangeText={setCurrent} editable={!busy} />
          <PinField label="Nuevo PIN" value={pin} onChangeText={setPin} editable={!busy} />
          <PinField label="Confirmar PIN" value={confirmation} onChangeText={setConfirmation} editable={!busy} />
          <Button title="Guardar PIN" disabled={busy || !/^\d{6}$/.test(current) || !/^\d{6}$/.test(pin) || pin !== confirmation}
            onPress={() => void save()} />
          <Button title="Cancelar" disabled={busy} onPress={() => { clear(); setEditing(false); setMessage(''); }} />
        </>
      )}
      {busy && <ActivityIndicator color={colors.primary} />}
      {message !== '' && <Text style={styles.text} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  input: { color: colors.ink, backgroundColor: colors.surface3, padding: spacing.md, borderRadius: radius.sm },
  text: { ...typography.bodySmall, color: colors.ink2 },
});
