import type { ContractStatus } from '@anderp/shared';
import { and, isNull, lte, or, gte, sql, type SQL } from 'drizzle-orm';
import { providerContracts } from '../../db/schema';

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

export function contractColumns(today: string) {
  return {
    id: providerContracts.id,
    serviceProviderId: providerContracts.serviceProviderId,
    startDate: providerContracts.startDate,
    endDate: providerContracts.endDate,
    workAgreement: providerContracts.workAgreement,
    paymentFrequency: providerContracts.paymentFrequency,
    totalAmount: providerContracts.totalAmount,
    status: contractStatusSql(today),
  };
}
