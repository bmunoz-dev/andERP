import type {
  Contract,
  Expense,
  ExpenseCategory,
  FeePayment,
  LedgerEntry,
  MonthlyMatrix,
  ServiceProvider,
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
let categories: Record<string, ExpenseCategory>;

const api = () => as(t, s.orgA.admin.token);

function expense(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: categories['Jurídico']!.id,
    concept: 'Papelería',
    invoiceNumber: 'FV-001',
    paymentDate: '2026-09-08',
    amount: '100000.00',
    ...overrides,
  };
}

async function createExpense(overrides: Record<string, unknown> = {}): Promise<Expense> {
  return (await api().post('/expenses', expense(overrides)).expect(201)).body as Expense;
}

/** Pago de honorarios de $50.000: periodo semana 4 de agosto, pagado el 2 de septiembre. */
async function createFeePayment(): Promise<FeePayment> {
  const provider = (
    await api()
      .post('/service-providers', {
        name: 'Ana Pérez',
        documentTypeId,
        documentNumber: String(Math.floor(Math.random() * 1e9)),
      })
      .expect(201)
  ).body as ServiceProvider;
  const contract = (
    await api()
      .post(`/service-providers/${provider.id}/contracts`, {
        startDate: '2026-08-01',
        endDate: '2026-12-31',
        workAgreement: 'Asesoría',
        paymentFrequency: 'weekly',
        monthlyAmount: '1000000.00',
      })
      .expect(201)
  ).body as Contract;
  return (
    await api()
      .post('/fee-payments', {
        contractId: contract.id,
        periodYear: 2026,
        periodMonth: 8,
        weekOfMonth: 4,
        paymentDate: '2026-09-02',
        notes: null,
        days: [{ workDate: '2026-08-24', amount: '50000.00', isHoliday: false }],
      })
      .expect(201)
  ).body as FeePayment;
}

const monthly = async (year = 2026, month = 9) =>
  (await api().get(`/reports/expenses/monthly?year=${year}&month=${month}`).expect(200))
    .body as MonthlyMatrix;

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  documentTypeId = cc!.id;
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
  const list = (await api().get('/expense-categories').expect(200)).body as ExpenseCategory[];
  categories = Object.fromEntries(list.map((c) => [c.name, c]));
});

afterAll(async () => {
  await t.close();
});

