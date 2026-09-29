import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ title, feature }: { title: string; feature: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <p className="font-medium text-foreground">Próximamente</p>
        <p className="mt-1 text-sm">Este módulo llega con la feature {feature} del roadmap.</p>
      </div>
    </>
  );
}
