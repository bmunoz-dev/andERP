import type { ContractOption, FeePayment } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOverlappingContracts } from '@/lib/fee-payments-api';
import { FeePaymentForm } from './fee-payment-form';

vi.mock('@/lib/fee-payments-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fee-payments-api')>()),
  listOverlappingContracts: vi.fn(),
}));

const contract: ContractOption = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceProvider: { id: '22222222-2222-4222-8222-222222222222', name: 'Ana Pérez' },
  startDate: '2026-01-01',
  endDate: null,
  monthlyAmount: '1000000.00',
  // Lo ya pagado en agosto sin contar el pago que se edita.
  paidInMonth: '700000.00',
};

const payment: FeePayment = {
  id: '33333333-3333-4333-8333-333333333333',
  contractId: contract.id,
  serviceProvider: contract.serviceProvider,
  periodYear: 2026,
  periodMonth: 8,
  weekOfMonth: 4,
  periodStart: '2026-08-22',
  periodEnd: '2026-08-31',
  paymentDate: '2026-09-02',
  notes: null,
  total: '200000.00',
  days: [{ workDate: '2026-08-24', amount: '200000.00', isHoliday: false }],
};

beforeEach(() => {
  vi.mocked(listOverlappingContracts).mockResolvedValue([contract]);
});

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeePaymentForm payment={payment} onSaved={vi.fn()} />
    </QueryClientProvider>,
  );

describe('FeePaymentForm (F10 CA-9)', () => {
  it('muestra lo pagado en el mes contando este pago, sin aviso si no supera', async () => {
    renderForm();
    const summary = await screen.findByTestId('month-summary');
    expect(summary).toHaveTextContent(/Pagado en agosto:\s*\$\s*900\.000 de\s*\$\s*1\.000\.000/);
    expect(screen.queryByText(/Supera el monto mensual/)).toBeNull();
    // Al editar, lo pagado del mes no cuenta este pago dos veces.
    expect(listOverlappingContracts).toHaveBeenCalledWith('2026-08-22', '2026-08-31', payment.id);
  });

  it('avisa si se supera el monto mensual y deja guardar', async () => {
    renderForm();
    await screen.findByTestId('month-summary');
    fireEvent.change(screen.getByLabelText('lun 24/08'), { target: { value: '450.000' } });
    expect(await screen.findByText(/Supera el monto mensual en\s*\$\s*150\.000/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });
});
