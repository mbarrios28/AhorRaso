import React from 'react';
import { DashboardScreen } from '@/features/dashboard';

/**
 * Ruta principal de Expo Router (Tab Index): Dashboard Financiero (RF-008 / HU-04).
 * Delega la presentación y comportamiento al componente de feature DashboardScreen.
 */
export default function DashboardRoute() {
  return <DashboardScreen />;
}
