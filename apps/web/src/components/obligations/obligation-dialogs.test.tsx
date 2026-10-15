import type { Obligation, ObligationDetail } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  completeDueDate,
  createObligation,
  getObligation,
  setPendingDueDate,
} from '@/lib/obligations-api';
import { CompleteDueDateDialog } from './complete-due-date-dialog';
import { ObligationFormDialog } from './obligation-form-dialog';
import { ObligationHistorySheet } from './obligation-history-sheet';

vi.mock('@/lib/obligations-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/obligations-api')>()),
  completeDueDate: vi.fn(),
  createObligation: vi.fn(),
  getObligation: vi.fn(),
  setPendingDueDate: vi.fn(),
}));

const obligation = (overrides: Partial<Obligation> = {}): Obligation => ({
  id: '11111111-1111-4111-8111-111111111111',
  entityName: 'DIAN',
  concept: 'IVA',
  frequency: 'quarterly',
  noticeDays: 15,
  notes: null,
  pending: { id: '22222222-2222-4222-8222-222222222222', dueDate: '2026-11-12' },
  status: 'scheduled',
  daysLeft: 29,
  ...overrides,
});

let client: QueryClient;
const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

beforeEach(() => {
  client = new QueryClient();
  vi.mocked(completeDueDate).mockReset();
  vi.mocked(createObligation).mockReset();
  vi.mocked(setPendingDueDate).mockReset();
});

describe('CompleteDueDateDialog (F13 CA-20)', () => {
  const renderDialog = (o: Obligation) => {
    wrap(<CompleteDueDateDialog obligation={o} onClose={vi.fn()} />);
    return screen.getByLabelText('Próximo vencimiento');
  };

  it('sugiere la fecha siguiente según la periodicidad', () => {
    expect(renderDialog(obligation())).toHaveValue('2027-02-12');
  });

  it('si el día no existe en el mes de destino, usa el último día', () => {
    const o = obligation({
      frequency: 'monthly',
      pending: { id: '22222222-2222-4222-8222-222222222222', dueDate: '2026-01-31' },
    });
    expect(renderDialog(o)).toHaveValue('2026-02-28');
  });

  it('en una obligación única viene vacío y completa sin siguiente', async () => {
    vi.mocked(completeDueDate).mockResolvedValue({} as ObligationDetail);
    const o = obligation({ frequency: 'once' });
    expect(renderDialog(o)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Completar' }));
    await vi.waitFor(() => {
      expect(completeDueDate).toHaveBeenCalledWith(o.id, { dueDateId: o.pending!.id });
    });
  });

  it('envía el vencimiento que se ve y la fecha elegida', async () => {
    vi.mocked(completeDueDate).mockResolvedValue({} as ObligationDetail);
    const o = obligation();
    fireEvent.change(renderDialog(o), { target: { value: '2027-02-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Completar' }));
    await vi.waitFor(() => {
      expect(completeDueDate).toHaveBeenCalledWith(o.id, {
        dueDateId: o.pending!.id,
        nextDueDate: '2027-02-20',
      });
    });
  });

  it('si otra persona ya lo completó, muestra el mensaje y refresca la agenda', async () => {
    vi.mocked(completeDueDate).mockRejectedValue(new ApiError(409, 'DUE_DATE_ALREADY_COMPLETED'));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderDialog(obligation());
    fireEvent.click(screen.getByRole('button', { name: 'Completar' }));
    expect(await screen.findByText(/Otra persona ya marcó este vencimiento/)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['obligations'] });
  });
});

describe('ObligationFormDialog (F13 CA-19)', () => {
  it('sugiere las entidades ya usadas, sin repetir', () => {
    wrap(
      <ObligationFormDialog
        obligation={null}
        entities={['DIAN', 'Fontur', 'DIAN']}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Entidad');
    const list = document.getElementById(input.getAttribute('list')!)!;
    expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual(['DIAN', 'Fontur']);
    expect(screen.getByLabelText('Primer vencimiento')).toBeInTheDocument();
  });

  it('al editar no pide el primer vencimiento', () => {
    wrap(<ObligationFormDialog obligation={obligation()} entities={[]} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Primer vencimiento')).toBeNull();
    expect(screen.getByLabelText('Entidad')).toHaveValue('DIAN');
  });

  it('crea con los días de aviso como número', async () => {
    vi.mocked(createObligation).mockResolvedValue({} as ObligationDetail);
    wrap(<ObligationFormDialog obligation={null} entities={[]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Entidad'), { target: { value: 'Fontur' } });
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Contribución' } });
    fireEvent.change(screen.getByLabelText('Días de aviso'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Primer vencimiento'), {
      target: { value: '2026-12-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(createObligation).toHaveBeenCalledWith(
        expect.objectContaining({
          entityName: 'Fontur',
          concept: 'Contribución',
          frequency: 'monthly',
          noticeDays: 30,
          firstDueDate: '2026-12-15',
        }),
      );
    });
  });
});

describe('ObligationHistorySheet (F13 CA-21)', () => {
  const detail = (pending: boolean): ObligationDetail => ({
    ...obligation(pending ? {} : { pending: null, status: 'none', daysLeft: null }),
    history: [
      ...(pending
        ? [
            {
              id: '22222222-2222-4222-8222-222222222222',
              dueDate: '2026-11-12',
              completedAt: null,
              completedBy: null,
            },
          ]
        : []),
      {
        id: '33333333-3333-4333-8333-333333333333',
        dueDate: '2026-08-12',
        // 01:00 en UTC es el 9 de agosto en Bogotá.
        completedAt: '2026-08-10T01:00:00.000Z',
        completedBy: { id: '44444444-4444-4444-8444-444444444444', name: 'Ana Gómez' },
      },
    ],
  });

  it('muestra quién y cuándo completó (día de Bogotá) y deja cambiar la fecha del pendiente', async () => {
    vi.mocked(getObligation).mockResolvedValue(detail(true));
    vi.mocked(setPendingDueDate).mockResolvedValue(detail(true));
    wrap(<ObligationHistorySheet obligationId={obligation().id} onClose={vi.fn()} />);
    expect(await screen.findByText('Hecho el 09/08/2026 por Ana Gómez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fecha del pendiente'), {
      target: { value: '2026-11-20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar fecha' }));
    await vi.waitFor(() => {
      expect(setPendingDueDate).toHaveBeenCalledWith(obligation().id, { dueDate: '2026-11-20' });
    });
  });

  it('sin pendiente ofrece agregar un vencimiento', async () => {
    vi.mocked(getObligation).mockResolvedValue(detail(false));
    wrap(<ObligationHistorySheet obligationId={obligation().id} onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Agregar vencimiento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
  });
});
