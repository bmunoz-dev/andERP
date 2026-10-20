import type { AirMovement } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAirMovement } from '@/lib/air-accounts-api';
import { ApiError } from '@/lib/api-client';
import { IssueFormDialog } from './issue-form-dialog';
import { MovementFilters } from './movement-filters';
import { MovementFormDialog } from './movement-form-dialog';
import { MovementSummaryCards } from './movement-summary-cards';
import { MovementsTable } from './movements-table';

vi.mock('@/lib/air-accounts-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/air-accounts-api')>()),
  createAirMovement: vi.fn(),
}));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const movement = (overrides: Partial<AirMovement>): AirMovement => ({
  id: crypto.randomUUID(),
  accountId: ACCOUNT,
  type: 'recharge',
  movementDate: '2026-10-05',
  amount: '1000000.00',
  description: null,
  pnr: null,
  ticketNumber: null,
  passenger: null,
  netFare: null,
  taxes: null,
  collectionStatus: null,
  ...overrides,
});

const issue = movement({
  type: 'issue',
  amount: '300000.00',
  pnr: 'K4J2LL',
  ticketNumber: '1234567890123',
  passenger: 'Ana Pérez',
  netFare: '250000.00',
  taxes: '50000.00',
  collectionStatus: 'pending',
});

const withQuery = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  vi.mocked(createAirMovement).mockReset();
});

describe('MovementFilters (F18 CA-29)', () => {
  const filters = { from: '2026-10-01', to: '2026-10-31' };

  it('el estado de cobro solo se habilita con Tipo = Emisión', () => {
    const { rerender } = render(<MovementFilters value={filters} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Estado de cobro' })).toBeDisabled();
    rerender(<MovementFilters value={{ ...filters, type: 'issue' }} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Estado de cobro' })).toBeEnabled();
  });

  it('cambiar una fecha conserva los demás filtros', () => {
    const onChange = vi.fn();
    render(<MovementFilters value={{ ...filters, type: 'issue' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-10-31', type: 'issue' });
  });
});

describe('MovementsTable (F18 CA-30)', () => {
  it('muestra el signo, los datos del tiquete y "Marcar como cobrado" solo en lo Por cobrar', () => {
    const onCollect = vi.fn();
    render(
      <MovementsTable
        data={[
          movement({ description: 'Recarga PSE' }),
          movement({ type: 'opening_balance', amount: '-12400000.00' }),
          issue,
        ]}
        isLoading={false}
        onCollect={onCollect}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const [recharge, opening, ticket] = screen.getAllByRole('row').slice(1);
    expect(recharge).toHaveTextContent(/Recarga\s*\+\s*\$\s*1\.000\.000/);
    expect(recharge).toHaveTextContent('Recarga PSE');
    expect(opening).toHaveTextContent(/Saldo inicial\s*−\s*\$\s*12\.400\.000/);
    expect(ticket).toHaveTextContent(/Emisión\s*−\s*\$\s*300\.000/);
    expect(ticket).toHaveTextContent('K4J2LL');
    expect(ticket).toHaveTextContent('1234567890123');
    expect(ticket).toHaveTextContent('Por cobrar');
    const buttons = screen.getAllByRole('button', { name: 'Marcar como cobrado' });
    expect(buttons).toHaveLength(1);
    buttons[0]!.click();
    expect(onCollect).toHaveBeenCalledWith(issue);
  });
});

describe('MovementSummaryCards (F18 CA-29)', () => {
  it('el saldo es al corte de Hasta, o el actual sin fecha', () => {
    const summary = {
      totalIn: '500.00',
      totalIssued: '200.00',
      pendingCollection: '150.00',
      balanceAsOf: '300.00',
      currentBalance: '240.00',
      available: '1240.00',
    };
    const { rerender } = render(<MovementSummaryCards summary={summary} to="2026-09-30" />);
    expect(screen.getByText('Saldo al 30/09/2026')).toBeVisible();
    rerender(<MovementSummaryCards summary={summary} />);
    expect(screen.getByText('Saldo actual')).toBeVisible();
    expect(screen.getByText('Disponible')).toBeVisible();
  });
});

describe('IssueFormDialog (F18 CA-31)', () => {
  const field = (label: string) => screen.getByLabelText(label);

  it('calcula el total y avisa si supera el disponible', () => {
    withQuery(
      <IssueFormDialog
        accountId={ACCOUNT}
        movement={null}
        available="300000.00"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Emitir tiquete' })).toBeInTheDocument();
    fireEvent.change(field('Tarifa neta'), { target: { value: '250000' } });
    fireEvent.change(field('Impuestos'), { target: { value: '50000' } });
    expect(screen.getByTestId('issue-total')).toHaveTextContent(/\$\s*300\.000/);
    expect(screen.queryByText(/Supera el disponible/)).toBeNull();
    fireEvent.change(field('Impuestos'), { target: { value: '60000' } });
    expect(screen.getByText(/Supera el disponible en\s*\$\s*10\.000/)).toBeInTheDocument();
  });

  it('al editar, el disponible suma el monto original', () => {
    withQuery(
      <IssueFormDialog
        accountId={ACCOUNT}
        movement={issue}
        available="0.00"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Editar emisión' })).toBeInTheDocument();
    expect(screen.getByTestId('issue-available')).toHaveTextContent(/\$\s*300\.000/);
  });

  it('muestra el mensaje en español si la API rechaza por cupo', async () => {
    vi.mocked(createAirMovement).mockRejectedValue(
      new ApiError(422, 'AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED'),
    );
    withQuery(
      <IssueFormDialog
        accountId={ACCOUNT}
        movement={null}
        available="1000000.00"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(field('PNR'), { target: { value: 'k4j2ll' } });
    fireEvent.change(field('Número de tiquete'), { target: { value: '1234567890123' } });
    fireEvent.change(field('Pasajero'), { target: { value: 'Ana Pérez' } });
    fireEvent.change(field('Tarifa neta'), { target: { value: '100' } });
    fireEvent.change(field('Impuestos'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(screen.getByText(/Cupo de crédito excedido/)).toBeInTheDocument();
    });
    expect(vi.mocked(createAirMovement)).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ type: 'issue', pnr: 'K4J2LL', netFare: '100.00', taxes: '0.00' }),
    );
  });
});

describe('MovementFormDialog (F18 CA-31)', () => {
  it('el saldo inicial "En deuda" se envía con signo negativo', async () => {
    vi.mocked(createAirMovement).mockResolvedValue(movement({ type: 'opening_balance' }));
    withQuery(
      <MovementFormDialog
        accountId={ACCOUNT}
        type="opening_balance"
        movement={null}
        onClose={vi.fn()}
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Saldo inicial' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '12400000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'En deuda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(vi.mocked(createAirMovement)).toHaveBeenCalledWith(
        ACCOUNT,
        expect.objectContaining({ type: 'opening_balance', amount: '-12400000.00' }),
      );
    });
  });

  it('una recarga no muestra el selector de signo', () => {
    withQuery(
      <MovementFormDialog
        accountId={ACCOUNT}
        type="recharge"
        movement={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nueva recarga' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
