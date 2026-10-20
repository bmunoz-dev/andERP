import type {
  Contract,
  Credential,
  Expense,
  ExpenseCategory,
  FeePayment,
  FixedPayment,
  Member,
  Obligation,
  Organization,
  ServiceProvider,
} from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import {
  auditLogs,
  contractDocuments,
  documentTypes,
  obligationDueDates,
  passwordResets,
} from '../src/db/schema';
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

describe('Pagos de monto fijo', () => {
  async function fixedContract(): Promise<Contract> {
    const contract = await newContract();
    return body<Contract>(api().patch(`/contracts/${contract.id}`, { paymentMode: 'fixed' }));
  }
  const fixedPayment = (contractId: string) => ({
    contractId,
    periodYear: 2026,
    periodMonth: 8,
    paymentDate: '2026-09-02',
    amount: '50000.00',
  });

  it('crear', async () => {
    const contract = await fixedContract();
    await failAudit('fixed_payment.create');
    await body(api().post('/fixed-payments', fixedPayment(contract.id)), 500);
    expect(await body<FixedPayment[]>(api().get('/fixed-payments'))).toHaveLength(0);
  });

  it('editar', async () => {
    const contract = await fixedContract();
    const p = await body<FixedPayment>(
      api().post('/fixed-payments', fixedPayment(contract.id)),
      201,
    );
    await failAudit('fixed_payment.update');
    await body(api().patch(`/fixed-payments/${p.id}`, { amount: '1.00' }), 500);
    expect((await body<FixedPayment>(api().get(`/fixed-payments/${p.id}`))).amount).toBe(
      '50000.00',
    );
  });

  it('borrar', async () => {
    const contract = await fixedContract();
    const p = await body<FixedPayment>(
      api().post('/fixed-payments', fixedPayment(contract.id)),
      201,
    );
    await failAudit('fixed_payment.delete');
    await body(api().delete(`/fixed-payments/${p.id}`), 500);
    await body(api().get(`/fixed-payments/${p.id}`));
  });
});

describe('Documento del contrato', () => {
  const PDF = Buffer.from('%PDF-1.7 prueba');
  const upload = (contractId: string, name: string) =>
    api().post(`/contracts/${contractId}/document`).attach('file', PDF, name);

  it('subir', async () => {
    const contract = await newContract();
    await failAudit('contract_document.upload');
    await body(upload(contract.id, 'a.pdf'), 500);
    expect(await db.select().from(contractDocuments)).toHaveLength(0);
  });

  it('reemplazar', async () => {
    const contract = await newContract();
    await body(upload(contract.id, 'a.pdf'), 201);
    await failAudit('contract_document.replace');
    await body(upload(contract.id, 'b.pdf'), 500);
    const rows = await db.select().from(contractDocuments);
    expect(rows.map((r) => [r.fileName, r.deletedAt])).toEqual([['a.pdf', null]]);
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
    t.mailer.sent = [];
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
    // El correo es lo último antes de confirmar: si algo falla antes, no sale.
    expect(t.mailer.sent).toHaveLength(0);
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
    t.mailer.sent = [];
    await body(invite(email), 500);
    expect(t.mailer.sent).toHaveLength(0);
    expect((await members()).find((m) => m.email === email)).toBeUndefined();
  });

  it('reenviar la invitación', async () => {
    const invited = await body<Member>(invite(`p-${randomUUID()}@empresa.co`), 201);
    await failAudit('member.invite_resent');
    t.mailer.sent = [];
    await body(api().post(`/members/${invited.userId}/resend-invite`), 500);
    const tokens = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, invited.userId));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.usedAt).toBeNull();
    expect(t.mailer.sent).toHaveLength(0);
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
  const input = {
    entityName: 'DIAN',
    username: 'contador@empresa.co',
    password: 'una-clave-segura-123',
  };
  const credentials = () => body<Credential[]>(api().get('/credentials'));

  it('crear', async () => {
    await failAudit('credential.create');
    await body(api().post('/credentials', input), 500);
    expect(await credentials()).toHaveLength(0);
  });

  it('borrar', async () => {
    const c = await body<Credential>(api().post('/credentials', input), 201);
    await failAudit('credential.delete');
    await body(api().delete(`/credentials/${c.id}`), 500);
    await body(api().get(`/credentials/${c.id}`));
  });

  it('editar', async () => {
    const c = await body<Credential>(api().post('/credentials', input), 201);
    await failAudit('credential.update');
    await body(api().patch(`/credentials/${c.id}`, { entityName: 'Otra' }), 500);
    expect((await body<Credential>(api().get(`/credentials/${c.id}`))).entityName).toBe('DIAN');
  });
});

