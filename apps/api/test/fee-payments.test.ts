import {
  type Contract,
  type ContractOption,
  type FeePayment,
  type ServiceProvider,
  todayIn,
} from '@anderp/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs, documentTypes } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;
let documentTypeId: string;
let contract: Contract;

const api = () => as(t, s.orgA.admin.token);
const day = (workDate: string, amount = '100000.00', isHoliday = false) => ({
  workDate,
  amount,
  isHoliday,
});

async function newContract(overrides: Record<string, unknown> = {}): Promise<Contract> {
  const provider = (
    await api()
      .post('/service-providers', {
        name: `Prestador ${String(Math.random()).slice(2, 8)}`,
        documentTypeId,
        documentNumber: String(Math.floor(Math.random() * 1e9)),
      })
      .expect(201)
  ).body as ServiceProvider;
  return (
    await api()
      .post(`/service-providers/${provider.id}/contracts`, {
        startDate: '2026-08-01',
        endDate: '2026-12-31',
        workAgreement: 'Asesoría',
        paymentFrequency: 'weekly',
        monthlyAmount: '1000000.00',
        ...overrides,
      })
      .expect(201)
  ).body as Contract;
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    contractId: contract.id,
    periodYear: 2026,
    periodMonth: 8,
    weekOfMonth: 4,
    paymentDate: '2026-09-02',
    notes: null,
    days: [day('2026-08-24'), day('2026-08-25', '150000.50')],
    ...overrides,
  };
}

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  documentTypeId = cc!.id;
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
  contract = await newContract();
});

afterAll(async () => {
  await t.close();
});

