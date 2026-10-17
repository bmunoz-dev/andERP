import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
  city: string;
}

const onEdit = vi.fn();
const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Nombre' },
  { accessorKey: 'city', header: 'Ciudad' },
  {
    id: 'actions',
    header: () => <span className="sr-only">Acciones</span>,
    cell: ({ row }) => (
      <button
        type="button"
        onClick={() => {
          onEdit(row.original.id);
        }}
      >
        Editar
      </button>
    ),
  },
];
const rows: Row[] = [
  { id: '1', name: 'Ana', city: 'Bogotá' },
  { id: '2', name: 'Luis', city: 'Cali' },
];

const table = (props: Partial<{ data: Row[] | undefined; isLoading: boolean }> = {}) => (
  <DataTable
    columns={columns}
    data={rows}
    emptyMessage="Sin datos."
    getRowId={(r) => r.id}
    {...props}
  />
);

describe('DataTable en el celular (F15 CA-1–CA-4)', () => {
  it('desde 768 px muestra la tabla', () => {
    render(table());
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('por debajo de 768 px muestra una tarjeta por fila con todas las columnas', () => {
    vi.stubGlobal('innerWidth', 375);
    render(table());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Nombre: Ana');
    expect(cards[0]).toHaveTextContent('Ciudad: Bogotá');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1]!);
    expect(onEdit).toHaveBeenCalledWith('2');
  });

  it('no dibuja la tabla ni en el primer render', () => {
    vi.stubGlobal('innerWidth', 375);
    expect(renderToStaticMarkup(table())).not.toContain('<table');
  });

  it('muestra la carga y el mensaje de vacío', () => {
    vi.stubGlobal('innerWidth', 375);
    const { rerender, container } = render(table({ isLoading: true }));
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    rerender(table({ data: [] }));
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});
