import type { ClickiuMovement } from '@anderp/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MovementFilters } from './movement-filters';
import { MovementsTable } from './movements-table';

const movement = (overrides: Partial<ClickiuMovement>): ClickiuMovement => ({
  id: crypto.randomUUID(),
  type: 'sale',
  status: 'credit',
  movementDate: '2026-10-05',
  amount: '300000.00',
  description: null,
  ...overrides,
});

describe('MovementFilters (F11 CA-18)', () => {
  const filters = { from: '2026-10-01', to: '2026-10-31' };

  it('el estado solo se habilita con Tipo = Venta', () => {
    const { rerender } = render(<MovementFilters value={filters} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeDisabled();
    rerender(<MovementFilters value={{ ...filters, type: 'sale' }} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeEnabled();
  });

  it('cambiar una fecha conserva los demás filtros', () => {
    const onChange = vi.fn();
    render(<MovementFilters value={{ ...filters, type: 'sale' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-10-31', type: 'sale' });
  });
});

describe('MovementsTable (F11 CA-19)', () => {
  const rows = [
    movement({ type: 'recharge', status: null, amount: '1000000.00', description: 'Recarga PSE' }),
    movement({ status: 'credit' }),
    movement({ status: 'completed', amount: '200000.00' }),
  ];

  function renderTable(onComplete = vi.fn()) {
    render(
      <MovementsTable
        data={rows}
        isLoading={false}
        onComplete={onComplete}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    return screen.getAllByRole('row').slice(1);
  }

  it('muestra el signo, el estado y la descripción de cada movimiento', () => {
    const [recharge, credit, completed] = renderTable();
    expect(recharge).toHaveTextContent(/Recarga\s*\+\s*\$\s*1\.000\.000/);
    expect(recharge).toHaveTextContent('—');
    expect(recharge).toHaveTextContent('Recarga PSE');
    expect(credit).toHaveTextContent(/Venta\s*−\s*\$\s*300\.000/);
    expect(credit).toHaveTextContent('Crédito');
    expect(completed).toHaveTextContent('Completado');
  });

  it('"Marcar como completado" solo aparece en ventas en Crédito', () => {
    const onComplete = vi.fn();
    const [recharge, credit, completed] = renderTable(onComplete);
    const name = 'Marcar como completado';
    expect(within(recharge!).queryByRole('button', { name })).toBeNull();
    expect(within(completed!).queryByRole('button', { name })).toBeNull();
    fireEvent.click(within(credit!).getByRole('button', { name }));
    expect(onComplete).toHaveBeenCalledWith(rows[1]);
  });
});
