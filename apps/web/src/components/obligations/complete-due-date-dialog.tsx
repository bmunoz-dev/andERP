import { addMonths, FREQUENCY_MONTHS, type Obligation } from '@anderp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { ApiError } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-messages.es';
import { formatDate } from '@/lib/format';
import { completeDueDate, obligationKeys } from '@/lib/obligations-api';

/**
 * Completar un vencimiento (F13 CA-20). Envía el vencimiento que el usuario está viendo
 * (`dueDateId`) y la fecha siguiente sugerida según la periodicidad, que se puede cambiar o vaciar.
 */
export function CompleteDueDateDialog({
  obligation,
  onClose,
}: {
  obligation: Obligation;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pending = obligation.pending;
  const months = FREQUENCY_MONTHS[obligation.frequency];
  const [nextDueDate, setNextDueDate] = useState(
    pending && months ? addMonths(pending.dueDate, months) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: obligationKeys.all });

  const complete = useMutation({
    mutationFn: (dueDateId: string) =>
      completeDueDate(obligation.id, { dueDateId, ...(nextDueDate ? { nextDueDate } : {}) }),
    onSuccess: async () => {
      toast.success('Vencimiento completado');
      await refresh();
      onClose();
    },
    onError: async (e) => {
      setError(errorMessage(e));
      // Otra persona lo completó: la agenda que se ve está desactualizada.
      if (e instanceof ApiError && e.code === 'DUE_DATE_ALREADY_COMPLETED') await refresh();
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Completar vencimiento"
      description={`${obligation.entityName} · ${obligation.concept} — vence el ${formatDate(pending?.dueDate ?? null)}`}
      error={error}
      submitLabel="Completar"
      isSubmitting={complete.isPending}
      onSubmit={() => {
        if (pending) complete.mutate(pending.id);
      }}
    >
      <FormField
        label="Próximo vencimiento"
        type="date"
        value={nextDueDate}
        onChange={(e) => {
          setNextDueDate(e.target.value);
        }}
      />
      <p className="text-sm text-muted-foreground">Déjalo vacío si este fue el último.</p>
    </FormDialog>
  );
}
