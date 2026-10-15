import { type Obligation, obligationStatusSchema } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AgendaTable } from '@/components/obligations/agenda-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/error-messages.es';
import {
  deleteObligation,
  listObligations,
  obligationKeys,
  STATUS_LABELS,
} from '@/lib/obligations-api';

export const Route = createFileRoute('/_app/agenda')({
  // La pestaña va en la URL (CA-17); un valor inválido muestra "Todos".
  validateSearch: z.object({ status: obligationStatusSchema.optional().catch(undefined) }),
  component: AgendaPage,
});

const TABS = ['overdue', 'upcoming', 'scheduled', 'none'] as const;

/** Qué diálogo está abierto. `form` con `null` es una obligación nueva. */
export type AgendaDialog =
  | { kind: 'form'; obligation: Obligation | null }
  | { kind: 'complete' | 'history'; obligation: Obligation }
  | null;

/** Agenda de pagos (F13 CA-17 y CA-18): pestañas por estado y tabla por urgencia. */
function AgendaPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const { status } = Route.useSearch();
  // Los diálogos que leen este estado se agregan en F13-T007.
  const [, setDialog] = useState<AgendaDialog>(null);
  const [deleting, setDeleting] = useState<Obligation | null>(null);

  // Una sola consulta (la misma del contador del menú); las pestañas filtran en la web.
  const agenda = useQuery({ queryKey: obligationKeys.list, queryFn: listObligations });
  const rows = status ? agenda.data?.filter((o) => o.status === status) : agenda.data;
  const count = (s?: Obligation['status']) =>
    agenda.data?.filter((o) => !s || o.status === s).length ?? 0;

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
      <Tabs
        className="mb-4"
        value={status ?? 'all'}
        onValueChange={(value) => {
          void navigate({
            search: value === 'all' ? {} : { status: value as Obligation['status'] },
          });
        }}
      >
        <TabsList>
          <TabsTrigger value="all">Todos ({count()})</TabsTrigger>
          {TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_LABELS[s]} ({count(s)})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
