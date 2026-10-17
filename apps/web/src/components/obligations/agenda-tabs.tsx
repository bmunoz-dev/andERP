import type { Obligation, ObligationStatus } from '@anderp/shared';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS: { value: ObligationStatus; label: string }[] = [
  { value: 'overdue', label: 'Vencidos' },
  { value: 'upcoming', label: 'Próximos' },
  { value: 'scheduled', label: 'Programados' },
  { value: 'none', label: 'Sin próximo' },
];

/** Pestañas de la agenda con su número (F13 CA-17). `undefined` es "Todos". */
export function AgendaTabs({
  data,
  value,
  onChange,
}: {
  data: Obligation[] | undefined;
  value: ObligationStatus | undefined;
  onChange: (status: ObligationStatus | undefined) => void;
}) {
  const count = (status?: ObligationStatus) =>
    data?.filter((o) => !status || o.status === status).length ?? 0;
  return (
    <Tabs
      className="mb-4 max-w-full overflow-x-auto"
      value={value ?? 'all'}
      onValueChange={(next) => {
        onChange(next === 'all' ? undefined : (next as ObligationStatus));
      }}
    >
      <TabsList>
        <TabsTrigger value="all">Todos ({count()})</TabsTrigger>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label} ({count(tab.value)})
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