describe('Egresos manuales', () => {
  it('CA-1 y CA-2 crea el egreso con la semana calculada por la base de datos', async () => {
    const created = await createExpense();
    expect(created).toMatchObject({
      concept: 'Papelería',
      invoiceNumber: 'FV-001',
      paymentDate: '2026-09-08',
      weekOfMonth: 2,
      amount: '100000.00',
    });
    for (const [date, week] of [
      ['2026-08-07', 1],
      ['2026-08-21', 3],
      ['2026-08-22', 4],
      ['2026-08-31', 4],
    ] as const) {
      expect((await createExpense({ paymentDate: date })).weekOfMonth).toBe(week);
    }
  });

  it('CA-3 no admite la categoría de honorarios ni una inactiva', async () => {
    const fees = await api().post(
      '/expenses',
      expense({ categoryId: categories['Honorarios']!.id }),
    );
    expect(fees.status).toBe(422);
    expect(fees.body.code).toBe('FEES_CATEGORY_NOT_ALLOWED');

    const created = await createExpense();
    const move = await api().patch(`/expenses/${created.id}`, {
      categoryId: categories['Honorarios']!.id,
    });
    expect(move.body.code).toBe('FEES_CATEGORY_NOT_ALLOWED');

    const extra = categories['Gastos extras']!.id;
    await api().patch(`/expense-categories/${extra}`, { isActive: false }).expect(200);
    const inactive = await api().post('/expenses', expense({ categoryId: extra }));
    expect(inactive.status).toBe(422);
    expect(inactive.body.code).toBe('INACTIVE_CATEGORY');
    const change = await api().patch(`/expenses/${created.id}`, { categoryId: extra });
    expect(change.body.code).toBe('INACTIVE_CATEGORY');
  });

  it('CA-4 valida monto, concepto y factura', async () => {
    for (const body of [
      expense({ amount: '0.00' }),
      expense({ concept: '  ' }),
      expense({ invoiceNumber: 'x'.repeat(41) }),
    ]) {
      const res = await api().post('/expenses', body);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await createExpense({ invoiceNumber: '' })).invoiceNumber).toBeNull();
  });

  it('CA-5 y CA-6 edita y borra con auditoría', async () => {
    const created = await createExpense();
    const updated = (
      await api()
        .patch(`/expenses/${created.id}`, { amount: '120000.00', paymentDate: '2026-09-22' })
        .expect(200)
    ).body as Expense;
    expect(updated).toMatchObject({ amount: '120000.00', weekOfMonth: 4 });

    await api().delete(`/expenses/${created.id}`).expect(204);
    await api().get(`/expenses/${created.id}`).expect(404);

    const logs = await db
      .select({ action: auditLogs.action, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'expense'), eq(auditLogs.entityId, created.id)));
    expect(logs.map((l) => l.action).sort()).toEqual([
      'expense.create',
      'expense.delete',
      'expense.update',
    ]);
    const update = logs.find((l) => l.action === 'expense.update')!;
    expect(update.changes).toMatchObject({
      before: { amount: '100000.00' },
      after: { amount: '120000.00' },
    });
  });

  it('CA-7 una categoría con egresos no se borra, pero se puede desactivar', async () => {
    const legal = categories['Jurídico']!.id;
    await createExpense();
    const res = await api().delete(`/expense-categories/${legal}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CATEGORY_HAS_EXPENSES');
    await api().patch(`/expense-categories/${legal}`, { isActive: false }).expect(200);
  });
});

describe('Matriz y libro', () => {
  it('CA-8 a CA-11 suma egresos y honorarios por fecha de pago, sin doble conteo', async () => {
    await createExpense();
    const fee = await createFeePayment();
    const matrix = await monthly();

    expect(matrix.weeks).toEqual([
      { week: 1, start: '2026-09-01', end: '2026-09-07' },
      { week: 2, start: '2026-09-08', end: '2026-09-14' },
      { week: 3, start: '2026-09-15', end: '2026-09-21' },
      { week: 4, start: '2026-09-22', end: '2026-09-30' },
    ]);
    expect(matrix.rows.map((r) => r.name)).toEqual([
      'Administrativo',
      'Honorarios',
      'Comercial',
      'Jurídico',
      'Tributario',
      'Nómina',
      'Gastos extras',
    ]);
    const row = (name: string) => matrix.rows.find((r) => r.name === name)!;
    expect(row('Honorarios')).toMatchObject({
      isSystem: true,
      cells: ['50000.00', '0.00', '0.00', '0.00'],
      total: '50000.00',
    });
    expect(row('Jurídico')).toMatchObject({
      isSystem: false,
      cells: ['0.00', '100000.00', '0.00', '0.00'],
      total: '100000.00',
    });
    expect(row('Nómina').total).toBe('0.00');
    expect(matrix.weekTotals).toEqual(['50000.00', '100000.00', '0.00', '0.00']);
    expect(matrix.grandTotal).toBe('150000.00');

    // El periodo es agosto, pero el pago cuenta en septiembre (CA-10).
    expect((await monthly(2026, 8)).grandTotal).toBe('0.00');

    const ledger = (await api().get('/reports/expenses/ledger?year=2026&month=9').expect(200))
      .body as LedgerEntry[];
    expect(ledger).toEqual([
      expect.objectContaining({
        source: 'fee_payment',
        sourceId: fee.id,
        concept: 'Honorarios – Ana Pérez – Sem 4 08/2026',
        paymentDate: '2026-09-02',
        weekOfMonth: 1,
        amount: '50000.00',
      }),
      expect.objectContaining({ source: 'manual', paymentDate: '2026-09-08', amount: '100000.00' }),
    ]);
  });

  it('CA-11 incluye las categorías inactivas solo si tienen montos ese mes', async () => {
    await createExpense();
    await api()
      .patch(`/expense-categories/${categories['Jurídico']!.id}`, { isActive: false })
      .expect(200);
    await api()
      .patch(`/expense-categories/${categories['Nómina']!.id}`, { isActive: false })
      .expect(200);
    const names = (await monthly()).rows.map((r) => r.name);
    expect(names).toContain('Jurídico');
    expect(names).not.toContain('Nómina');
  });

  it('CA-12 filtra el libro por categoría y semana', async () => {
    await createExpense();
    await createExpense({ categoryId: categories['Comercial']!.id, paymentDate: '2026-09-15' });
    await createFeePayment();
    const get = async (query: string) =>
      (await api().get(`/reports/expenses/ledger?year=2026&month=9${query}`).expect(200))
        .body as LedgerEntry[];
    expect(await get(`&categoryId=${categories['Comercial']!.id}`)).toHaveLength(1);
    expect((await get('&week=1')).map((e) => e.source)).toEqual(['fee_payment']);
    expect(await get('')).toHaveLength(3);
  });

  it('valida year y month en los reportes', async () => {
    for (const query of ['', '?year=2026', '?year=2026&month=13', '?year=abc&month=1']) {
      const res = await api().get(`/reports/expenses/monthly${query}`);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('Aislamiento', () => {
  it('CA-13 otra organización no ve ni toca los egresos ajenos', async () => {
    const created = await createExpense();
    await createFeePayment();
    const other = as(t, s.orgB.admin.token);

    await other.get(`/expenses/${created.id}`).expect(404);
    await other.patch(`/expenses/${created.id}`, { amount: '1.00' }).expect(404);
    await other.delete(`/expenses/${created.id}`).expect(404);
    const matrix = (await other.get('/reports/expenses/monthly?year=2026&month=9').expect(200))
      .body as MonthlyMatrix;
    expect(matrix.grandTotal).toBe('0.00');
    const ledger = (await other.get('/reports/expenses/ledger?year=2026&month=9').expect(200))
      .body as LedgerEntry[];
    expect(ledger).toEqual([]);

    // Ni puede registrar un egreso en una categoría de la organización A.
    const res = await other.post('/expenses', expense());
    expect(res.status).toBe(404);
  });
});
