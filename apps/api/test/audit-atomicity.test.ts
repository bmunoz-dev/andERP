import type {
  ClickiuMovement,
  Contract,
  Credential,
  Expense,
  ExpenseCategory,
  FeePayment,
  Member,
  Organization,
  ServiceProvider,
} from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { documentTypes, passwordResets } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, createMember, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb, withOwnerSql } from './setup/reset-db';

/**
 * F12: el cambio y su auditoría se confirman juntos. Un trigger de prueba hace fallar el insert
 * en `audit_logs` de una sola acción con un error interno (500, como un fallo real); el cambio
 * no debe quedar guardado.
 */

let t: TestApp;
let db: Database;
let s: TwoOrgs;
let documentTypeId: string;

const api = () => as(t, s.orgA.admin.token);
const platform = () => as(t, s.superAdmin.token);

async function failAudit(action: string): Promise<void> {
  await withOwnerSql((sql) =>
    sql.unsafe(`create trigger test_fail_audit before insert on anderp.audit_logs
      for each row execute function anderp.test_fail_audit('${action}')`),
  );
}

async function body<T>(req: PromiseLike<{ status: number; body: unknown }>, status = 200) {
  const res = await req;
  expect(res.status).toBe(status);
  return res.body as T;
}

async function newContract(): Promise<Contract> {
  const provider = await body<ServiceProvider>(
    api().post('/service-providers', {
      name: 'Ana Pérez',
      documentTypeId,
      documentNumber: String(Math.floor(Math.random() * 1e9)),
    }),
    201,
  );
  return body<Contract>(
    api().post(`/service-providers/${provider.id}/contracts`, {
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      workAgreement: 'Asesoría',
      paymentFrequency: 'weekly',
      monthlyAmount: '1000000.00',
    }),
    201,
  );
}

const payment = (contractId: string, paymentDate = '2026-09-02') => ({
  contractId,
  periodYear: 2026,
  periodMonth: 8,
  weekOfMonth: 4,
  paymentDate,
  notes: null,
  days: [{ workDate: '2026-08-24', amount: '50000.00', isHoliday: false }],
});

const contractsOf = (providerId: string) =>
  body<Contract[]>(api().get(`/service-providers/${providerId}/contracts`));

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  documentTypeId = cc!.id;
  await withOwnerSql(
    (sql) => sql`create function anderp.test_fail_audit() returns trigger language plpgsql as $$
      begin
        if new.action = tg_argv[0] then
          raise exception 'audit_logs no disponible' using errcode = 'XX000';
        end if;
        return new;
      end;
      $$`,
  );
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
});

afterEach(async () => {
  await withOwnerSql((sql) => sql`drop trigger if exists test_fail_audit on anderp.audit_logs`);
});

afterAll(async () => {
  await withOwnerSql((sql) => sql`drop function if exists anderp.test_fail_audit()`);
  await t.close();
});

describe('Clic Kiu', () => {
  const recharge = (amount = '100.00') =>
    api().post('/clickiu/movements', { type: 'recharge', movementDate: '2026-09-01', amount });
  const list = () =>
    body<ClickiuMovement[]>(api().get('/clickiu/movements?from=2026-09-01&to=2026-09-30'));

  it('crear', async () => {
    await failAudit('clickiu_movement.create');
    await body(recharge(), 500);
    expect(await list()).toHaveLength(0);
  });

  it('editar', async () => {
    const m = await body<ClickiuMovement>(recharge(), 201);
    await failAudit('clickiu_movement.update');
    await body(api().patch(`/clickiu/movements/${m.id}`, { amount: '200.00' }), 500);
    expect((await body<ClickiuMovement>(api().get(`/clickiu/movements/${m.id}`))).amount).toBe(
      '100.00',
    );
  });

  it('borrar', async () => {
    const m = await body<ClickiuMovement>(recharge(), 201);
    await failAudit('clickiu_movement.delete');
    await body(api().delete(`/clickiu/movements/${m.id}`), 500);
    await body(api().get(`/clickiu/movements/${m.id}`));
  });
});

describe('Egresos', () => {
  const expense = async () => {
    const categories = await body<ExpenseCategory[]>(api().get('/expense-categories'));
    return {
      categoryId: categories.find((c) => c.name === 'Jurídico')!.id,
      concept: 'Papelería',
      invoiceNumber: 'FV-001',
      paymentDate: '2026-09-08',
      amount: '100000.00',
    };
  };

  it('crear', async () => {
    const input = await expense();
    await failAudit('expense.create');
    await body(api().post('/expenses', input), 500);
    const ledger = await body<{ concept: string }[]>(
      api().get('/reports/expenses/ledger?year=2026&month=9'),
    );
    expect(ledger.filter((e) => e.concept === 'Papelería')).toHaveLength(0);
  });

  it('editar', async () => {
    const e = await body<Expense>(api().post('/expenses', await expense()), 201);
    await failAudit('expense.update');
    await body(api().patch(`/expenses/${e.id}`, { concept: 'Otro' }), 500);
    expect((await body<Expense>(api().get(`/expenses/${e.id}`))).concept).toBe('Papelería');
  });

  it('borrar', async () => {
    const e = await body<Expense>(api().post('/expenses', await expense()), 201);
    await failAudit('expense.delete');
    await body(api().delete(`/expenses/${e.id}`), 500);
    await body(api().get(`/expenses/${e.id}`));
  });
});

