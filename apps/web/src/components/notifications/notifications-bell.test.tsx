import type { NotificationItem, Notifications } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissNotification,
  getNotifications,
  markNotificationsSeen,
} from '@/lib/notifications-api';
import { NotificationsBell } from './notifications-bell';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/lib/notifications-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications-api')>()),
  getNotifications: vi.fn(),
  markNotificationsSeen: vi.fn(),
  dismissNotification: vi.fn(),
}));

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  dueDateId: crypto.randomUUID(),
  kind: 'obligation_upcoming',
  obligationId: crypto.randomUUID(),
  entityName: 'DIAN',
  concept: 'IVA bimestral',
  dueDate: '2026-10-20',
  daysLeft: 5,
  seen: false,
  ...overrides,
});

async function renderBell(data: Notifications) {
  vi.mocked(getNotifications).mockResolvedValue(data);
  vi.mocked(markNotificationsSeen).mockResolvedValue(undefined);
  vi.mocked(dismissNotification).mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsBell />
    </QueryClientProvider>,
  );
  return screen.findByRole('button', {
    name: data.unseen ? 'Notificaciones sin revisar' : 'Notificaciones',
  });
}

beforeEach(() => {
  navigate.mockReset();
  // Radix posiciona el panel con ResizeObserver, que jsdom no trae.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('NotificationsBell (F14)', () => {
  it('CA-12 un punto, sin número, si hay notificaciones sin revisar', async () => {
    const bell = await renderBell({ unseen: true, items: [item({}), item({})] });
    expect(screen.getByTestId('notifications-dot')).toBeInTheDocument();
    expect(bell).toHaveTextContent('');
  });

  it('CA-12 sin punto si todo está revisado', async () => {
    await renderBell({ unseen: false, items: [item({ seen: true })] });
    expect(screen.queryByTestId('notifications-dot')).toBeNull();
  });

  it('CA-13 y CA-14 abrir marca como vistas y señala las nuevas', async () => {
    const bell = await renderBell({
      unseen: true,
      items: [
        item({ kind: 'obligation_overdue', concept: 'Renta', dueDate: '2026-10-10', daysLeft: -5 }),
        item({ concept: 'ICA', seen: true }),
      ],
    });
    fireEvent.click(bell);

    expect(await screen.findByText('DIAN · Renta')).toBeInTheDocument();
    expect(screen.getByText('Vence 10/10/2026 · hace 5 días')).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('Próximo')).toBeInTheDocument();
    expect(screen.getAllByText('Nueva')).toHaveLength(1);
    expect(markNotificationsSeen).toHaveBeenCalledOnce();
  });

  it('CA-15 pulsar una notificación lleva a su pestaña de la Agenda y cierra el panel', async () => {
    fireEvent.click(
      await renderBell({
        unseen: false,
        items: [item({ kind: 'obligation_overdue', seen: true })],
      }),
    );
    fireEvent.click(await screen.findByText('DIAN · IVA bimestral'));

    expect(navigate).toHaveBeenCalledWith({ to: '/agenda', search: { status: 'overdue' } });
    expect(screen.queryByText('DIAN · IVA bimestral')).toBeNull();
    expect(markNotificationsSeen).not.toHaveBeenCalled();
  });

  it('CA-16 la X descarta la notificación', async () => {
    const n = item({ seen: true });
    fireEvent.click(await renderBell({ unseen: false, items: [n] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

    await vi.waitFor(() => {
      expect(dismissNotification).toHaveBeenCalled();
    });
    expect(vi.mocked(dismissNotification).mock.calls[0]?.[0]).toEqual({
      dueDateId: n.dueDateId,
      kind: n.kind,
    });
  });

  it('CA-17 sin notificaciones', async () => {
    fireEvent.click(await renderBell({ unseen: false, items: [] }));
    expect(await screen.findByText('No tienes notificaciones.')).toBeInTheDocument();
  });
});
