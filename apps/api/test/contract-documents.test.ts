import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { type Contract, type ServiceProvider } from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs, contractDocuments, documentTypes } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;
let documentTypeId: string;
let contract: Contract;
let s3: S3Client;

const BUCKET = 'contract-documents';
const PDF = Buffer.from('%PDF-1.7\nContrato de prueba\n');
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const DOC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

const api = () => as(t, s.orgA.admin.token);

function upload(contractId: string, body: Buffer, fileName: string, token = s.orgA.admin.token) {
  return as(t, token).post(`/contracts/${contractId}/document`).attach('file', body, fileName);
}

async function newContract(endDate = '2026-12-31'): Promise<Contract> {
  const provider = (
    await api()
      .post('/service-providers', {
        name: `Persona ${String(Math.random()).slice(2, 8)}`,
        documentTypeId,
        documentNumber: String(Math.floor(Math.random() * 1e9)),
      })
      .expect(201)
  ).body as ServiceProvider;
  return (
    await api()
      .post(`/service-providers/${provider.id}/contracts`, {
        startDate: '2026-01-01',
        endDate,
        workAgreement: 'Asesoría',
        paymentFrequency: 'monthly',
        monthlyAmount: '1000000.00',
      })
      .expect(201)
  ).body as Contract;
}

const objectsOf = async (contractId: string) =>
  (
    await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: `org/${s.orgA.id}/contracts/${contractId}/`,
      }),
    )
  ).Contents ?? [];

const rowsOf = (contractId: string) =>
  db.select().from(contractDocuments).where(eq(contractDocuments.contractId, contractId));

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  documentTypeId = cc!.id;
  s3 = new S3Client({
    endpoint: inject('s3Endpoint'),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: inject('s3AccessKeyId'),
      secretAccessKey: inject('s3SecretAccessKey'),
    },
  });
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
  contract = await newContract();
});

afterAll(async () => {
  s3.destroy();
  await t.close();
});

describe('Subir', () => {
  it('CA-2 y CA-3 sube un PDF a la ruta de su organización y contrato', async () => {
    const res = await upload(contract.id, PDF, 'contrato.pdf').expect(201);
    expect(res.body).toMatchObject({
      fileName: 'contrato.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    expect(typeof res.body.uploadedAt).toBe('string');

    const [row] = await rowsOf(contract.id);
    expect(row?.storageKey).toMatch(
      new RegExp(`^org/${s.orgA.id}/contracts/${contract.id}/[0-9a-f-]{36}$`),
    );
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: row!.storageKey }));
    expect(head.ContentType).toBe('application/pdf');
    expect(head.ContentLength).toBe(PDF.length);
  });

  it('CA-4 acepta .docx y .doc', async () => {
    await upload(contract.id, DOCX, 'contrato.docx').expect(201);
    const other = await newContract();
    expect((await upload(other.id, DOC, 'CONTRATO.DOC').expect(201)).body.contentType).toBe(
      'application/msword',
    );
  });

  it('CA-4 y CA-5 tipo no permitido, archivo vacío, sin campo o de más de 10 MB → 422, sin tocar el bucket', async () => {
    expect(
      (await upload(contract.id, Buffer.from('MZ'), 'virus.pdf').expect(422)).body,
    ).toMatchObject({
      code: 'DOCUMENT_TYPE_NOT_ALLOWED',
    });
    expect((await upload(contract.id, PDF, 'contrato.docx').expect(422)).body.code).toBe(
      'DOCUMENT_TYPE_NOT_ALLOWED',
    );
    expect((await upload(contract.id, Buffer.alloc(0), 'vacio.pdf').expect(422)).body.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      (await api().post(`/contracts/${contract.id}/document`).field('x', 'y').expect(422)).body
        .code,
    ).toBe('VALIDATION_ERROR');
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    expect((await upload(contract.id, big, 'grande.pdf').expect(422)).body.code).toBe(
      'DOCUMENT_TOO_LARGE',
    );
    expect(await objectsOf(contract.id)).toHaveLength(0);
    expect(await rowsOf(contract.id)).toHaveLength(0);
  });

  it('CA-4b el nombre conserva sus tildes y pierde la ruta', async () => {
    expect(
      (await upload(contract.id, PDF, 'Contratación firmada.pdf').expect(201)).body.fileName,
    ).toBe('Contratación firmada.pdf');
  });

  it('CA-6 reemplazar deja una sola fila vigente y conserva el objeto anterior', async () => {
    await upload(contract.id, PDF, 'v1.pdf').expect(201);
    await upload(contract.id, DOCX, 'v2.docx').expect(201);

    const rows = await rowsOf(contract.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.deletedAt === null).map((r) => r.fileName)).toEqual(['v2.docx']);
    expect(await objectsOf(contract.id)).toHaveLength(2);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityType, 'contract_document'), eq(auditLogs.organizationId, s.orgA.id)),
      );
    expect(audit.map((a) => a.action).sort()).toEqual([
      'contract_document.replace',
      'contract_document.upload',
    ]);
    expect(audit.find((a) => a.action === 'contract_document.replace')?.changes).toMatchObject({
      before: { fileName: 'v1.pdf', sizeBytes: PDF.length },
      after: { fileName: 'v2.docx', sizeBytes: DOCX.length },
    });
  });

  it('CA-6b contrato borrado → 404; persona inactiva con contrato terminado → se acepta', async () => {
    await api().delete(`/contracts/${contract.id}`).expect(204);
    await upload(contract.id, PDF, 'c.pdf').expect(404);

    const ended = await newContract('2026-01-31');
    await api()
      .patch(`/service-providers/${ended.serviceProviderId}`, { isActive: false })
      .expect(200);
    await upload(ended.id, PDF, 'c.pdf').expect(201);
  });

  it('CA-6c la subida 21 de la hora del mismo usuario → 429', async () => {
    await db.insert(contractDocuments).values(
      Array.from({ length: 20 }, (_, i) => ({
        organizationId: s.orgA.id,
        contractId: contract.id,
        storageKey: `test/${randomUUID()}`,
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
        createdBy: s.orgA.admin.id,
        // Solo una vigente por contrato: las anteriores ya fueron reemplazadas.
        deletedAt: i < 19 ? new Date() : null,
      })),
    );
    expect((await upload(contract.id, PDF, 'c.pdf').expect(429)).body.code).toBe(
      'TOO_MANY_REQUESTS',
    );
  });

  it('CA-14 otra organización no puede subir al contrato', async () => {
    await upload(contract.id, PDF, 'c.pdf', s.orgB.admin.token).expect(404);
    expect(await objectsOf(contract.id)).toHaveLength(0);
  });
});

