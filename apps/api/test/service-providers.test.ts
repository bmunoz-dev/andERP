import { addDays, type Contract, type ServiceProvider, todayIn } from '@anderp/shared';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { accountTypes, auditLogs, banks, documentTypes } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;
const catalog = { cc: '', nit: '', bank: '', inactiveBank: '', savings: '' };

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  const [nit] = await db.insert(documentTypes).values({ code: 'NIT', name: 'NIT' }).returning();
  const [bank] = await db.insert(banks).values({ name: 'Bancolombia' }).returning();
  const [inactive] = await db
    .insert(banks)
    .values({ name: 'Banco cerrado', isActive: false })
    .returning();
  const [savings] = await db.insert(accountTypes).values({ name: 'Ahorros' }).returning();
  Object.assign(catalog, {
    cc: cc!.id,
    nit: nit!.id,
    bank: bank!.id,
    inactiveBank: inactive!.id,
    savings: savings!.id,
  });
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
});

afterAll(async () => {
  await t.close();
});

const today = () => todayIn();
const api = () => as(t, s.orgA.admin.token);

function providerInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ana Pérez',
    documentTypeId: catalog.cc,
    documentNumber: `${Math.floor(Math.random() * 1e9)}`,
    ...overrides,
  };
}

async function createProvider(overrides: Record<string, unknown> = {}): Promise<ServiceProvider> {
  return (await api().post('/service-providers', providerInput(overrides)).expect(201))
    .body as ServiceProvider;
}

function contractInput(overrides: Record<string, unknown> = {}) {
  return {
    startDate: addDays(today(), -30),
    endDate: addDays(today(), 30),
    workAgreement: 'Asesoría contable semanal',
    paymentFrequency: 'weekly',
    totalAmount: '4500000.00',
    ...overrides,
  };
}

async function createContract(
  providerId: string,
  overrides: Record<string, unknown> = {},
): Promise<Contract> {
  return (
    await api()
      .post(`/service-providers/${providerId}/contracts`, contractInput(overrides))
      .expect(201)
  ).body as Contract;
}

