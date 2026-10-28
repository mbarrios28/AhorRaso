import React from 'react';
import { BudgetFormModal, BudgetFormModalProps } from './BudgetFormModal';

export type CreateBudgetModalProps = Omit<BudgetFormModalProps, 'mode' | 'initialBudget'>;

/**
 * Componente retrocompatible para crear presupuestos.
 * Redirige internamente a BudgetFormModal en modo 'create'.
 */
export const CreateBudgetModal: React.FC<CreateBudgetModalProps> = (props) => {
  return <BudgetFormModal {...props} mode="create" initialBudget={null} />;
};

export default CreateBudgetModal;
