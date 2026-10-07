import { addDays, dayOfWeek, formatCOP, isColombianHoliday, sumMoney } from '@anderp/shared';
import { MoneyInput } from '@/components/money-input';
import { formatDate } from '@/lib/format';

/** Valor y marca de festivo por fecha (`YYYY-MM-DD`). Un día sin valor no se envía. */
export type DayValues = Record<string, { amount: string | null; isHoliday: boolean }>;

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/**
 * Cuadrícula de una semana del mes (F04 CA-19): una columna por fecha (7 a 10), los días fuera
 * del contrato deshabilitados, los festivos marcados y el total en vivo.
 */
export function WeekGrid({
  start,
  end,
  contractStart,
  contractEnd,
  values,
  onChange,
}: {
  start: string;
  end: string;
  contractStart: string;
  contractEnd: string | null;
  values: DayValues;
  onChange: (values: DayValues) => void;
}) {
  const dates = datesBetween(start, end);
  const total = sumMoney(
    dates.flatMap((date) => {
      const amount = values[date]?.amount;
      return amount ? [amount] : [];
    }),
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="flex min-w-max">
        {dates.map((date) => {
          const label = `${WEEKDAYS[dayOfWeek(date)] ?? ''} ${formatDate(date).slice(0, 5)}`;
          const outside = date < contractStart || (contractEnd !== null && date > contractEnd);
          const holiday = values[date]?.isHoliday ?? isColombianHoliday(date);
          return (
            <div key={date} className="flex w-32 flex-col gap-1 border-r p-2 last:border-r-0">
              <label htmlFor={`day-${date}`} className="text-sm font-medium">
                {label}
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label={`Festivo ${label}`}
                  checked={holiday}
                  disabled={outside}
                  onChange={(event) => {
                    onChange({
                      ...values,
                      [date]: {
                        amount: values[date]?.amount ?? null,
                        isHoliday: event.target.checked,
                      },
                    });
                  }}
                />
                Festivo
              </label>
              <MoneyInput
                id={`day-${date}`}
                placeholder={outside ? 'Fuera del contrato' : '0'}
                disabled={outside}
                value={values[date]?.amount ?? null}
                onChange={(amount) => {
                  onChange({ ...values, [date]: { amount, isHoliday: holiday } });
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 border-t p-3 text-sm">
        <span className="text-muted-foreground">Total de la semana</span>
        <span className="font-semibold" data-testid="week-total">
          {formatCOP(total)}
        </span>
      </div>
    </div>
  );
}
