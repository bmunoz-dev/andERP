import type { AppModule, LedgerEntry } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { getLedger } from '@/lib/expenses-api';
import { LedgerSheet } from './ledger-sheet';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/pagos">{children}</a>,
}));
vi.mock('@/lib/expenses-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/expenses-api')>()),
  getLedger: vi.fn(),
}));

const payment: LedgerEntry = {
  source: 'fee_payment',
  sourceId: '018f0000-0000-7000-8000-000000000003',
  categoryId: '018f0000-0000-7000-8000-000000000004',
  concept: 'Honorarios de Ana',
  invoiceNumber: null,
  paymentDate: '2026-09-05',
  weekOfMonth: 1,
  amount: '50000.00',
};

async function renderSheet(modules: AppModule[]) {
  authStore.setSession({
    accessToken: 'token',
    user: {
      id: '018f0000-0000-7000-8000-000000000001',
      email: 'ana@empresa.co',
      firstName: 'Ana',
      lastName: 'Gómez',
      isSuperAdmin: false,
      organization: { id: '018f0000-0000-7000-8000-000000000002', name: 'Empresa' },
      organizations: [{ id: '018f0000-0000-7000-8000-000000000002', name: 'Empresa' }],
      role: 'admin',
      modules,
    },
  });
  vi.mocked(getLedger).mockResolvedValue([payment]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LedgerSheet
        year={2026}
        month={9}
        selection={{ filter: {}, title: 'Honorarios' }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await screen.findByText('Honorarios de Ana');
}

describe('LedgerSheet (F19 CA-19)', () => {
  it('con Pagos al personal, el pago enlaza a /pagos', async () => {
    await renderSheet(['staff_payments']);
    expect(screen.getByRole('link', { name: 'Ver pago por días' })).toBeInTheDocument();
  });

  it('sin Pagos al personal, el pago se muestra sin enlace', async () => {
    await renderSheet([]);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
