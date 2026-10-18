import type { Contract } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContractDetailSheet } from './contract-detail-sheet';

const contract: Contract = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceProviderId: '22222222-2222-4222-8222-222222222222',
  startDate: '2026-01-01',
  endDate: null,
  workAgreement:
    'Asistente administrativa. Apoyo en facturación, archivo y atención a proveedores.',
  paymentFrequency: 'biweekly',
  monthlyAmount: '2000000.00',
  paymentMode: 'fixed',
  hasPayments: true,
  status: 'active',
  paidThisMonth: '1500000.00',
  document: null,
};

function renderSheet(c: Contract | null) {
  const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContractDetailSheet contract={c} onChanged={vi.fn(() => Promise.resolve())} {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('ContractDetailSheet (F17 CA-17b)', () => {
  it('muestra el contrato completo, con el acuerdo entero y el documento', () => {
    renderSheet(contract);
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('01/01/2026 – sin fecha de fin');
    expect(sheet).toHaveTextContent('Vigente');
    expect(sheet).toHaveTextContent('Quincenal');
    expect(sheet).toHaveTextContent('Monto fijo');
    expect(sheet).toHaveTextContent(/2\.000\.000/);
    expect(sheet).toHaveTextContent(/1\.500\.000/);
    expect(sheet).toHaveTextContent(contract.workAgreement);
    expect(screen.getByRole('button', { name: 'Subir' })).toBeVisible();
  });

  it('Editar y Eliminar actúan sobre el contrato', () => {
    const { onEdit, onDelete } = renderSheet(contract);
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(onEdit).toHaveBeenCalledWith(contract);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar contrato' }));
    expect(onDelete).toHaveBeenCalledWith(contract);
  });

  it('sin contrato, el panel está cerrado', () => {
    renderSheet(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
