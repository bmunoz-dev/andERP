import type { AuthProfile } from '@anderp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { switchOrganization } from '@/lib/auth-api';
import { announceSwitch, goHome } from '@/lib/organization-switch';
import { OrganizationSwitcher } from './organization-switcher';

vi.mock('@/lib/auth-api', () => ({ switchOrganization: vi.fn() }));
vi.mock('@/lib/organization-switch', () => ({ goHome: vi.fn(), announceSwitch: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const base = { id: '018f0000-0000-7000-8000-000000000002', name: 'Base' };
const other = { id: '018f0000-0000-7000-8000-000000000003', name: 'Taller' };

const userWith = (organizations: AuthProfile['organizations']): AuthProfile => ({
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'ana@empresa.co',
  firstName: 'Ana',
  lastName: 'Gómez',
  isSuperAdmin: false,
  organization: base,
  organizations,
  role: 'admin',
  modules: [],
});

beforeEach(() => {
  // Radix posiciona el menú con ResizeObserver, que jsdom no trae.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function openMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: /Base/ }), { key: 'Enter' });
}

describe('OrganizationSwitcher (F20)', () => {
  it('CA-13 con una sola organización muestra solo el nombre, sin menú', () => {
    render(<OrganizationSwitcher user={userWith([base])} />);
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CA-13 con dos o más, un menú con la lista y la activa marcada', async () => {
    render(<OrganizationSwitcher user={userWith([base, other])} />);
    openMenu();
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Base' })).toBeChecked();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Taller' })).not.toBeChecked();
  });

  it('CA-14 elegir otra organización la cambia, avisa a las otras pestañas y va a /egresos', async () => {
    vi.mocked(switchOrganization).mockResolvedValue(undefined);
    render(<OrganizationSwitcher user={userWith([base, other])} />);
    openMenu();
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Taller' }));

    await waitFor(() => {
      expect(goHome).toHaveBeenCalled();
    });
    expect(switchOrganization).toHaveBeenCalledWith(other.id);
    expect(announceSwitch).toHaveBeenCalled();
  });

  it('CA-14 elegir la organización activa no hace nada', async () => {
    render(<OrganizationSwitcher user={userWith([base, other])} />);
    openMenu();
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Base' }));

    expect(switchOrganization).not.toHaveBeenCalled();
    expect(goHome).not.toHaveBeenCalled();
  });

  it('si el cambio falla, muestra el error y no recarga', async () => {
    vi.mocked(switchOrganization).mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
    render(<OrganizationSwitcher user={userWith([base, other])} />);
    openMenu();
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Taller' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No encontramos lo que buscas.');
    });
    expect(announceSwitch).not.toHaveBeenCalled();
    expect(goHome).not.toHaveBeenCalled();
  });
});
