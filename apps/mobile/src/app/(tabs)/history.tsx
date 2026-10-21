import React from 'react';
import { HistoryScreen } from '@/features/transactions';

/**
 * Ruta del historial de movimientos (RF-009 / HU-05).
 * La lógica de consulta, filtros y paginación vive en
 * `features/transactions/ui/HistoryScreen`.
 */
export default function HistoryTab() {
  return <HistoryScreen />;
}
