import { describe, expect, it } from 'vitest';
import { assertValidDays } from './fee-payment-rules';

const period = { periodYear: 2026, periodMonth: 8, weekOfMonth: 4 };
const day = (workDate: string) => ({ workDate, amount: '100.00', isHoliday: false });

function code(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe('assertValidDays', () => {
  it('acepta los 10 días de la semana 4 de agosto', () => {
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-08-${String(22 + i)}`));
    expect(
      code(() => {
        assertValidDays(period, days);
      }),
    ).toBeUndefined();
  });

  it('CA-3 sin días → FEE_PAYMENT_WITHOUT_DAYS', () => {
    expect(
      code(() => {
        assertValidDays(period, []);
      }),
    ).toBe('FEE_PAYMENT_WITHOUT_DAYS');
  });

  it('CA-3 fecha repetida → DUPLICATE_WORK_DATE', () => {
    expect(
      code(() => {
        assertValidDays(period, [day('2026-08-22'), day('2026-08-22')]);
      }),
    ).toBe('DUPLICATE_WORK_DATE');
  });

  it.each(['2026-08-21', '2026-09-01'])('CA-4 %s está fuera de la semana', (date) => {
    expect(
      code(() => {
        assertValidDays(period, [day(date)]);
      }),
    ).toBe('WORK_DATE_OUTSIDE_WEEK');
  });
});
