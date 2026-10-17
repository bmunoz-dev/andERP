import { type ClickiuSummary, formatCOP } from '@anderp/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';

/** Tarjetas de Clic Kiu (F11 CA-17): cambian con los filtros; el saldo es al corte de "Hasta". */
export function SummaryCards({
  summary,
  to,
}: {
  summary: ClickiuSummary | undefined;
  to?: string;
}) {
  const cards = [
    { label: 'Recargado', value: summary?.totalRecharged },
    { label: 'Vendido', value: summary?.totalSold },
    { label: 'Por cobrar (Crédito)', value: summary?.creditAmount },
    { label: to ? `Saldo al ${formatDate(to)}` : 'Saldo actual', value: summary?.balanceAsOf },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="px-4 sm:px-6">
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-lg tabular-nums sm:text-2xl">
              {c.value === undefined ? '—' : formatCOP(c.value)}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
