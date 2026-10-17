import type { Obligation } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { listObligations } from '@/lib/obligations-api';
import { AgendaBadge } from './agenda-badge';
import { AgendaTable } from './agenda-table';
import { AgendaTabs } from './agenda-tabs';

vi.mock('@/lib/obligations-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/obligations-api')>()),
  listObligations: vi.fn(),
}));

const obligation = (overrides: Partial<Obligation>): Obligation => ({
  id: crypto.randomUUID(),
  entityName: 'DIAN',
  concept: 'IVA bimestral',
  frequency: 'bimonthly',
  noticeDays: 15,
  notes: null,
  pending: { id: crypto.randomUUID(), dueDate: '2026-11-12' },
  status: 'scheduled',
  daysLeft: 29,
  ...overrides,
});

function renderBadge(rows: Obligation[]) {
  vi.mocked(listObligations).mockResolvedValue(rows);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AgendaBadge />
    </QueryClientProvider>,
  );
}

describe('AgendaBadge (F13 CA-16)', () => {
  it('rojo con el total si hay alguna vencida', async () => {
    renderBadge([obligation({ status: 'overdue' }), obligation({ status: 'upcoming' })]);
    const badge = await screen.findByTestId('agenda-badge');
    expect(badge).toHaveTextContent('2');
    expect(badge).toHaveAttribute('data-tone', 'overdue');
  });

  it('ámbar si solo hay próximas', async () => {
    renderBadge([obligation({ status: 'upcoming' }), obligation({ status: 'scheduled' })]);
    const badge = await screen.findByTestId('agenda-badge');
    expect(badge).toHaveTextContent('1');
    expect(badge).toHaveAttribute('data-tone', 'upcoming');
  });

  it('sin contador si no hay alertas', async () => {
    renderBadge([obligation({ status: 'scheduled' })]);
    await vi.waitFor(() => {
      expect(listObligations).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('agenda-badge')).toBeNull();
  });
});

describe('AgendaTable (F13 CA-18)', () => {
  const rows = [
    obligation({ status: 'overdue', daysLeft: -3, pending: { id: 'p1', dueDate: '2026-10-11' } }),
    obligation({ status: 'upcoming', daysLeft: 0, concept: 'Renta', frequency: 'annual' }),
    obligation({ status: 'none', pending: null, daysLeft: null, entityName: 'Fontur' }),
  ];

  function renderTable(onComplete = vi.fn()) {
    render(
      <AgendaTable
        data={rows}
        isLoading={false}
        onComplete={onComplete}
        onHistory={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    return screen.getAllByRole('row').slice(1);
  }

  it('muestra estado, periodicidad y cuándo vence', () => {
    const [overdue, today, none] = renderTable();
    expect(overdue).toHaveTextContent('Vencido');
    expect(overdue).toHaveTextContent(/11\/10\/2026\s*hace 3 días/);
    expect(overdue).toHaveTextContent('Bimestral');
    expect(today).toHaveTextContent('Próximo');
    expect(today).toHaveTextContent('hoy');
    expect(today).toHaveTextContent('Anual');
    expect(none).toHaveTextContent('Sin próximo');
  });

  it('"Completar" solo aparece con un vencimiento pendiente', () => {
    const onComplete = vi.fn();
    const [overdue, , none] = renderTable(onComplete);
    expect(within(none!).queryByRole('button', { name: 'Completar' })).toBeNull();
    fireEvent.click(within(overdue!).getByRole('button', { name: 'Completar' }));
    expect(onComplete).toHaveBeenCalledWith(rows[0]);
  });

  it('en el celular muestra tarjetas con todos los datos y se completa desde la tarjeta (F15 HU1)', () => {
    vi.stubGlobal('innerWidth', 375);
    const onComplete = vi.fn();
    render(
      <AgendaTable
        data={rows}
        isLoading={false}
        onComplete={onComplete}
        onHistory={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    const [overdue] = screen.getAllByRole('listitem');
    expect(overdue).toHaveTextContent('Vencido');
    expect(overdue).toHaveTextContent(/11\/10\/2026\s*hace 3 días/);
    expect(overdue).toHaveTextContent('Bimestral');
    fireEvent.click(within(overdue!).getByRole('button', { name: 'Completar' }));
    expect(onComplete).toHaveBeenCalledWith(rows[0]);
  });
});

describe('AgendaTabs (F13 CA-17)', () => {
  const rows = [
    obligation({ status: 'overdue' }),
    obligation({ status: 'upcoming' }),
    obligation({ status: 'upcoming' }),
    obligation({ status: 'none', pending: null, daysLeft: null }),
  ];

  it('muestra cada pestaña con su número y marca la elegida', () => {
    render(<AgendaTabs data={rows} value="upcoming" onChange={vi.fn()} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Todos (4)',
      'Vencidos (1)',
      'Próximos (2)',
      'Programados (0)',
      'Sin próximo (1)',
    ]);
    expect(screen.getByRole('tab', { name: 'Próximos (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('sin estado elegido marca "Todos"', () => {
    render(<AgendaTabs data={rows} value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Todos (4)' })).toHaveAttribute('aria-selected', 'true');
  });
});
