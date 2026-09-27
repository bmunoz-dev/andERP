/**
 * Fechas de calendario (sin hora ni zona) representadas como strings `YYYY-MM-DD`.
 * Toda la aritmética se hace en UTC para que la zona del proceso no desplace el día.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
// Date.UTC interpreta los años 0–99 como 1900–1999; se limita el rango a años seguros.
const MIN_YEAR = 1900;
const MAX_YEAR = 9999;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  return y >= MIN_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parseIsoDate(value: string): DateParts {
  if (!isIsoDate(value)) {
    throw new RangeError(`Invalid calendar date: ${JSON.stringify(value)}`);
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function formatIsoDate({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function assertMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtcMs(value: string): number {
  const { year, month, day } = parseIsoDate(value);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
  const date = new Date(ms);
  return formatIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addDays(value: string, days: number): string {
  return fromUtcMs(toUtcMs(value) + days * MS_PER_DAY);
}

/** 0 = domingo … 6 = sábado (misma convención que `Date#getDay`). */
export function dayOfWeek(value: string): number {
  return new Date(toUtcMs(value)).getUTCDay();
}
