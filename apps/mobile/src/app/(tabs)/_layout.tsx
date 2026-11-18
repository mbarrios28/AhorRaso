import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, router } from 'expo-router';
import { colors, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : Math.max(insets.bottom, 10);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight,
            paddingBottom: bottomPadding,
          },
        ],
        tabBarItemStyle: styles.tabBarItem,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      {/* 1. Inicio / Dashboard */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Icon name="LayoutDashboard" size={size || 21} color={color} />
          ),
        }}
      />

      {/* 2. Historial de Movimientos */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <Icon name="ReceiptText" size={size || 21} color={color} />
          ),
        }}
      />

      {/* 3. Botón Central de Acción (+) — perfectamente centrado entre 2 tabs izq. y 2 der. */}
      <Tabs.Screen
        name="new-action"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarButton: ({ accessibilityState }) => (
            <Pressable
              accessibilityState={accessibilityState}
              onPress={() => router.push('/new-expense')}
              style={({ pressed }) => [
                styles.centralButtonSlot,
                pressed && styles.centralButtonPressed,
              ]}
              accessibilityLabel="Registrar nuevo gasto"
              accessibilityRole="button"
            >
              <View style={styles.centralButton}>
                <Icon name="Plus" size={24} color={colors.bg} strokeWidth={2.8} />
              </View>
            </Pressable>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/new-expense');
          },
        }}
      />

      {/* 4. Presupuestos */}
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Presup.',
          tabBarIcon: ({ color, size }) => (
            <Icon name="PieChart" size={size || 21} color={color} />
          ),
        }}
      />

      {/* 5. Metas de Ahorro (HU-08 / RF-007 / RF-014) */}
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Metas',
          tabBarIcon: ({ color, size }) => (
            <Icon name="Target" size={size || 21} color={color} />
          ),
        }}
      />

      {/* Perfil y Ajustes — accesible desde el botón de perfil en el encabezado de Inicio */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: 'Perfil',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 4,
    elevation: 0,
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  centralButtonSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
  },
  centralButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.95 }],
  },
  centralButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
});
