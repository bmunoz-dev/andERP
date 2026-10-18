import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ObjectStorage } from '../src/modules/contract-documents/object-storage';
import { createTestApp } from './setup/create-test-app';

/** F17: el adaptador sube a un MinIO real y firma URLs que el navegador puede abrir. */
describe('ObjectStorage', () => {
  it('sube con sus cabeceras y la URL firmada devuelve los mismos bytes', async () => {
    const t = await createTestApp();
    try {
      const storage = t.app.get(ObjectStorage);
      const key = `test/${randomUUID()}`;
      const body = Buffer.from('%PDF-1.7 contenido');
      await storage.put(key, body, {
        contentType: 'application/pdf',
        contentDisposition: "inline; filename*=UTF-8''Contrataci%C3%B3n.pdf",
      });

      const res = await fetch(await storage.signedUrl(key, 60));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toBe(
        "inline; filename*=UTF-8''Contrataci%C3%B3n.pdf",
      );
      expect(Buffer.from(await res.arrayBuffer())).toEqual(body);
    } finally {
      await t.close();
    }
  });
});
