import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revealCredential } from '@/lib/credentials-api';
import { CopyButton, RevealButton } from './password-buttons';

vi.mock('@/lib/credentials-api', () => ({ revealCredential: vi.fn() }));

beforeEach(() => {
  vi.mocked(revealCredential).mockResolvedValue({ password: 'S3creta!' });
});

describe('RevealButton (F06 CA-14)', () => {
  it('muestra la contraseña y la oculta al cumplirse el tiempo', async () => {
    render(<RevealButton credentialId="c1" visibleMs={300} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revelar' }));
    expect(await screen.findByText('S3creta!')).toBeVisible();
    expect(revealCredential).toHaveBeenCalledWith('c1');
    await waitFor(() => {
      expect(screen.queryByText('S3creta!')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Revelar' })).toBeVisible();
  });

  it('se puede ocultar antes de tiempo', async () => {
    render(<RevealButton credentialId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Revelar' }));
    await screen.findByText('S3creta!');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByText('S3creta!')).toBeNull();
  });
});

describe('CopyButton (F06 CA-14)', () => {
  it('copia la contraseña al portapapeles sin mostrarla', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CopyButton credentialId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('S3creta!');
    });
    expect(screen.queryByText('S3creta!')).toBeNull();
  });
});
