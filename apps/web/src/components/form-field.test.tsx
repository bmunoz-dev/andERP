import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';

describe('FormField', () => {
  it('un campo de contraseña empieza oculto y el botón la muestra y la oculta', () => {
    render(<FormField label="Contraseña" type="password" />);
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('el botón no envía el formulario', () => {
    render(<FormField label="Contraseña" type="password" />);
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('los demás campos no tienen botón', () => {
    render(<FormField label="Correo" type="email" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
