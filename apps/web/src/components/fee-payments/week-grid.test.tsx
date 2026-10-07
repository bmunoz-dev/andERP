import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { type DayValues, WeekGrid } from './week-grid';

function Harness(props: {
  start: string;
  end: string;
  contractStart: string;
  contractEnd: string | null;
}) {
  const [values, setValues] = useState<DayValues>({});
  return <WeekGrid {...props} values={values} onChange={setValues} />;
}

describe('WeekGrid', () => {
  it('muestra una columna por fecha del rango (semana 4 de agosto: 10 días)', () => {
    render(
      <Harness start="2026-08-22" end="2026-08-31" contractStart="2026-01-01" contractEnd={null} />,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(10);
    expect(screen.getByLabelText('sáb 22/08')).toBeInTheDocument();
    expect(screen.getByLabelText('lun 31/08')).toBeInTheDocument();
  });

  it('deshabilita los días fuera del contrato', () => {
    render(
      <Harness
        start="2026-08-22"
        end="2026-08-31"
        contractStart="2026-08-25"
        contractEnd="2026-08-30"
      />,
    );
    expect(screen.getByLabelText('lun 24/08')).toBeDisabled();
    expect(screen.getByLabelText('mar 25/08')).toBeEnabled();
    expect(screen.getByLabelText('lun 31/08')).toBeDisabled();
  });

  it('CA-8 sugiere los festivos de Colombia y deja cambiarlos', () => {
    render(
      <Harness start="2026-08-15" end="2026-08-21" contractStart="2026-01-01" contractEnd={null} />,
    );
    const holiday = screen.getByRole('checkbox', { name: 'Festivo lun 17/08' });
    expect(holiday).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Festivo mar 18/08' })).not.toBeChecked();
    fireEvent.click(holiday);
    expect(holiday).not.toBeChecked();
  });

  it('suma el total en vivo con los días que tienen valor', () => {
    render(
      <Harness start="2026-08-22" end="2026-08-31" contractStart="2026-01-01" contractEnd={null} />,
    );
    fireEvent.change(screen.getByLabelText('sáb 22/08'), { target: { value: '150.000' } });
    fireEvent.change(screen.getByLabelText('dom 23/08'), { target: { value: '100.000,50' } });
    expect(screen.getByTestId('week-total')).toHaveTextContent('250.000,50');
  });
});
