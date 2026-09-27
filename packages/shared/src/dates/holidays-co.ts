import { addDays, assertMonth, dayOfWeek, formatIsoDate, parseIsoDate } from './calendar-date';

/**
 * Festivos de Colombia.
 * - Fijos: se celebran en su fecha.
 * - Trasladables (Ley 51 de 1983, "Ley Emiliani"): si no caen en lunes, pasan al lunes siguiente.
 * - Dependientes de la Pascua: Jueves y Viernes Santo en su fecha; Ascensión, Corpus Christi
 *   y Sagrado Corazón ya caen en lunes (Pascua + 43, 64 y 71 días).
 */
export interface Holiday {
  date: string;
  name: string;
}

const FIRST_YEAR = 1984;

const FIXED: readonly [month: number, day: number, name: string][] = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Día de la Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Inmaculada Concepción'],
  [12, 25, 'Navidad'],
];

const MOVED_TO_MONDAY: readonly [month: number, day: number, name: string][] = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
];

const EASTER_BASED: readonly [offsetDays: number, name: string][] = [
  [-3, 'Jueves Santo'],
  [-2, 'Viernes Santo'],
  [43, 'Ascensión del Señor'],
  [64, 'Corpus Christi'],
  [71, 'Sagrado Corazón'],
];

/** Domingo de Pascua (algoritmo anónimo gregoriano de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  assertMonth(year, 1);
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return formatIsoDate({ year, month: Math.floor(n / 31), day: (n % 31) + 1 });
}

function nextMonday(date: string): string {
  const offset = (8 - dayOfWeek(date)) % 7;
  return addDays(date, offset);
}

const cache = new Map<number, Holiday[]>();

export function colombianHolidays(year: number): Holiday[] {
  if (!Number.isInteger(year) || year < FIRST_YEAR) {
    throw new RangeError(`Colombian holidays are only defined from ${FIRST_YEAR}: ${year}`);
  }
  const cached = cache.get(year);
  if (cached) return cached;

  const byDate = new Map<string, string[]>();
  const add = (date: string, name: string) => {
    byDate.set(date, [...(byDate.get(date) ?? []), name]);
  };

  for (const [month, day, name] of FIXED) add(formatIsoDate({ year, month, day }), name);
  for (const [month, day, name] of MOVED_TO_MONDAY) {
    add(nextMonday(formatIsoDate({ year, month, day })), name);
  }
  const easter = easterSunday(year);
  for (const [offset, name] of EASTER_BASED) add(addDays(easter, offset), name);

  const holidays = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, name: names.join(' / ') }));
  cache.set(year, holidays);
  return holidays;
}

export function isColombianHoliday(date: string): boolean {
  const { year } = parseIsoDate(date);
  return colombianHolidays(year).some((holiday) => holiday.date === date);
}
