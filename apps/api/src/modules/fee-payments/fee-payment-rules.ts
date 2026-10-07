import { ErrorCode, type FeePaymentDay, weekRange } from '@anderp/shared';
import { DomainError } from '../../shared/errors/domain-error';

export interface Period {
  periodYear: number;
  periodMonth: number;
  weekOfMonth: number;
}

/**
 * Invariantes de los días de un pago (F04 CA-3 y CA-4) que se pueden revisar sin la base de
 * datos. Que cada día caiga dentro del contrato lo exige el trigger `fee_payment_days_validate`.
 */
export function assertValidDays(period: Period, days: readonly FeePaymentDay[]): void {
  if (days.length === 0) throw new DomainError(ErrorCode.FEE_PAYMENT_WITHOUT_DAYS, 422);

  const dates = days.map((d) => d.workDate);
  if (new Set(dates).size !== dates.length) {
    throw new DomainError(ErrorCode.DUPLICATE_WORK_DATE, 422);
  }

  const { start, end } = weekRange(period.periodYear, period.periodMonth, period.weekOfMonth);
  if (dates.some((date) => date < start || date > end)) {
    throw new DomainError(ErrorCode.WORK_DATE_OUTSIDE_WEEK, 422);
  }
}
