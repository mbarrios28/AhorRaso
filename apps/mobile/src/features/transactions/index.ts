/**
 * Feature: Transactions
 * Módulo responsable de registrar y persistir transacciones financieras (RF-002),
 * dictado de gastos por voz con autoaprendizaje adaptativo (RF-003 / HU-10),
 * re-categorizar movimientos existentes (RF-004) y consultar el historial
 * con filtros combinados y paginación (RF-009).
 */

export * from './domain/types';
export * from './domain/history';
export * from './domain/errors';
export * from './domain/voiceParser';
export * from './domain/useVoiceRecognition';
export * from './data/transactions.repository';
export * from './data/voiceLearning.repository';
export * from './ui/NewExpenseScreen';
export * from './ui/NewIncomeScreen';
export * from './ui/ExpenseAccordionCard';
export * from './ui/VoiceRecordingModal';
export * from './ui/EditTransactionCategoryModal';
export * from './ui/HistoryFiltersModal';
export * from './ui/HistoryScreen';
export * from './ui/useHistoryPagination';
