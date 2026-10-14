import type { ClickiuMovement } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { createClickiuMovement } from '@/lib/clickiu-api';
import { MovementFormDialog } from './movement-form-dialog';

vi.mock('@/lib/clickiu-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clickiu-api')>()),
  createClickiuMovement: vi.fn(),
}));

const sale: ClickiuMovement = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'sale',
  status: 'credit',
  movementDate: '2026-10-05',
  amount: '300000.00',
  description: null,
};

function renderDialog(props: { type: 'recharge' | 'sale'; movement?: ClickiuMovement }) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MovementFormDialog
        type={props.type}
        movement={props.movement ?? null}
        currentBalance="700000.00"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const amount = () => screen.getByLabelText('Monto');

beforeEach(() => {
  vi.mocked(createClickiuMovement).mockReset();
});

describe('MovementFormDialog (F11 CA-20)', () => {
  it('una recarga no pide estado ni muestra el saldo', () => {
    renderDialog({ type: 'recharge' });
    expect(screen.getByRole('heading', { name: 'Nueva recarga' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Estado' })).toBeNull();
    expect(screen.queryByTestId('available-balance')).toBeNull();
  });

  it('una venta pide estado (Crédito por defecto) y avisa si supera el saldo', () => {
    renderDialog({ type: 'sale' });
    expect(screen.getByRole('heading', { name: 'Nueva venta' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveTextContent('Crédito');
    expect(screen.getByTestId('available-balance')).toHaveTextContent(/\$\s*700\.000/);

    fireEvent.change(amount(), { target: { value: '700000' } });
    expect(screen.queryByText(/Supera el saldo disponible/)).toBeNull();
    fireEvent.change(amount(), { target: { value: '750000' } });
    expect(screen.getByText(/Supera el saldo disponible en\s*\$\s*50\.000/)).toBeInTheDocument();
  });

  it('al editar una venta, el saldo disponible suma su monto original', () => {
    renderDialog({ type: 'sale', movement: sale });
    expect(screen.getByRole('heading', { name: 'Editar venta' })).toBeInTheDocument();
    expect(screen.getByTestId('available-balance')).toHaveTextContent(/\$\s*1\.000\.000/);
  });

  it('muestra el mensaje en español si la API rechaza por saldo', async () => {
    vi.mocked(createClickiuMovement).mockRejectedValue(
      new ApiError(422, 'CLICKIU_INSUFFICIENT_BALANCE'),
    );
    renderDialog({ type: 'sale' });
    fireEvent.change(amount(), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('El saldo de Clic Kiu no alcanza para este movimiento.'),
    ).toBeInTheDocument();
    expect(createClickiuMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sale', status: 'credit', amount: '100.00' }),
    );
  });
});