describe('Pagos de honorarios', () => {
  it('crear', async () => {
    const contract = await newContract();
    await failAudit('fee_payment.create');
    await body(api().post('/fee-payments', payment(contract.id)), 500);
    expect(await body<FeePayment[]>(api().get('/fee-payments'))).toHaveLength(0);
  });

  it('editar', async () => {
    const contract = await newContract();
    const p = await body<FeePayment>(api().post('/fee-payments', payment(contract.id)), 201);
    await failAudit('fee_payment.update');
    await body(api().put(`/fee-payments/${p.id}`, payment(contract.id, '2026-09-03')), 500);
    expect((await body<FeePayment>(api().get(`/fee-payments/${p.id}`))).paymentDate).toBe(
      '2026-09-02',
    );
  });

  it('borrar', async () => {
    const contract = await newContract();
    const p = await body<FeePayment>(api().post('/fee-payments', payment(contract.id)), 201);
    await failAudit('fee_payment.delete');
    await body(api().delete(`/fee-payments/${p.id}`), 500);
    await body(api().get(`/fee-payments/${p.id}`));
  });
});

describe('Contratos', () => {
  it('crear', async () => {
    const provider = (await newContract()).serviceProviderId;
    await failAudit('contract.create');
    await body(
      api().post(`/service-providers/${provider}/contracts`, {
        startDate: '2027-01-01',
        workAgreement: 'Otro',
        paymentFrequency: 'weekly',
        monthlyAmount: '1000.00',
      }),
      500,
    );
    expect(await contractsOf(provider)).toHaveLength(1);
  });

  it('editar', async () => {
    const c = await newContract();
    await failAudit('contract.update');
    await body(api().patch(`/contracts/${c.id}`, { workAgreement: 'Otro' }), 500);
    expect((await contractsOf(c.serviceProviderId))[0]!.workAgreement).toBe('Asesoría');
  });

  it('borrar', async () => {
    const c = await newContract();
    await failAudit('contract.delete');
    await body(api().delete(`/contracts/${c.id}`), 500);
    expect(await contractsOf(c.serviceProviderId)).toHaveLength(1);
  });
});

describe('Organizaciones', () => {
  it('crear', async () => {
    const taxId = randomUUID().slice(0, 18);
    await failAudit('organization.create');
    await body(
      platform().post('/platform/organizations', {
        name: 'Nueva',
        taxId,
        admin: { email: `admin-${randomUUID()}@nueva.co`, firstName: 'Laura', lastName: 'Ríos' },
      }),
      500,
    );
    const list = await body<Organization[]>(platform().get('/platform/organizations'));
    expect(list.find((o) => o.taxId === taxId)).toBeUndefined();
  });

  it('editar', async () => {
    await failAudit('organization.update');
    await body(
      platform().patch(`/platform/organizations/${s.orgA.id}`, { status: 'suspended' }),
      500,
    );
    const org = await body<Organization>(platform().get(`/platform/organizations/${s.orgA.id}`));
    expect(org.status).toBe('active');
  });
});

describe('Miembros', () => {
  const members = () => body<Member[]>(api().get('/members'));
  const invite = (email: string) =>
    api().post('/members', { email, firstName: 'Pedro', lastName: 'Luna' });

  it('invitar', async () => {
    const email = `p-${randomUUID()}@empresa.co`;
    await failAudit('member.invite');
    await body(invite(email), 500);
    expect((await members()).find((m) => m.email === email)).toBeUndefined();
  });

  it('reenviar la invitación', async () => {
    const invited = await body<Member>(invite(`p-${randomUUID()}@empresa.co`), 201);
    await failAudit('member.invite_resent');
    await body(api().post(`/members/${invited.userId}/resend-invite`), 500);
    const tokens = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, invited.userId));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.usedAt).toBeNull();
  });

  it('desactivar', async () => {
    const other = await createMember(t, db, s.orgA.id);
    await failAudit('member.deactivate');
    await body(api().patch(`/members/${other.id}`, { isActive: false }), 500);
    expect((await members()).find((m) => m.userId === other.id)!.isActive).toBe(true);
  });

  it('activar', async () => {
    const other = await createMember(t, db, s.orgA.id);
    await body(api().patch(`/members/${other.id}`, { isActive: false }));
    await failAudit('member.activate');
    await body(api().patch(`/members/${other.id}`, { isActive: true }), 500);
    expect((await members()).find((m) => m.userId === other.id)!.isActive).toBe(false);
  });
});

describe('Credenciales', () => {
  it('editar', async () => {
    const c = await body<Credential>(
      api().post('/credentials', {
        entityName: 'DIAN',
        username: 'contador@empresa.co',
        password: 'una-clave-segura-123',
      }),
      201,
    );
    await failAudit('credential.update');
    await body(api().patch(`/credentials/${c.id}`, { entityName: 'Otra' }), 500);
    expect((await body<Credential>(api().get(`/credentials/${c.id}`))).entityName).toBe('DIAN');
  });
});
