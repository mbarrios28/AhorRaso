/**
 * Feature: Transactions
 * Módulo responsable de registrar y persistir transacciones financieras (RF-002),
 * de re-categorizar movimientos existentes (RF-004) y de consultar el historial
 * con filtros combinados y paginación (RF-009).
 */

export * from './domain/types';
export * from './domain/history';
export * from './domain/errors';
export * from './data/transactions.repository';
export * from './ui/NewExpenseScreen';
export * from './ui/NewIncomeScreen';
export * from './ui/EditTransactionCategoryModal';
export * from './ui/HistoryFiltersModal';
export * from './ui/HistoryScreen';
export * from './ui/useHistoryPagination';
