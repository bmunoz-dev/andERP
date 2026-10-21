import type { Organization } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOrganizations, updateOrganization } from '@/lib/admin-api';
import { Route } from './organizaciones';

vi.mock('@/lib/admin-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin-api')>()),
  listOrganizations: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
}));

const org = (overrides: Partial<Organization>): Organization => ({
  id: crypto.randomUUID(),
  name: 'Clínica Norte',
  taxId: '900123456-7',
  status: 'active',
  modules: [],
  memberCount: 1,
  createdAt: '2026-10-20T12:00:00Z',
  ...overrides,
});

async function renderPage(organizations: Organization[]) {
  vi.mocked(listOrganizations).mockResolvedValue(organizations);
  const Page = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
  await screen.findByText(organizations[0]?.name ?? '');
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

beforeEach(() => {
  vi.mocked(updateOrganization).mockReset();
});

describe('Plataforma → Organizaciones (F19)', () => {
  it('CA-22 la columna Módulos muestra una insignia por paquete o "Solo Base"', async () => {
    await renderPage([
      org({ name: 'Clínica Norte', modules: ['staff_payments', 'agenda'] }),
      org({ name: 'Taller Sur', modules: [] }),
    ]);
    expect(screen.getByRole('columnheader', { name: 'Módulos' })).toBeInTheDocument();
    const north = within(rowOf('Clínica Norte'));
    expect(north.getByText('Personal y pagos')).toBeInTheDocument();
    expect(north.getByText('Agenda')).toBeInTheDocument();
    expect(north.queryByText('Credenciales')).toBeNull();
    expect(within(rowOf('Taller Sur')).getByText('Solo Base')).toBeInTheDocument();
  });

  it('CA-21 al crear, una casilla por paquete y todas desmarcadas', async () => {
    await renderPage([org({})]);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva organización' }));
    const dialog = await screen.findByRole('dialog');
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(within(dialog).getByLabelText(/Cuentas aéreas/)).toBeInTheDocument();
  });

  it('CA-21 la acción Módulos guarda el conjunto completo con PATCH', async () => {
    const north = org({ name: 'Clínica Norte', modules: ['agenda'] });
    vi.mocked(updateOrganization).mockResolvedValue({
      ...north,
      modules: ['agenda', 'credentials'],
    });
    await renderPage([north]);
    fireEvent.click(within(rowOf('Clínica Norte')).getByRole('button', { name: 'Módulos' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Agenda/)).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText(/Credenciales/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(updateOrganization).toHaveBeenCalledWith(north.id, {
        modules: ['credentials', 'agenda'],
      });
    });
  });

  it('CA-23 quitar un paquete encendido pide confirmación antes de guardar', async () => {
    const north = org({ name: 'Clínica Norte', modules: ['agenda', 'credentials'] });
    vi.mocked(updateOrganization).mockResolvedValue({ ...north, modules: ['credentials'] });
    await renderPage([north]);
    fireEvent.click(within(rowOf('Clínica Norte')).getByRole('button', { name: 'Módulos' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Agenda/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      'Los usuarios de Clínica Norte dejarán de ver Agenda. Los datos no se borran.',
    );
    expect(updateOrganization).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => {
      expect(updateOrganization).toHaveBeenCalledWith(north.id, { modules: ['credentials'] });
    });
  });
});
