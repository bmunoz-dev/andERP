import { todayIn, weekOfMonth, weekRange } from '@anderp/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/')({
  component: HomePage,
});

interface Health {
  status: 'ok';
  db: 'ok';
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day ?? ''}/${month ?? ''}`;
}

function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<Health>('/health'),
  });

  const today = todayIn();
  const [year, month] = today.split('-').map(Number) as [number, number];
  const week = weekOfMonth(today);
  const range = weekRange(year, month, week);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Semana actual</CardTitle>
          <CardDescription>Formato de semanas del mes: 1–7, 8–14, 15–21, 22–fin.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">Semana {week}</p>
          <p className="text-muted-foreground">
            Del {formatShortDate(range.start)} al {formatShortDate(range.end)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estado del sistema</CardTitle>
          <CardDescription>Conexión con la API y la base de datos.</CardDescription>
        </CardHeader>
        <CardContent>
          {health.isPending && <p className="text-muted-foreground">Verificando…</p>}
          {health.isSuccess && <p className="font-medium text-green-700">API y base de datos en línea</p>}
          {health.isError && <p className="font-medium text-destructive">{errorMessage(health.error)}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
