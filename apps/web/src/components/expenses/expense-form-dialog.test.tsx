import type { ExpenseCategory } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { categoryOptions } from '@/lib/expenses-api';
import { ExpenseFormDialog } from './expense-form-dialog';

const categories: ExpenseCategory[] = [
  { id: 'adm', name: 'Administrativo', systemCode: null, isActive: true, sortOrder: 1 },
  { id: 'fees', name: 'Honorarios', systemCode: 'FEES', isActive: true, sortOrder: 2 },
  { id: 'old', name: 'Comercial', systemCode: null, isActive: false, sortOrder: 3 },
  { id: 'legal', name: 'Jurídico', systemCode: null, isActive: true, sortOrder: 4 },
];

function renderForm() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExpenseFormDialog
        year={2026}
        month={9}
        expense={null}
        categories={categories}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('ExpenseFormDialog', () => {
  it('CA-15 no ofrece "Honorarios" ni los departamentos inactivos', () => {
    expect(categoryOptions(categories, null)).toEqual([
      { value: 'adm', label: 'Administrativo' },
      { value: 'legal', label: 'Jurídico' },
    ]);
    // Al editar, la categoría actual sigue disponible aunque esté inactiva.
    expect(categoryOptions(categories, 'old').map((o) => o.value)).toEqual(['adm', 'old', 'legal']);
  });

  it('CA-15 la semana limita el calendario y la fecha elige la semana', () => {
    renderForm();
    const date = screen.getByLabelText('Fecha de pago');
    fireEvent.change(date, { target: { value: '2026-09-16' } });
    expect(screen.getByRole('combobox', { name: 'Semana' })).toHaveTextContent('Semana 3');
    expect(date).toHaveAttribute('min', '2026-09-15');
    expect(date).toHaveAttribute('max', '2026-09-21');

    fireEvent.change(date, { target: { value: '2026-09-30' } });
    expect(screen.getByRole('combobox', { name: 'Semana' })).toHaveTextContent('Semana 4');
    expect(date).toHaveAttribute('min', '2026-09-22');
    expect(date).toHaveAttribute('max', '2026-09-30');
  });
});
