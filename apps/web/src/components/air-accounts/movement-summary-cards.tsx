import { type AirMovementSummary, formatCOP } from '@anderp/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';

/** Tarjetas de una cuenta (F18 CA-29): cambian con los filtros; el saldo es al corte de "Hasta". */
export function MovementSummaryCards({
  summary,
  to,
}: {
  summary: AirMovementSummary | undefined;
  to?: string;
}) {
  const cards = [
    { label: 'Entradas', value: summary?.totalIn },
    { label: 'Emitido', value: summary?.totalIssued },
    { label: 'Por cobrar', value: summary?.pendingCollection },
    { label: to ? `Saldo al ${formatDate(to)}` : 'Saldo actual', value: summary?.balanceAsOf },
    { label: 'Disponible', value: summary?.available },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="px-4 sm:px-6">
            <CardDescription>{c.label}</CardDescription>
            <CardTitle
              className={`text-lg tabular-nums sm:text-2xl ${c.value?.startsWith('-') ? 'text-destructive' : ''}`}
            >
              {c.value === undefined ? '—' : formatCOP(c.value)}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
