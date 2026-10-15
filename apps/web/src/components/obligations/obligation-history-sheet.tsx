import { BUSINESS_TIME_ZONE, todayIn } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages.es';
import { formatDate } from '@/lib/format';
import {
  getObligation,
  obligationKeys,
  removePendingDueDate,
  setPendingDueDate,
} from '@/lib/obligations-api';

/** El instante en que se completó, como día de calendario en Bogotá. */
const completedDay = (completedAt: string) =>
  formatDate(todayIn(BUSINESS_TIME_ZONE, new Date(completedAt)));

/** Historial de una obligación y acciones sobre su pendiente (F13 CA-12, CA-21). */
export function ObligationHistorySheet({
  obligationId,
  onClose,
}: {
  obligationId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: obligationKeys.detail(obligationId),
    queryFn: () => getObligation(obligationId),
  });
  const [date, setDate] = useState('');
  const pending = detail.data?.pending ?? null;

  const done = (message: string) => async () => {
    toast.success(message);
    setDate('');
    await queryClient.invalidateQueries({ queryKey: obligationKeys.all });
  };
  const failed = (e: Error) => toast.error(errorMessage(e));

  const setPending = useMutation({
    mutationFn: () => setPendingDueDate(obligationId, { dueDate: date }),
    onSuccess: done(pending ? 'Fecha cambiada' : 'Vencimiento agregado'),
    onError: failed,
  });
  const removePending = useMutation({
    mutationFn: () => removePendingDueDate(obligationId),
    onSuccess: done('Vencimiento quitado'),
    onError: failed,
  });

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {detail.data ? `${detail.data.entityName} · ${detail.data.concept}` : 'Historial'}
          </SheetTitle>
          <SheetDescription>Vencimientos del más reciente al más antiguo.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-4">
          <div className="grid gap-2 rounded-md border p-3">
            <FormField
              label="Fecha del pendiente"
              type="date"
              value={date || (pending?.dueDate ?? '')}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!date || setPending.isPending}
                onClick={() => {
                  setPending.mutate();
                }}
              >
                {pending ? 'Cambiar fecha' : 'Agregar vencimiento'}
              </Button>
              {pending && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={removePending.isPending}
                  onClick={() => {
                    removePending.mutate();
                  }}
                >
                  Quitar
                </Button>
              )}
            </div>
          </div>
          <ul className="grid gap-2">
            {detail.data?.history.map((h) => (
              <li key={h.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">Vence el {formatDate(h.dueDate)}</div>
                <div className="text-muted-foreground">
                  {h.completedAt
                    ? `Hecho el ${completedDay(h.completedAt)}${h.completedBy ? ` por ${h.completedBy.name}` : ''}`
                    : 'Pendiente'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
