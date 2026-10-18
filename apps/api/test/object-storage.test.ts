import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ObjectStorage } from '../src/modules/contract-documents/object-storage';
import { createTestApp } from './setup/create-test-app';

/** F17: el adaptador sube a un MinIO real y firma URLs que el navegador puede abrir. */
describe('ObjectStorage', () => {
  it('sube con su tipo y la URL firmada devuelve los bytes con la disposición pedida', async () => {
    const t = await createTestApp();
    try {
      const storage = t.app.get(ObjectStorage);
      const key = `test/${randomUUID()}`;
      const body = Buffer.from('%PDF-1.7 contenido');
      await storage.put(key, body, 'application/pdf');

      // Supabase descarta el Content-Disposition de PutObject: se pide al firmar (F17-T003).
      const res = await fetch(
        await storage.signedUrl(key, 60, "inline; filename*=UTF-8''Contrataci%C3%B3n.pdf"),
      );
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
