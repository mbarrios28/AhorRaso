import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/core/theme';
import { accessPresentation } from '../data/access-policy';
import { biometricService } from '../data/biometric.service';
import { isValidPassword } from '../data/local-account.service';
import type { useAuthSession } from './AuthSession';

export function AccessScreen({ auth }: { auth: ReturnType<typeof useAuthSession> }) {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [biometric, setBiometric] = useState<{ available: boolean; preferred: boolean } | null>(null);
  const [usePin, setUsePin] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [recover, setRecover] = useState(false);
  const credentials = 'credentials' in auth.state ? auth.state.credentials : null;
  const hasPin = credentials?.pin === true;
  const checkingBiometry = hasPin && biometric === null && !usePin;
  const method = accessPresentation(hasPin, biometric?.preferred === true, usePin || recover);
  const setup = method === 'setup';
  const needsPassword = credentials?.password === true && (setup || recover);
  const needsConfirmation = setup || recover;

  useEffect(() => {
    if (!auth.foreground || !credentials) return;
    let current = true;
    void Promise.all([
      biometricService.isUsable(),
      hasPin ? biometricService.isEnabled().catch(() => false) : false,
    ]).then(([available, enabled]) => {
      if (current) setBiometric({ available, preferred: available && enabled });
    });
    return () => { current = false; };
  }, [auth.foreground, credentials, hasPin]);

  const requestAutomatically = useEffectEvent(() => {
    void auth.authenticate({ kind: 'biometric', automatic: true });
  });
  useEffect(() => {
    if (method === 'biometric' && auth.foreground && !auth.pending && auth.state.status === 'locked') {
      requestAutomatically();
    }
  }, [method, auth.foreground, auth.pending, auth.state.status]);

  function clear() {
    setPin('');
    setConfirmation('');
    setPassword('');
  }

  function submit() {
    if (setup) {
      void auth.authenticate({ kind: 'setup', pin, confirmation, password, enableBiometrics: biometric?.available === true && optIn });
    } else if (recover) {
      void auth.authenticate({ kind: 'recover', pin, confirmation, password });
    } else {
      void auth.authenticate({ kind: 'pin', pin });
    }
    clear();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {credentials && setup ? 'Configura tu PIN' : recover ? 'Restablece tu PIN' : 'Acceso a AhorRaso'}
        </Text>
        {auth.state.status === 'initializing' && <ActivityIndicator color={colors.primary} />}
        {auth.state.status === 'error' && (
          <>
            <Text style={styles.text}>No se pudo iniciar la verificación de seguridad en este dispositivo.</Text>
            <Button title="Reintentar" disabled={auth.pending} onPress={() => void auth.initialize()} />
          </>
        )}
        {credentials && method === 'biometric' && (
          <>
            <Text style={styles.text}>Confirma tu identidad con la biometría de tu dispositivo.</Text>
            <Button title="Usar biometría" disabled={auth.pending}
              onPress={() => void auth.authenticate({ kind: 'biometric' })} />
            <Button title="Usar PIN" disabled={auth.pending} onPress={() => { clear(); setUsePin(true); }} />
          </>
        )}
        {checkingBiometry && (
          <>
            <ActivityIndicator color={colors.primary} />
            <Button title="Usar PIN" onPress={() => setUsePin(true)} />
          </>
        )}
        {credentials && !checkingBiometry && method !== 'biometric' && (
          <>
            {setup && <Text style={styles.text}>Elige un PIN de seis dígitos para proteger tus datos.</Text>}
            {needsPassword && (
              <>
                <Text style={styles.text}>Confirma tu contraseña anterior para proteger tu acceso existente.</Text>
                <TextInput accessibilityLabel="Contraseña anterior" placeholder="Contraseña anterior"
                  placeholderTextColor={colors.ink3} autoCapitalize="none" autoCorrect={false} secureTextEntry
                  maxLength={128} editable={!auth.pending} value={password} onChangeText={setPassword} style={styles.input} />
              </>
            )}
            <TextInput accessibilityLabel={needsConfirmation ? 'Nuevo PIN' : 'PIN'}
              placeholder={needsConfirmation ? 'Nuevo PIN' : 'PIN de seis dígitos'}
              placeholderTextColor={colors.ink3} keyboardType="number-pad" maxLength={6} secureTextEntry
              editable={!auth.pending} value={pin} onChangeText={setPin} style={styles.input} />
            {needsConfirmation && <TextInput accessibilityLabel="Confirmar PIN" placeholder="Confirmar PIN"
              placeholderTextColor={colors.ink3} keyboardType="number-pad" maxLength={6} secureTextEntry
              editable={!auth.pending} value={confirmation} onChangeText={setConfirmation} style={styles.input} />}
            {setup && biometric?.available && (
              <View style={styles.option}>
                <Text style={styles.text}>Activar acceso con biometría</Text>
                <Switch accessibilityLabel="Activar acceso con biometría" disabled={auth.pending}
                  value={optIn} onValueChange={setOptIn} />
              </View>
            )}
            <Button title={needsConfirmation ? 'Guardar PIN' : 'Desbloquear'} onPress={submit}
              disabled={auth.pending || !auth.foreground || !/^\d{6}$/.test(pin) ||
                (needsConfirmation && pin !== confirmation) || (needsPassword && !isValidPassword(password))} />
            {!setup && recover && (
              <Button title="Cancelar" disabled={auth.pending} onPress={() => { clear(); setRecover(false); }} />
            )}
            {!setup && !recover && biometric?.preferred && (
              <Button title="Usar biometría" disabled={auth.pending} onPress={() => {
                clear(); setUsePin(false); void auth.authenticate({ kind: 'biometric' });
              }} />
            )}
            {!setup && !recover && credentials.password && (
              <Button title="Olvidé mi PIN" disabled={auth.pending} onPress={() => { clear(); setRecover(true); }} />
            )}
          </>
        )}
        {auth.pending && credentials && <ActivityIndicator color={colors.primary} />}
        {auth.message !== '' && <Text accessibilityLiveRegion="polite" style={styles.text}>{auth.message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.base },
  title: { ...typography.titleLarge, color: colors.ink },
  text: { ...typography.bodyMedium, color: colors.ink2 },
  input: { color: colors.ink, backgroundColor: colors.surface3, padding: spacing.md, borderRadius: radius.sm },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
