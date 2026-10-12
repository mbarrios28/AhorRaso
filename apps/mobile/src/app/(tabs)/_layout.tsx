import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Tabs, router } from 'expo-router';
import { colors, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      {/* 1. Inicio / Dashboard */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Icon name="LayoutDashboard" size={size || 22} color={color} />
          ),
        }}
      />

      {/* 2. Historial de Movimientos */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <Icon name="ReceiptText" size={size || 22} color={color} />
          ),
        }}
      />

      {/* 3. Botón Central de Acción (+) */}
      <Tabs.Screen
        name="new-action"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarButton: ({ ref, ...props }) => (
            <Pressable
              {...props}
              onPress={() => router.push('/new-expense')}
              style={[props.style, styles.centralButtonContainer]}
              accessibilityLabel="Registrar nuevo gasto"
              accessibilityRole="button"
            >
              <View style={styles.centralButton}>
                <Icon name="Plus" size={24} color="#0D0D0F" strokeWidth={2.8} />
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
          title: 'Presupuestos',
          tabBarIcon: ({ color, size }) => (
            <Icon name="PieChart" size={size || 22} color={color} />
          ),
        }}
      />

      {/* 5. Perfil y Ajustes */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Icon name="User" size={size || 22} color={color} />
          ),
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
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
    elevation: 0,
  },
  tabBarLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  centralButtonContainer: {
    top: -12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centralButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
});
