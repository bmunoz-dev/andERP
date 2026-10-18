import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

/**
 * F17: bucket de documentos por el protocolo S3 (Supabase Storage; s3mock en local y en pruebas).
 * Solo sube y firma: el diseño nunca borra objetos (design.md §6.5).
 */
@Injectable()
export class ObjectStorage implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      // Supabase exige rutas `/{bucket}/{key}`, no subdominios por bucket.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /**
   * La disposición va en la URL firmada: Supabase descarta el `Content-Disposition` de
   * `PutObject` y respeta `response-content-disposition` (comprobado en F17-T003).
   */
  signedUrl(key: string, ttlSeconds: number, contentDisposition: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
