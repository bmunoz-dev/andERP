import { type AirOperatorBalance, formatCOP } from '@anderp/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignedAmount } from './accounts-table';

/** Consolidado por operador de sus cuentas activas (F18 CA-28). */
export function OperatorBalanceCards({ data }: { data: AirOperatorBalance[] | undefined }) {
  if (!data?.length) return null;
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((o) => (
        <Card key={o.operatorId} role="region" aria-label={o.operatorName}>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>{o.operatorName}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 text-sm sm:px-6">
            <span className="text-muted-foreground">Saldo</span>
            <SignedAmount value={o.balance} />
            <span className="text-muted-foreground">Cupo</span>
            <span className="tabular-nums">{formatCOP(o.creditLimit)}</span>
            <span className="text-muted-foreground">Disponible</span>
            <SignedAmount value={o.available} />
            <span className="text-muted-foreground">Por cobrar</span>
            <span className="tabular-nums">{formatCOP(o.pendingCollection)}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
