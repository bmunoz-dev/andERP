import { formatCOP, type LedgerEntry } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages.es';
import { deleteExpense, expenseKeys, getLedger, type LedgerFilter } from '@/lib/expenses-api';
import { formatDate } from '@/lib/format';

/**
 * Detalle del libro de una celda de la matriz (F05 CA-14): los egresos manuales se editan y
 * borran aquí; los honorarios enlazan a su pago.
 */
export function LedgerSheet({
  year,
  month,
  selection,
  onClose,
  onEdit,
}: {
  year: number;
  month: number;
  selection: { filter: LedgerFilter; title: string } | null;
  onClose: () => void;
  onEdit: (entry: LedgerEntry) => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null);
  const filter = selection?.filter ?? {};
  const ledger = useQuery({
    queryKey: expenseKeys.ledger(year, month, filter),
    queryFn: () => getLedger(year, month, filter),
    enabled: selection !== null,
  });

  const remove = useMutation({
    mutationFn: (entry: LedgerEntry) => deleteExpense(entry.sourceId),
    onSuccess: async () => {
      toast.success('Egreso eliminado');
      await queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Sheet
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{selection?.title}</SheetTitle>
          <SheetDescription>Movimientos del mes, por fecha de pago.</SheetDescription>
        </SheetHeader>
        <ul className="grid gap-3 px-4 pb-4">
          {ledger.isPending && <li className="text-muted-foreground">Cargando…</li>}
          {ledger.data?.length === 0 && <li className="text-muted-foreground">Sin movimientos.</li>}
          {ledger.data?.map((entry) => (
            <li key={entry.sourceId} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{entry.concept}</p>
                <p className="font-semibold whitespace-nowrap tabular-nums">
                  {formatCOP(entry.amount)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(entry.paymentDate)} · Semana {entry.weekOfMonth}
                {entry.invoiceNumber && ` · Factura ${entry.invoiceNumber}`}
              </p>
              <div className="mt-2 flex justify-end gap-1">
                {entry.source === 'manual' ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onEdit(entry);
                      }}
                    >
                      <Pencil />
                      Editar
                    </Button>
                    <Button
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => {
                        setDeleting(entry);
                      }}
                    >
                      <Trash2 />
                      Eliminar
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="link" size="sm">
                    <Link to="/honorarios/$id" params={{ id: entry.sourceId }}>
                      Ver pago de honorarios
                    </Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SheetContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="¿Eliminar este egreso?"
        description="Deja de sumar en la matriz y queda registrado en la auditoría."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
          setDeleting(null);
        }}
      />
    </Sheet>
  );
}
