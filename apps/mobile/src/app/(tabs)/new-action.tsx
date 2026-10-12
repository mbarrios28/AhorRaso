import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Ancla de ruta en Expo Router para el botón central de la barra de navegación.
 * Si por cualquier razón la ruta es activada directamente, redirige al modal de registrar gasto.
 */
export default function NewActionRoute() {
  return <Redirect href="/new-expense" />;
}
