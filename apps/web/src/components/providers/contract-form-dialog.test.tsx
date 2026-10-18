import type { Contract } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContractFormDialog } from './contract-form-dialog';

const contract: Contract = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceProviderId: '22222222-2222-4222-8222-222222222222',
  startDate: '2026-01-01',
  endDate: null,
  workAgreement: 'Asistente',
  paymentFrequency: 'monthly',
  monthlyAmount: '2000000.00',
  paymentMode: 'fixed',
  hasPayments: true,
  status: 'active',
  paidThisMonth: '0.00',
};

function renderForm(c: Contract | null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContractFormDialog
        providerId={contract.serviceProviderId}
        contract={c}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('ContractFormDialog (F16 CA-20)', () => {
  it('un contrato nuevo elige la forma de pago, por días de entrada', () => {
    renderForm(null);
    const select = screen.getByRole('combobox', { name: 'Forma de pago' });
    expect(select).toBeEnabled();
    expect(select).toHaveTextContent('Por días trabajados');
  });

  it('con pagos, la forma de pago no se puede cambiar', () => {
    renderForm(contract);
    const select = screen.getByRole('combobox', { name: 'Forma de pago' });
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('Monto fijo');
    expect(screen.getByText(/ya tiene pagos/)).toBeInTheDocument();
  });
});