describe('Registro', () => {
  it('CA-1, CA-2, CA-7 y CA-8 crea el pago con su semana, total y días', async () => {
    const res = await api()
      .post(
        '/fee-payments',
        payment({ days: [day('2026-08-24'), day('2026-08-31', '150000.50', true)] }),
      )
      .expect(201);
    expect(res.body).toMatchObject({
      contractId: contract.id,
      periodStart: '2026-08-22',
      periodEnd: '2026-08-31',
      paymentDate: '2026-09-02',
      total: '250000.50',
      days: [day('2026-08-24'), day('2026-08-31', '150000.50', true)],
    } satisfies Partial<FeePayment>);
  });

  it('CA-3 sin días o con fechas repetidas → 422', async () => {
    expect(
      (
        await api()
          .post('/fee-payments', payment({ days: [] }))
          .expect(422)
      ).body,
    ).toMatchObject({
      code: 'FEE_PAYMENT_WITHOUT_DAYS',
    });
    const dup = await api()
      .post('/fee-payments', payment({ days: [day('2026-08-24'), day('2026-08-24')] }))
      .expect(422);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_WORK_DATE' });
  });

  it('CA-4 un día fuera de la semana o del contrato → 422', async () => {
    const week = await api()
      .post('/fee-payments', payment({ days: [day('2026-08-21')] }))
      .expect(422);
    expect(week.body).toMatchObject({ code: 'WORK_DATE_OUTSIDE_WEEK' });

    contract = await newContract({ startDate: '2026-08-25', endDate: null });
    const outside = await api()
      .post('/fee-payments', payment({ days: [day('2026-08-24')] }))
      .expect(422);
    expect(outside.body).toMatchObject({ code: 'WORK_DATE_OUTSIDE_CONTRACT' });
  });

  it('CA-5 la misma semana no se paga dos veces, ni con peticiones simultáneas', async () => {
    const [a, b] = await Promise.all([
      api().post('/fee-payments', payment()),
      api().post('/fee-payments', payment()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((a.status === 409 ? a : b).body).toMatchObject({ code: 'FEE_PAYMENT_ALREADY_EXISTS' });
  });

  it('CA-6 montos inválidos → 422 VALIDATION_ERROR', async () => {
    for (const amount of ['-1.00', '100', 100]) {
      const res = await api()
        .post('/fee-payments', payment({ days: [{ ...day('2026-08-24'), amount }] }))
        .expect(422);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });
});

describe('Monto mensual de referencia (F10)', () => {
  /** Contratos vigentes en la semana 4 de agosto, con lo pagado en agosto. */
  const augustOptions = async (excludePayment?: string) =>
    (
      await api()
        .get(
          `/contracts?overlaps=2026-08-22..2026-08-31${excludePayment ? `&excludePayment=${excludePayment}` : ''}`,
        )
        .expect(200)
    ).body as ContractOption[];

  it('CA-4 un pago que supera el monto mensual se registra', async () => {
    await api()
      .post('/fee-payments', payment({ days: [day('2026-08-24', '1500000.00')] }))
      .expect(201);
  });

  it('CA-2, CA-3 y CA-6 lo pagado se cuenta por mes trabajado y sin el pago que se edita', async () => {
    // Semana 4 de agosto pagada el 2 de septiembre: cuenta para agosto.
    const week4 = (await api().post('/fee-payments', payment()).expect(201)).body as FeePayment;
    await api()
      .post('/fee-payments', payment({ weekOfMonth: 1, days: [day('2026-08-03', '100000.00')] }))
      .expect(201);
    await api()
      .post(
        '/fee-payments',
        payment({ periodMonth: 9, weekOfMonth: 1, days: [day('2026-09-01', '70000.00')] }),
      )
      .expect(201);

    const [august] = await augustOptions();
    expect(august).toMatchObject({ monthlyAmount: '1000000.00', paidInMonth: '350000.50' });
    const [withoutWeek4] = await augustOptions(week4.id);
    expect(withoutWeek4?.paidInMonth).toBe('100000.00');

    const september = (await api().get('/contracts?overlaps=2026-09-01..2026-09-07').expect(200))
      .body as ContractOption[];
    expect(september[0]?.paidInMonth).toBe('70000.00');
  });

  it('CA-5 el contrato vigente trae lo pagado en el mes actual', async () => {
    const today = todayIn();
    const firstDay = `${today.slice(0, 8)}01`;
    const current = await newContract({ startDate: firstDay, endDate: null });
    await api()
      .post('/fee-payments', {
        contractId: current.id,
        periodYear: Number(today.slice(0, 4)),
        periodMonth: Number(today.slice(5, 7)),
        weekOfMonth: 1,
        paymentDate: today,
        notes: null,
        days: [day(firstDay, '80000.00')],
      })
      .expect(201);
    const provider = (
      await api().get(`/service-providers/${current.serviceProviderId}`).expect(200)
    ).body as ServiceProvider;
    expect(provider.activeContract).toMatchObject({
      monthlyAmount: '1000000.00',
      paidThisMonth: '80000.00',
    });
  });

  it('CA-8 otra organización no ve los contratos ni lo pagado', async () => {
    await api().post('/fee-payments', payment()).expect(201);
    const other = (
      await as(t, s.orgB.admin.token).get('/contracts?overlaps=2026-08-22..2026-08-31').expect(200)
    ).body as ContractOption[];
    expect(other).toEqual([]);
  });
});

describe('Edición y borrado', () => {
  it('CA-11 PUT reemplaza los días; contrato y periodo no cambian', async () => {
    const created = (await api().post('/fee-payments', payment()).expect(201)).body as FeePayment;
    const updated = (
      await api()
        .put(
          `/fee-payments/${created.id}`,
          payment({
            paymentDate: '2026-09-05',
            notes: 'Ajuste',
            days: [day('2026-08-30', '50000.00')],
          }),
        )
        .expect(200)
    ).body as FeePayment;
    expect(updated).toMatchObject({
      paymentDate: '2026-09-05',
      notes: 'Ajuste',
      total: '50000.00',
      days: [day('2026-08-30', '50000.00')],
    });

    const moved = await api()
      .put(`/fee-payments/${created.id}`, payment({ weekOfMonth: 3, days: [day('2026-08-17')] }))
      .expect(422);
    expect(moved.body).toMatchObject({ code: 'FEE_PAYMENT_PERIOD_IMMUTABLE' });
  });

  it('CA-12 y CA-13 el borrado es lógico, deja de sumar y todo queda auditado', async () => {
    const created = (await api().post('/fee-payments', payment()).expect(201)).body as FeePayment;
    await api()
      .put(`/fee-payments/${created.id}`, payment({ days: [day('2026-08-24', '1.00')] }))
      .expect(200);
    await api().delete(`/fee-payments/${created.id}`).expect(204);
    await api().get(`/fee-payments/${created.id}`).expect(404);

    const contracts = (
      await api().get(`/service-providers/${contract.serviceProviderId}/contracts`).expect(200)
    ).body as Contract[];
    expect(contracts[0]).toMatchObject({ monthlyAmount: '1000000.00' });
    const [august] = (await api().get('/contracts?overlaps=2026-08-22..2026-08-31').expect(200))
      .body as ContractOption[];
    expect(august?.paidInMonth).toBe('0.00');

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'fee_payment'), eq(auditLogs.entityId, created.id)));
    expect(rows.map((r) => r.action).sort()).toEqual([
      'fee_payment.create',
      'fee_payment.delete',
      'fee_payment.update',
    ]);
    expect(rows.find((r) => r.action === 'fee_payment.update')?.changes).toMatchObject({
      before: { total: '250000.50' },
      after: { total: '1.00' },
    });
  });

  it('CA-14 y CA-15 un contrato con pagos no se borra ni cambia sus fechas dejando días afuera', async () => {
    await api().post('/fee-payments', payment()).expect(201);
    const del = await api().delete(`/contracts/${contract.id}`).expect(422);
    expect(del.body).toMatchObject({ code: 'CONTRACT_HAS_PAYMENTS' });
    const dates = await api()
      .patch(`/contracts/${contract.id}`, { startDate: '2026-08-25' })
      .expect(422);
    expect(dates.body).toMatchObject({ code: 'CONTRACT_DATES_EXCLUDE_PAYMENTS' });
  });
});

describe('Consulta', () => {
  it('CA-16 filtra por año, mes, semana y prestador', async () => {
    const a = (await api().post('/fee-payments', payment()).expect(201)).body as FeePayment;
    await api()
      .post('/fee-payments', payment({ weekOfMonth: 1, days: [day('2026-08-03')] }))
      .expect(201);

    const week4 = (
      await api().get('/fee-payments?periodYear=2026&periodMonth=8&weekOfMonth=4').expect(200)
    ).body as FeePayment[];
    expect(week4.map((p) => p.id)).toEqual([a.id]);
    const byProvider = (
      await api().get(`/fee-payments?serviceProviderId=${contract.serviceProviderId}`).expect(200)
    ).body as FeePayment[];
    expect(byProvider).toHaveLength(2);
  });

  it('CA-17 lista los contratos que se cruzan con la semana', async () => {
    const later = await newContract({ startDate: '2026-09-01', endDate: null });
    const week4 = (await api().get('/contracts?overlaps=2026-08-22..2026-08-31').expect(200))
      .body as ContractOption[];
    expect(week4.map((c) => c.id)).toContain(contract.id);
    expect(week4.map((c) => c.id)).not.toContain(later.id);
    await api().get('/contracts?overlaps=2026-08-31..2026-08-22').expect(422);
  });
});

describe('CA-18 aislamiento entre organizaciones', () => {
  it('un admin de B no ve ni toca pagos ni contratos de A', async () => {
    const created = (await api().post('/fee-payments', payment()).expect(201)).body as FeePayment;
    const b = as(t, s.orgB.admin.token);
    expect(
      ((await b.get('/fee-payments').expect(200)).body as FeePayment[]).map((p) => p.id),
    ).not.toContain(created.id);
    await b.get(`/fee-payments/${created.id}`).expect(404);
    await b.put(`/fee-payments/${created.id}`, payment()).expect(404);
    await b.delete(`/fee-payments/${created.id}`).expect(404);
    await b
      .post('/fee-payments', payment({ weekOfMonth: 1, days: [day('2026-08-03')] }))
      .expect(404);
    expect(
      (
        (await b.get('/contracts?overlaps=2026-08-01..2026-12-31').expect(200))
          .body as ContractOption[]
      ).map((c) => c.id),
    ).not.toContain(contract.id);
  });
});
