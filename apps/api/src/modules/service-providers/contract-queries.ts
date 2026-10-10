import type { ContractStatus } from '@anderp/shared';
import { and, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  contractMonthTotals,
  feePaymentTotals,
  feePayments,
  providerContracts,
} from '../../db/schema';

/** Estado del contrato en una fecha (hoy en Bogotá), calculado en SQL (F03 CA-8). */
export function contractStatusSql(today: string): SQL<ContractStatus> {
  return sql<ContractStatus>`case
    when ${providerContracts.startDate} > ${today}::date then 'upcoming'
    when ${providerContracts.endDate} is not null and ${providerContracts.endDate} < ${today}::date then 'ended'
    else 'active' end`;
}

/** Contratos vigentes en la fecha (sin borrar). */
export function activeOn(today: string): SQL {
  const condition = and(
    isNull(providerContracts.deletedAt),
    lte(providerContracts.startDate, today),
    or(isNull(providerContracts.endDate), gte(providerContracts.endDate, today)),
  );
  if (!condition) throw new Error('Unreachable');
  return condition;
}

/** Lo pagado de un mes trabajado: `coalesce(…, 0)` porque un mes sin pagos no tiene fila. */
const paidOrZero = (amount: SQL | typeof contractMonthTotals.paidAmount) =>
  sql<string>`coalesce(${amount}, 0)::numeric(14, 2)`;

/**
 * Columnas del contrato con lo pagado en el mes actual; la consulta debe unir
 * `contractMonthTotals` con `monthTotalsJoin(today)` (F10 CA-5).
 */
export function contractColumns(today: string) {
  return {
    id: providerContracts.id,
    serviceProviderId: providerContracts.serviceProviderId,
    startDate: providerContracts.startDate,
    endDate: providerContracts.endDate,
    workAgreement: providerContracts.workAgreement,
    paymentFrequency: providerContracts.paymentFrequency,
    monthlyAmount: providerContracts.monthlyAmount,
    status: contractStatusSql(today),
    paidThisMonth: paidOrZero(contractMonthTotals.paidAmount),
  };
}

/** `LEFT JOIN` a lo pagado en el mes trabajado de `today` (mes calendario en Bogotá). */
export function monthTotalsJoin(today: string): SQL {
  const condition = and(
    eq(contractMonthTotals.contractId, providerContracts.id),
    eq(contractMonthTotals.periodYear, Number(today.slice(0, 4))),
    eq(contractMonthTotals.periodMonth, Number(today.slice(5, 7))),
  );
  if (!condition) throw new Error('Unreachable');
  return condition;
}

/**
 * Lo pagado en un mes trabajado (F10 CA-6), opcionalmente sin un pago: al editarlo no se suma
 * dos veces. `v_fee_payment_totals` ya excluye los pagos borrados.
 */
export function paidInMonthSql(year: number, month: number, excludePayment?: string) {
  return paidOrZero(sql`(
    select sum(${feePaymentTotals.totalAmount})
      from ${feePaymentTotals}
      join ${feePayments} on ${feePayments.id} = ${feePaymentTotals.feePaymentId}
     where ${feePayments.contractId} = ${providerContracts.id}
       and ${feePayments.periodYear} = ${year}
       and ${feePayments.periodMonth} = ${month}
       ${excludePayment ? sql`and ${feePayments.id} <> ${excludePayment}` : sql``}
  )`);
}
