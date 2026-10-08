import { formatCOP, type MonthlyMatrix } from '@anderp/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LedgerFilter } from '@/lib/expenses-api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const shortDate = (date: string) => formatDate(date).slice(0, 5);

/**
 * Matriz del mes, departamento × semana (F05 CA-14). Cada monto distinto de cero es un botón que
 * pide abrir el libro filtrado por esa celda, fila, columna o el mes completo.
 */
export function ExpenseMatrix({
  matrix,
  onSelect,
}: {
  matrix: MonthlyMatrix;
  onSelect: (filter: LedgerFilter, title: string) => void;
}) {
  function amount(value: string, label: string, filter: LedgerFilter, title: string, bold = false) {
    return (
      <TableCell key={label} className={cn('text-right tabular-nums', bold && 'font-semibold')}>
        {value === '0.00' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <button
            type="button"
            aria-label={label}
            className="rounded px-1 hover:bg-accent hover:underline"
            onClick={() => {
              onSelect(filter, title);
            }}
          >
            {formatCOP(value)}
          </button>
        )}
      </TableCell>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Departamento</TableHead>
          {matrix.weeks.map((w) => (
            <TableHead key={w.week} className="text-right">
              <div>Semana {w.week}</div>
              <div className="text-xs font-normal text-muted-foreground">
                {shortDate(w.start)} – {shortDate(w.end)}
              </div>
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matrix.rows.map((row) => (
          <TableRow key={row.categoryId}>
            <TableHead scope="row" className="font-medium text-foreground">
              {row.name}
              {!row.isActive && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">(inactivo)</span>
              )}
            </TableHead>
            {row.cells.map((cell, i) => {
              const week = i + 1;
              return amount(
                cell,
                `${row.name}, semana ${String(week)}`,
                { categoryId: row.categoryId, week },
                `${row.name} · Semana ${String(week)}`,
              );
            })}
            {amount(
              row.total,
              `Total de ${row.name}`,
              { categoryId: row.categoryId },
              row.name,
              true,
            )}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope="row" className="font-semibold text-foreground">
            Total
          </TableHead>
          {matrix.weekTotals.map((total, i) => {
            const week = i + 1;
            return amount(
              total,
              `Total de la semana ${String(week)}`,
              { week },
              `Semana ${String(week)}`,
              true,
            );
          })}
          {amount(matrix.grandTotal, 'Total del mes', {}, 'Todo el mes', true)}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
