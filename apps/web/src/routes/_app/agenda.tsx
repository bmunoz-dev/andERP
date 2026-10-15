import { type Obligation, obligationStatusSchema } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AgendaTable } from '@/components/obligations/agenda-table';
import { AgendaTabs } from '@/components/obligations/agenda-tabs';
import { CompleteDueDateDialog } from '@/components/obligations/complete-due-date-dialog';
import { ObligationFormDialog } from '@/components/obligations/obligation-form-dialog';
import { ObligationHistorySheet } from '@/components/obligations/obligation-history-sheet';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages.es';
import { deleteObligation, listObligations, obligationKeys } from '@/lib/obligations-api';

export const Route = createFileRoute('/_app/agenda')({
  // La pestaña va en la URL (CA-17); un valor inválido muestra "Todos".
  validateSearch: z.object({ status: obligationStatusSchema.optional().catch(undefined) }),
  component: AgendaPage,
});

/** Qué diálogo está abierto. `form` con `null` es una obligación nueva. */
type AgendaDialog =
  | { kind: 'form'; obligation: Obligation | null }
  | { kind: 'complete' | 'history'; obligation: Obligation }
  | null;

/** Agenda de pagos (F13 CA-17 y CA-18): pestañas por estado y tabla por urgencia. */
function AgendaPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const { status } = Route.useSearch();
  const [dialog, setDialog] = useState<AgendaDialog>(null);
  const [deleting, setDeleting] = useState<Obligation | null>(null);

  // Una sola consulta (la misma del contador del menú); las pestañas filtran en la web.
  const agenda = useQuery({ queryKey: obligationKeys.list, queryFn: listObligations });
  const rows = status ? agenda.data?.filter((o) => o.status === status) : agenda.data;

  const close = () => {
    setDialog(null);
  };

  const remove = useMutation({
    mutationFn: (o: Obligation) => deleteObligation(o.id),
    onSuccess: async () => {
      toast.success('Obligación eliminada');
      await queryClient.invalidateQueries({ queryKey: obligationKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Agenda de pagos"
        description="Fechas límite de las obligaciones con la DIAN, Fontur y otras entidades."
        actions={
          <Button
            onClick={() => {
              setDialog({ kind: 'form', obligation: null });
            }}
          >
            <Plus />
            Nueva obligación
          </Button>
        }
      />
      <AgendaTabs
        data={agenda.data}
        value={status}
        onChange={(next) => {
          void navigate({ search: next ? { status: next } : {} });
        }}
      />
      <AgendaTable
        data={rows}
        isLoading={agenda.isPending}
        onComplete={(obligation) => {
          setDialog({ kind: 'complete', obligation });
        }}
        onHistory={(obligation) => {
          setDialog({ kind: 'history', obligation });
        }}
        onEdit={(obligation) => {
          setDialog({ kind: 'form', obligation });
        }}
        onDelete={setDeleting}
      />
      {dialog?.kind === 'form' && (
        <ObligationFormDialog
          obligation={dialog.obligation}
          entities={agenda.data?.map((o) => o.entityName).sort() ?? []}
          onClose={close}
        />
      )}
      {dialog?.kind === 'complete' && (
        <CompleteDueDateDialog obligation={dialog.obligation} onClose={close} />
      )}
      {dialog?.kind === 'history' && (
        <ObligationHistorySheet obligationId={dialog.obligation.id} onClose={close} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="¿Eliminar esta obligación?"
        description="Deja de aparecer en la agenda junto con su historial."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}
