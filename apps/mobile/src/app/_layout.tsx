import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppFonts, colors } from '@/core/theme';
import { initDatabase } from '@/core/db';

export default function RootLayout() {
  const { fontsLoaded, fontError } = useAppFonts();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    // initDatabase() es síncrono; se difiere el setState al microtask para
    // no renderizar en cascada desde el cuerpo del efecto (regla
    // react-hooks/set-state-in-effect) manteniendo la misma conducta.
    queueMicrotask(() => {
      try {
        initDatabase();
      } catch (e) {
        console.error('Error al inicializar la base de datos local:', e);
      }
      setDbReady(true);
    });
  }, []);

  if ((!fontsLoaded && !fontError) || !dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
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
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