describe('Ver y eliminar', () => {
  const documentOf = async (c: Contract) =>
    (
      (await api().get(`/service-providers/${c.serviceProviderId}/contracts`).expect(200))
        .body as Contract[]
    )[0]?.document;

  it('CA-8 el contrato trae su documento vigente, también como contrato vigente de la persona', async () => {
    expect(await documentOf(contract)).toBeNull();
    await upload(contract.id, PDF, 'contrato.pdf').expect(201);
    const document = await documentOf(contract);
    expect(document).toMatchObject({
      fileName: 'contrato.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    expect(Number.isNaN(Date.parse(document?.uploadedAt ?? ''))).toBe(false);
    const provider = (
      await api().get(`/service-providers/${contract.serviceProviderId}`).expect(200)
    ).body as ServiceProvider;
    expect(provider.activeContract?.document?.fileName).toBe('contrato.pdf');
  });

  it('CA-9 y CA-10 la URL firmada abre el PDF en línea y descarga el Word con su nombre', async () => {
    await upload(contract.id, PDF, 'Contratación.pdf').expect(201);
    const signed = (await api().get(`/contracts/${contract.id}/document/url`).expect(200)).body as {
      url: string;
      expiresAt: string;
    };
    const expiresIn = Date.parse(signed.expiresAt) - Date.now();
    expect(expiresIn).toBeGreaterThan(4 * 60 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(5 * 60 * 1000);
    const file = await fetch(signed.url);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(file.headers.get('content-disposition')).toBe(
      'inline; filename="Contratacion.pdf"; filename*=UTF-8\'\'Contrataci%C3%B3n.pdf',
    );
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PDF);

    await upload(contract.id, DOCX, 'contrato.docx').expect(201);
    const word = await fetch(
      (
        (await api().get(`/contracts/${contract.id}/document/url`).expect(200)).body as {
          url: string;
        }
      ).url,
    );
    expect(word.headers.get('content-disposition')).toMatch(/^attachment; /);
  });

  it('CA-9 y CA-11 sin documento → 404; eliminar conserva el objeto y queda auditado', async () => {
    await api().get(`/contracts/${contract.id}/document/url`).expect(404);
    await api().delete(`/contracts/${contract.id}/document`).expect(404);

    await upload(contract.id, PDF, 'contrato.pdf').expect(201);
    await api().delete(`/contracts/${contract.id}/document`).expect(204);
    expect(await documentOf(contract)).toBeNull();
    await api().get(`/contracts/${contract.id}/document/url`).expect(404);
    expect(await objectsOf(contract.id)).toHaveLength(1);

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'contract_document.delete'));
    expect(audit?.changes).toMatchObject({ before: { fileName: 'contrato.pdf' } });
  });

  it('CA-13 un contrato con documento se puede borrar', async () => {
    await upload(contract.id, PDF, 'contrato.pdf').expect(201);
    await api().delete(`/contracts/${contract.id}`).expect(204);
    await api().get(`/contracts/${contract.id}/document/url`).expect(404);
  });

  it('CA-14 otra organización no ve ni elimina el documento', async () => {
    await upload(contract.id, PDF, 'contrato.pdf').expect(201);
    const other = () => as(t, s.orgB.admin.token);
    await other().get(`/contracts/${contract.id}/document/url`).expect(404);
    await other().delete(`/contracts/${contract.id}/document`).expect(404);
    expect(await documentOf(contract)).not.toBeNull();
  });
});

it('los endpoints del documento aparecen en OpenAPI', async () => {
  const { paths } = (await t.http.get('/api/docs-json').expect(200)).body as {
    paths: Record<string, unknown>;
  };
  expect(Object.keys(paths)).toEqual(
    expect.arrayContaining([
      '/api/v1/contracts/{id}/document',
      '/api/v1/contracts/{id}/document/url',
    ]),
  );
});
