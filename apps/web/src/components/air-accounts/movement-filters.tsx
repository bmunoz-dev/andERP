import type { AirCollectionStatus, AirMovementFilters, AirMovementType } from '@anderp/shared';
import { FormField } from '@/components/form-field';
import { SelectField } from '@/components/select-field';
import { AIR_MOVEMENT_LABELS } from '@/lib/air-accounts-api';

/** Quita los filtros vacíos para que no viajen en la URL ni en la consulta. */
function clean(f: AirMovementFilters): AirMovementFilters {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v));
}

/** Filtros de los movimientos de una cuenta (F18 CA-29). El estado de cobro solo aplica a emisiones. */
export function MovementFilters({
  value,
  onChange,
}: {
  value: AirMovementFilters;
  onChange: (next: AirMovementFilters) => void;
}) {
  const set = (patch: Partial<AirMovementFilters>) => {
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
          const type = (v || undefined) as AirMovementType | undefined;
          set({ type, ...(type === 'issue' ? {} : { collectionStatus: undefined }) });
        }}
        options={Object.entries(AIR_MOVEMENT_LABELS).map(([v, label]) => ({ value: v, label }))}
      />
      <SelectField
        label="Estado de cobro"
        placeholder="Todos"
        noneLabel="Todos"
        disabled={value.type !== 'issue'}
        value={value.collectionStatus ?? ''}
        onChange={(v) => {
          set({ collectionStatus: (v || undefined) as AirCollectionStatus | undefined });
        }}
        options={[
          { value: 'pending', label: 'Por cobrar' },
          { value: 'collected', label: 'Cobrado' },
        ]}
      />
    </div>
  );
}