/**
 * Dos borrados simultáneos: la prueba bloquea la fila, las dos peticiones leen el `before` y se
 * quedan esperando en el `UPDATE`; al soltar el bloqueo, una borra y la otra ya no encuentra la
 * fila. Debe responder 404 y no dejar un segundo registro de auditoría.
 */
describe('Agenda de pagos', () => {
  const create = () =>
    api().post('/obligations', {
      entityName: 'DIAN',
      concept: 'IVA bimestral',
      frequency: 'bimonthly',
      firstDueDate: '2026-11-12',
    });
  const list = () => body<Obligation[]>(api().get('/obligations'));

  it('crear (con su primer vencimiento)', async () => {
    await failAudit('obligation.create');
    await body(create(), 500);
    expect(await list()).toHaveLength(0);
    expect(
      await db
        .select()
        .from(obligationDueDates)
        .where(eq(obligationDueDates.organizationId, s.orgA.id)),
    ).toHaveLength(0);
  });

  it('editar', async () => {
    const o = await body<Obligation>(create(), 201);
    await failAudit('obligation.update');
    await body(api().patch(`/obligations/${o.id}`, { noticeDays: 40 }), 500);
    expect((await body<Obligation>(api().get(`/obligations/${o.id}`))).noticeDays).toBe(15);
  });

  it('borrar', async () => {
    const o = await body<Obligation>(create(), 201);
    await failAudit('obligation.delete');
    await body(api().delete(`/obligations/${o.id}`), 500);
    await body(api().get(`/obligations/${o.id}`));
  });
  it('completar (con el siguiente)', async () => {
    const o = await body<Obligation>(create(), 201);
    await failAudit('obligation_due_date.complete');
    await body(
      api().post(`/obligations/${o.id}/complete`, {
        dueDateId: o.pending!.id,
        nextDueDate: '2027-01-12',
      }),
      500,
    );
    expect((await body<Obligation>(api().get(`/obligations/${o.id}`))).pending).toEqual(o.pending);
  });

  it('cambiar el pendiente', async () => {
    const o = await body<Obligation>(create(), 201);
    await failAudit('obligation_due_date.set');
    await body(api().put(`/obligations/${o.id}/pending`, { dueDate: '2026-12-01' }), 500);
    expect((await body<Obligation>(api().get(`/obligations/${o.id}`))).pending).toEqual(o.pending);
  });

  it('quitar el pendiente', async () => {
    const o = await body<Obligation>(create(), 201);
    await failAudit('obligation_due_date.delete');
    await body(api().delete(`/obligations/${o.id}/pending`), 500);
    expect((await body<Obligation>(api().get(`/obligations/${o.id}`))).pending).toEqual(o.pending);
  });
});

describe('Dos borrados simultáneos', () => {
  /** Espera a que `n` peticiones estén bloqueadas esperando un lock (`pg_locks` lo ve cualquier rol). */
  async function waitForBlocked(n: number): Promise<void> {
    for (let i = 0; i < 200; i++) {
      const [row] = await withOwnerSql(
        (sql) => sql<{ n: number }[]>`select count(*)::int as n from pg_locks where not granted`,
      );
      if (row!.n >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Las peticiones nunca quedaron bloqueadas');
  }

  const createExpense = async () => {
    const categories = await body<ExpenseCategory[]>(api().get('/expense-categories'));
    return (
      await body<Expense>(
        api().post('/expenses', {
          categoryId: categories.find((c) => c.name === 'Jurídico')!.id,
          concept: 'Papelería',
          paymentDate: '2026-09-08',
          amount: '100000.00',
        }),
        201,
      )
    ).id;
  };

  const cases: [string, string, string, () => Promise<string>][] = [
    ['expenses', '/expenses', 'expense.delete', createExpense],
    [
      'fee_payments',
      '/fee-payments',
      'fee_payment.delete',
      async () =>
        (
          await body<FeePayment>(
            api().post('/fee-payments', payment((await newContract()).id)),
            201,
          )
        ).id,
    ],
    ['provider_contracts', '/contracts', 'contract.delete', async () => (await newContract()).id],
  ];

  it.each(cases)(
    '%s: uno responde 204, el otro 404 y queda una sola auditoría',
    async (table, path, action, create) => {
      const id = await create();
      let statuses!: Promise<number[]>;
      await withOwnerSql((sql) =>
        sql.begin(async (tx) => {
          await tx.unsafe(`select 1 from anderp.${table} where id = $1 for update`, [id]);
          statuses = Promise.all(
            [1, 2].map(() =>
              api()
                .delete(`${path}/${id}`)
                .then((res) => res.status),
            ),
          );
          await waitForBlocked(2);
        }),
      );

      expect((await statuses).sort()).toEqual([204, 404]);
      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, action), eq(auditLogs.entityId, id)));
      expect(logs).toHaveLength(1);
    },
  );
});
