import { assertMonth, daysInMonth, formatIsoDate, parseIsoDate } from './calendar-date';

/**
 * Semanas del mes en formato B (design.md §2, decisión 4):
 * S1 = días 1–7, S2 = 8–14, S3 = 15–21, S4 = 22–fin de mes.
 * Debe coincidir con la función SQL `week_of_month(date)`.
 */
export type WeekOfMonth = 1 | 2 | 3 | 4;

export const WEEKS_OF_MONTH: readonly WeekOfMonth[] = [1, 2, 3, 4];

export interface DateRange {
  start: string;
  end: string;
}

export function weekOfMonth(date: string): WeekOfMonth {
  const { day } = parseIsoDate(date);
  return Math.min(Math.floor((day - 1) / 7) + 1, 4) as WeekOfMonth;
}

export function isWeekOfMonth(value: number): value is WeekOfMonth {
  return Number.isInteger(value) && value >= 1 && value <= 4;
}

export function weekRange(year: number, month: number, week: number): DateRange {
  assertMonth(year, month);
  if (!isWeekOfMonth(week)) {
    throw new RangeError(`Invalid week of month: ${week}`);
  }
  const startDay = (week - 1) * 7 + 1;
  const endDay = week < 4 ? startDay + 6 : daysInMonth(year, month);
  return {
    start: formatIsoDate({ year, month, day: startDay }),
    end: formatIsoDate({ year, month, day: endDay }),
  };
}
