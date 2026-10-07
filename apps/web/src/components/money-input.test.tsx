import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput } from './money-input';

describe('MoneyInput', () => {
  it('entrega el valor canónico mientras se escribe en formato colombiano', () => {
    const onChange = vi.fn();
    render(<MoneyInput aria-label="Valor" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '1.500.000' } });
    expect(onChange).toHaveBeenLastCalledWith('1500000.00');
  });

  it('al salir del campo muestra el valor formateado', () => {
    const onChange = vi.fn();
    render(<MoneyInput aria-label="Valor" value={null} onChange={onChange} />);
    const input = screen.getByLabelText('Valor');
    fireEvent.change(input, { target: { value: '2500000,5' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('2.500.000,50');
  });

  it('un texto inválido entrega null y marca el campo', () => {
    const onChange = vi.fn();
    render(<MoneyInput aria-label="Valor" value={null} onChange={onChange} />);
    const input = screen.getByLabelText('Valor');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('muestra el valor inicial formateado', () => {
    render(<MoneyInput aria-label="Valor" value="4500000.00" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Valor')).toHaveValue('4.500.000');
  });
});
