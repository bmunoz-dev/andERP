import type { ClickiuFilters, ClickiuMovementType, ClickiuSaleStatus } from '@anderp/shared';
import { FormField } from '@/components/form-field';
import { SelectField } from '@/components/select-field';

/** Quita los filtros vacíos para que no viajen en la URL ni en la consulta. */
function clean(f: ClickiuFilters): ClickiuFilters {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v));
}

/** Filtros de Clic Kiu (F11 CA-18). El estado solo aplica a ventas. */
export function MovementFilters({
  value,
  onChange,
}: {
  value: ClickiuFilters;
  onChange: (next: ClickiuFilters) => void;
}) {
  const set = (patch: Partial<ClickiuFilters>) => {
    onChange(clean({ ...value, ...patch }));
  };

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <FormField
        label="Desde"
        type="date"
        value={value.from ?? ''}
        onChange={(e) => {
          set({ from: e.target.value || undefined });
        }}
      />
      <FormField
        label="Hasta"
        type="date"
        value={value.to ?? ''}
        onChange={(e) => {
          set({ to: e.target.value || undefined });
        }}
      />
      <SelectField
        label="Tipo"
        placeholder="Todos"
        noneLabel="Todos"
        value={value.type ?? ''}
        onChange={(v) => {
          const type = (v || undefined) as ClickiuMovementType | undefined;
          set({ type, ...(type === 'sale' ? {} : { status: undefined }) });
        }}
        options={[
          { value: 'recharge', label: 'Recarga' },
          { value: 'sale', label: 'Venta' },
        ]}
      />
      <SelectField
        label="Estado"
        placeholder="Todos"
        noneLabel="Todos"
        disabled={value.type !== 'sale'}
        value={value.status ?? ''}
        onChange={(v) => {
          set({ status: (v || undefined) as ClickiuSaleStatus | undefined });
        }}
        options={[
          { value: 'credit', label: 'Crédito' },
          { value: 'completed', label: 'Completado' },
        ]}
      />
    </div>
  );
}
