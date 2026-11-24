import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Button, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppFonts, colors } from '@/core/theme';
import { initDatabase } from '@/core/db';
import { canRenderFinancialRoutes } from '@/features/security/data/session';
import { AccessScreen } from '@/features/security/ui/AccessScreen';
import { SecurityProvider, useAuthSession } from '@/features/security/ui/AuthSession';

export default function RootLayout() {
  const auth = useAuthSession();
  const { fontsLoaded, fontError } = useAppFonts();
  const [database, setDatabase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [forceReady, setForceReady] = useState(false);

  function initializeDatabase() {
    try {
      initDatabase();
      setDatabase('ready');
    } catch {
      setDatabase('error');
    }
  }

  useEffect(() => {
    // Timeout de seguridad: Si las fuentes tardan, continuar con fuentes del sistema tras 1.2s
    const timer = setTimeout(() => {
      setForceReady(true);
    }, 1200);

    // initDatabase() es síncrono; se difiere el setState al microtask para
    // no renderizar en cascada desde el cuerpo del efecto (regla
    // react-hooks/set-state-in-effect) manteniendo la misma conducta.
    queueMicrotask(initializeDatabase);

    return () => clearTimeout(timer);
  }, []);

  if (!auth.foreground) return <View style={styles.loadingContainer} />;

  if (database === 'error') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.ink }}>No se pudo abrir la base de datos local.</Text>
        <Button title="Reintentar" onPress={initializeDatabase} />
      </View>
    );
  }

  if ((!forceReady && !fontsLoaded && !fontError) || database === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!canRenderFinancialRoutes(auth.state, auth.foreground)) {
    return <><StatusBar style="light" /><AccessScreen auth={auth} /></>;
  }

  return (
    <SecurityProvider value={auth.security}>
      <View style={styles.navigator} onLayout={auth.financeLayout}
        onTouchStart={auth.security.activity} onTouchMove={auth.security.activity}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="new-expense"
            options={{
              presentation: 'modal',
              headerShown: false,
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="new-income"
            options={{
              presentation: 'modal',
              headerShown: false,
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="categories"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="analytics"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
        </Stack>
      </View>
    </SecurityProvider>
  );
}

const styles = StyleSheet.create({
  navigator: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
