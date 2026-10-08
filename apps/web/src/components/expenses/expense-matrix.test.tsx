import type { MonthlyMatrix } from '@anderp/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseMatrix } from './expense-matrix';

// Ejemplo de CA-11: septiembre de 2026 con un egreso jurídico y un pago de honorarios.
const matrix: MonthlyMatrix = {
  year: 2026,
  month: 9,
  weeks: [
    { week: 1, start: '2026-09-01', end: '2026-09-07' },
    { week: 2, start: '2026-09-08', end: '2026-09-14' },
    { week: 3, start: '2026-09-15', end: '2026-09-21' },
    { week: 4, start: '2026-09-22', end: '2026-09-30' },
  ],
  rows: [
    {
      categoryId: 'fees',
      name: 'Honorarios',
      isSystem: true,
      isActive: true,
      cells: ['50000.00', '0.00', '0.00', '0.00'],
      total: '50000.00',
    },
    {
      categoryId: 'legal',
      name: 'Jurídico',
      isSystem: false,
      isActive: false,
      cells: ['0.00', '100000.00', '0.00', '0.00'],
      total: '100000.00',
    },
  ],
  weekTotals: ['50000.00', '100000.00', '0.00', '0.00'],
  grandTotal: '150000.00',
};

describe('ExpenseMatrix', () => {
  it('CA-14 muestra las semanas con sus fechas, las celdas y los totales', () => {
    render(<ExpenseMatrix matrix={matrix} onSelect={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: /Semana 1\s*01\/09 – 07\/09/ })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /Semana 4\s*22\/09 – 30\/09/ })).toBeVisible();

    const legal = screen.getByRole('row', { name: /Jurídico/ });
    expect(within(legal).getByText('(inactivo)')).toBeVisible();
    expect(
      within(legal)
        .getAllByRole('cell')
        .map((c) => c.textContent.replace(/\s/g, ' ')),
    ).toEqual(['—', '$ 100.000', '—', '—', '$ 100.000']);
    const totals = screen.getByRole('row', { name: /^Total/ });
    expect(totals).toHaveTextContent('$ 150.000');
  });

  it('CA-14 al hacer clic en una celda o un total avisa qué filtrar', () => {
    const onSelect = vi.fn();
    render(<ExpenseMatrix matrix={matrix} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Jurídico, semana 2' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      { categoryId: 'legal', week: 2 },
      'Jurídico · Semana 2',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Total de Honorarios' }));
    expect(onSelect).toHaveBeenLastCalledWith({ categoryId: 'fees' }, 'Honorarios');

    fireEvent.click(screen.getByRole('button', { name: 'Total de la semana 1' }));
    expect(onSelect).toHaveBeenLastCalledWith({ week: 1 }, 'Semana 1');

    fireEvent.click(screen.getByRole('button', { name: 'Total del mes' }));
    expect(onSelect).toHaveBeenLastCalledWith({}, 'Todo el mes');

    // Las celdas en cero no son botones.
    expect(screen.queryByRole('button', { name: 'Jurídico, semana 1' })).toBeNull();
  });
});