describe('Prestadores', () => {
  it('CA-1 crea con y sin cuenta bancaria; a medias → 422 INCOMPLETE_BANK_ACCOUNT', async () => {
    const withoutBank = await createProvider({ description: 'Contadora' });
    expect(withoutBank).toMatchObject({
      name: 'Ana Pérez',
      documentType: { id: catalog.cc, code: 'CC' },
      description: 'Contadora',
      bank: null,
      accountType: null,
      accountNumber: null,
      activeContract: null,
    });

    const withBank = await createProvider({
      bankId: catalog.bank,
      accountTypeId: catalog.savings,
      accountNumber: '123-456789-00',
    });
    expect(withBank).toMatchObject({
      bank: { id: catalog.bank, name: 'Bancolombia' },
      accountType: { id: catalog.savings, name: 'Ahorros' },
      accountNumber: '123-456789-00',
    });

    const partial = await api()
      .post('/service-providers', providerInput({ bankId: catalog.bank }))
      .expect(422);
    expect(partial.body).toMatchObject({ code: 'INCOMPLETE_BANK_ACCOUNT' });

    // Quitar solo el banco deja la cuenta a medias; quitar los tres campos sí se permite.
    await api().patch(`/service-providers/${withBank.id}`, { bankId: null }).expect(422);
    const cleared = await api()
      .patch(`/service-providers/${withBank.id}`, {
        bankId: null,
        accountTypeId: null,
        accountNumber: null,
      })
      .expect(200);
    expect((cleared.body as ServiceProvider).bank).toBeNull();
  });

  it('CA-2 valida el número de documento y lo exige único por organización', async () => {
    const invalid = await api()
      .post('/service-providers', providerInput({ documentNumber: '1' }))
      .expect(422);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });

    const first = await createProvider({
      documentNumber: '900123456-7',
      documentTypeId: catalog.nit,
    });
    const dup = await api()
      .post(
        '/service-providers',
        providerInput({ documentNumber: '900123456-7', documentTypeId: catalog.nit }),
      )
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_DOCUMENT' });

    // Mismo número con otro tipo de documento, o en otra organización: permitido.
    await createProvider({ documentNumber: '900123456-7', documentTypeId: catalog.cc });
    await as(t, s.orgB.admin.token)
      .post(
        '/service-providers',
        providerInput({ documentNumber: '900123456-7', documentTypeId: catalog.nit }),
      )
      .expect(201);

    // Tras borrarlo se puede volver a crear.
    await api().delete(`/service-providers/${first.id}`).expect(204);
    await createProvider({ documentNumber: '900123456-7', documentTypeId: catalog.nit });
  });

  it('CA-3 un catálogo inactivo no se acepta en altas, pero se conserva en los existentes', async () => {
    const res = await api()
      .post(
        '/service-providers',
        providerInput({
          bankId: catalog.inactiveBank,
          accountTypeId: catalog.savings,
          accountNumber: '1234',
        }),
      )
      .expect(422);
    expect(res.body).toMatchObject({ code: 'INACTIVE_CATALOG_VALUE' });

    const provider = await createProvider({
      bankId: catalog.bank,
      accountTypeId: catalog.savings,
      accountNumber: '1234',
    });
    await db.update(banks).set({ isActive: false }).where(eq(banks.id, catalog.bank));
    try {
      const renamed = await api()
        .patch(`/service-providers/${provider.id}`, { name: 'Ana P.' })
        .expect(200);
      expect((renamed.body as ServiceProvider).bank?.id).toBe(catalog.bank);
    } finally {
      await db.update(banks).set({ isActive: true }).where(eq(banks.id, catalog.bank));
    }
  });

  it('CA-4 busca por nombre o documento y filtra por contrato vigente', async () => {
    const tag = randomUUID().slice(0, 6);
    const active = await createProvider({
      name: `Laura ${tag} 100%`,
      documentNumber: `77${Date.now() % 1e8}`,
    });
    const idle = await createProvider({ name: `Pedro ${tag}` });
    await createContract(active.id);

    const byName = (
      await api()
        .get(`/service-providers?search=${encodeURIComponent(`laura ${tag}`)}`)
        .expect(200)
    ).body as ServiceProvider[];
    expect(byName.map((p) => p.id)).toEqual([active.id]);
    expect(byName[0]?.activeContract).toMatchObject({
      status: 'active',
      totalAmount: '4500000.00',
    });

    const byDocument = (
      await api().get(`/service-providers?search=${active.documentNumber}`).expect(200)
    ).body as ServiceProvider[];
    expect(byDocument.map((p) => p.id)).toEqual([active.id]);

    // "%" se busca literal, no como comodín.
    const literal = (
      await api()
        .get(`/service-providers?search=${encodeURIComponent('100%')}`)
        .expect(200)
    ).body as ServiceProvider[];
    expect(literal.map((p) => p.id)).toEqual([active.id]);

    const withContract = (
      await api().get(`/service-providers?search=${tag}&hasActiveContract=true`).expect(200)
    ).body as ServiceProvider[];
    expect(withContract.map((p) => p.id)).toEqual([active.id]);
    const withoutContract = (
      await api().get(`/service-providers?search=${tag}&hasActiveContract=false`).expect(200)
    ).body as ServiceProvider[];
    expect(withoutContract.map((p) => p.id)).toEqual([idle.id]);
  });

  it('CA-5 no se borra un prestador con contratos', async () => {
    const provider = await createProvider();
    const contract = await createContract(provider.id);
    const res = await api().delete(`/service-providers/${provider.id}`).expect(422);
    expect(res.body).toMatchObject({ code: 'PROVIDER_HAS_CONTRACTS' });

    await api().delete(`/contracts/${contract.id}`).expect(204);
    await api().delete(`/service-providers/${provider.id}`).expect(204);
    await api().get(`/service-providers/${provider.id}`).expect(404);
  });
});

