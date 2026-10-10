import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

const renderDialog = (destructive: boolean) =>
  render(
    <ConfirmDialog
      open
      onOpenChange={vi.fn()}
      title="¿Eliminar?"
      description="No se puede deshacer."
      confirmLabel="Eliminar"
      destructive={destructive}
      onConfirm={vi.fn()}
    />,
  );

describe('ConfirmDialog (F08 CA-6)', () => {
  it('el botón destructivo es rojo sólido y no arrastra el estilo por defecto', () => {
    renderDialog(true);
    const button = screen.getByRole('button', { name: 'Eliminar' });
    expect(button).toHaveClass('bg-destructive-solid', 'text-white');
    expect(button).not.toHaveClass('bg-primary');
  });

  it('sin `destructive` usa el botón por defecto', () => {
    renderDialog(false);
    const button = screen.getByRole('button', { name: 'Eliminar' });
    expect(button).toHaveClass('bg-primary');
    expect(button).not.toHaveClass('bg-destructive-solid');
  });
});
