import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  emptyMessage: string;
  getRowId: (row: T) => string;
}

/** Tabla base de AndERP (F02-T016). La reutilizan los listados de F03 a F06. */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage,
  getRowId,
}: DataTableProps<T>) {
  // TanStack Table 8 no es compatible con el React Compiler (devuelve funciones no memoizables);
  // el componente simplemente no se optimiza. No afecta el funcionamiento.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });
  const isMobile = useIsMobile();

  if (isMobile) {
    // F15: una tarjeta por fila. Las columnas con cabecera de texto van como "Etiqueta: valor";
    // las demás (acciones) van al pie.
    if (isLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={`loading-${String(i)}`} className="h-20 w-full" />
          ))}
        </div>
      );
    }
    if (table.getRowModel().rows.length === 0) {
      return (
        <div className="flex h-24 items-center justify-center rounded-md border text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }
    return (
      <ul className="space-y-3">
        {table.getRowModel().rows.map((row) => {
          const cells = row.getVisibleCells();
          const isField = (c: (typeof cells)[number]) =>
            typeof c.column.columnDef.header === 'string';
          return (
            <li key={row.id} className="rounded-md border p-4 text-sm">
              <dl className="space-y-1">
                {cells.filter(isField).map((cell) => (
                  <div key={cell.id}>
                    <dt className="inline text-muted-foreground">
                      {String(cell.column.columnDef.header)}:
                    </dt>{' '}
                    <dd className="inline">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </dd>
                  </div>
                ))}
              </dl>
              {cells
                .filter((c) => !isField(c))
                .map((cell) => (
                  <div key={cell.id} className="mt-3 flex justify-end">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 3 }, (_, i) => (
              <TableRow key={`loading-${String(i)}`}>
                <TableCell colSpan={columns.length}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