describe('Contratos', () => {
  it('CA-6 crea el contrato y valida fechas y valor', async () => {
    const provider = await createProvider();
    const contract = await createContract(provider.id, {
      endDate: null,
      paymentFrequency: 'monthly',
    });
    expect(contract).toMatchObject({
      serviceProviderId: provider.id,
      endDate: null,
      paymentFrequency: 'monthly',
      totalAmount: '4500000.00',
      status: 'active',
    });

    const range = await api()
      .post(
        `/service-providers/${provider.id}/contracts`,
        contractInput({ startDate: '2030-02-01', endDate: '2030-01-31' }),
      )
      .expect(422);
    expect(range.body).toMatchObject({ code: 'INVALID_DATE_RANGE' });

    for (const totalAmount of ['0.00', '-10.00', '1500000', 1500000]) {
      const res = await api()
        .post(`/service-providers/${provider.id}/contracts`, contractInput({ totalAmount }))
        .expect(422);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('CA-7 contratos cruzados → 409 CONTRACT_OVERLAP; contiguos sí se permiten', async () => {
    const provider = await createProvider();
    await createContract(provider.id, { startDate: '2025-01-01', endDate: '2025-06-30' });
    const overlap = await api()
      .post(
        `/service-providers/${provider.id}/contracts`,
        contractInput({ startDate: '2025-06-30', endDate: '2025-12-31' }),
      )
      .expect(409);
    expect(overlap.body).toMatchObject({ code: 'CONTRACT_OVERLAP' });
    await createContract(provider.id, { startDate: '2025-07-01', endDate: '2025-12-31' });
  });

  it('CA-8 lista del más reciente al más antiguo con su estado', async () => {
    const provider = await createProvider();
    await createContract(provider.id, {
      startDate: addDays(today(), -400),
      endDate: addDays(today(), -200),
    });
    await createContract(provider.id, {
      startDate: addDays(today(), -100),
      endDate: addDays(today(), 10),
    });
    await createContract(provider.id, { startDate: addDays(today(), 20), endDate: null });

    const contracts = (await api().get(`/service-providers/${provider.id}/contracts`).expect(200))
      .body as Contract[];
    expect(contracts.map((c) => c.status)).toEqual(['upcoming', 'active', 'ended']);

    const detail = (await api().get(`/service-providers/${provider.id}`).expect(200))
      .body as ServiceProvider;
    expect(detail.activeContract?.id).toBe(contracts[1]?.id);
  });

  it('CA-9 editar aplica las mismas validaciones', async () => {
    const provider = await createProvider();
    await createContract(provider.id, { startDate: '2025-01-01', endDate: '2025-06-30' });
    const second = await createContract(provider.id, {
      startDate: '2025-07-01',
      endDate: '2025-12-31',
    });

    const updated = (
      await api()
        .patch(`/contracts/${second.id}`, {
          totalAmount: '5000000.00',
          paymentFrequency: 'biweekly',
        })
        .expect(200)
    ).body as Contract;
    expect(updated).toMatchObject({
      totalAmount: '5000000.00',
      paymentFrequency: 'biweekly',
      endDate: '2025-12-31',
    });

    await api().patch(`/contracts/${second.id}`, { startDate: '2025-06-01' }).expect(409);
    const range = await api()
      .patch(`/contracts/${second.id}`, { endDate: '2025-06-01' })
      .expect(422);
    expect(range.body).toMatchObject({ code: 'INVALID_DATE_RANGE' });
  });

  it('CA-10 crear, editar y borrar contratos queda en la auditoría con antes y después', async () => {
    const provider = await createProvider();
    const contract = await createContract(provider.id, { totalAmount: '1000000.00' });
    await api().patch(`/contracts/${contract.id}`, { totalAmount: '2000000.00' }).expect(200);
    await api().delete(`/contracts/${contract.id}`).expect(204);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityType, 'provider_contract'), eq(auditLogs.entityId, contract.id)),
      );
    expect(rows.map((r) => r.action).sort()).toEqual([
      'contract.create',
      'contract.delete',
      'contract.update',
    ]);
    const update = rows.find((r) => r.action === 'contract.update');
    expect(update).toMatchObject({
      userId: s.orgA.admin.id,
      organizationId: s.orgA.id,
      changes: { before: { totalAmount: '1000000.00' }, after: { totalAmount: '2000000.00' } },
    });
  });
});

describe('CA-11 aislamiento entre organizaciones', () => {
  it('un admin de B no ve ni modifica prestadores ni contratos de A', async () => {
    const provider = await createProvider();
    const contract = await createContract(provider.id);
    const b = as(t, s.orgB.admin.token);

    const listB = (await b.get('/service-providers').expect(200)).body as ServiceProvider[];
    expect(listB.map((p) => p.id)).not.toContain(provider.id);

    await b.get(`/service-providers/${provider.id}`).expect(404);
    await b.patch(`/service-providers/${provider.id}`, { name: 'X' }).expect(404);
    await b.delete(`/service-providers/${provider.id}`).expect(404);
    await b.get(`/service-providers/${provider.id}/contracts`).expect(404);
    await b.post(`/service-providers/${provider.id}/contracts`, contractInput()).expect(404);
    await b.patch(`/contracts/${contract.id}`, { totalAmount: '1.00' }).expect(404);
    await b.delete(`/contracts/${contract.id}`).expect(404);

    const intact = (await api().get(`/service-providers/${provider.id}`).expect(200))
      .body as ServiceProvider;
    expect(intact.activeContract?.totalAmount).toBe('4500000.00');
  });
});
