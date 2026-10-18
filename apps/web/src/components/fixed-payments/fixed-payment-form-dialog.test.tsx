import type { ContractOption, FixedPayment } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOverlappingContracts } from '@/lib/fee-payments-api';
import { updateFixedPayment } from '@/lib/fixed-payments-api';
import { FixedPaymentFormDialog } from './fixed-payment-form-dialog';

vi.mock('@/lib/fee-payments-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fee-payments-api')>()),
  listOverlappingContracts: vi.fn(),
}));
vi.mock('@/lib/fixed-payments-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fixed-payments-api')>()),
  updateFixedPayment: vi.fn(),
}));

const option = (id: string, name: string, paymentMode: 'daily' | 'fixed'): ContractOption => ({
  id,
  serviceProvider: { id: `${id.slice(0, -1)}9`, name },
  startDate: '2026-01-01',
  endDate: null,
  monthlyAmount: '2000000.00',
  // Lo ya pagado en agosto sin contar el pago que se edita.
  paidInMonth: '1000000.00',
  paymentMode,
});
const daily = option('11111111-1111-4111-8111-111111111111', 'Ana', 'daily');
const fixed = option('22222222-2222-4222-8222-222222222222', 'Beto', 'fixed');

const payment: FixedPayment = {
  id: '33333333-3333-4333-8333-333333333333',
  contractId: fixed.id,
  serviceProvider: fixed.serviceProvider,
  periodYear: 2026,
  periodMonth: 8,
  paymentDate: '2026-08-15',
  amount: '1000000.00',
  notes: null,
};

const renderDialog = (p: FixedPayment | null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FixedPaymentFormDialog
        year={2026}
        month={8}
        payment={p}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(listOverlappingContracts).mockResolvedValue([daily, fixed]);
  vi.mocked(updateFixedPayment).mockResolvedValue(payment);
});

describe('FixedPaymentFormDialog (F16 CA-22)', () => {
  it('solo ofrece personas con contrato de monto fijo en el mes', async () => {
    vi.mocked(listOverlappingContracts).mockResolvedValue([daily]);
    renderDialog(null);
    expect(await screen.findByText(/Nadie tiene un contrato de monto fijo/)).toBeVisible();
    expect(listOverlappingContracts).toHaveBeenCalledWith('2026-08-01', '2026-08-31', undefined);
  });

  it('al editar muestra lo pagado en el mes y envía solo fecha, valor y notas', async () => {
    renderDialog(payment);
    expect(await screen.findByTestId('month-summary')).toHaveTextContent(
      /Pagado en agosto:\s*\$\s*2\.000\.000 de\s*\$\s*2\.000\.000/,
    );
    expect(listOverlappingContracts).toHaveBeenCalledWith('2026-08-01', '2026-08-31', payment.id);
    expect(screen.getByRole('combobox', { name: 'Persona' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '900.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(updateFixedPayment).toHaveBeenCalledWith(payment.id, {
        paymentDate: '2026-08-15',
        amount: '900000.00',
        notes: null,
      });
    });
  });

  it('con el valor vacío, el resumen del mes no se rompe', async () => {
    renderDialog(payment);
    await screen.findByTestId('month-summary');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '' } });
    expect(await screen.findByTestId('month-summary')).toHaveTextContent(
      /Pagado en agosto:\s*\$\s*1\.000\.000 de/,
    );
  });
});
