import { ErrorCode } from '@anderp/shared';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DomainError } from '../../shared/errors/domain-error';

/** Contraseña cifrada tal como se guarda en `entity_credentials` (design.md §5.8). */
export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

/** AAD de una credencial: ata el texto cifrado a su organización y a su registro. */
export const credentialAad = (organizationId: string, id: string) => `${organizationId}:${id}`;

/**
 * AES-256-GCM con IV aleatorio de 12 bytes (F06 CA-3). El AAD `"{organizationId}:{id}"` ata el
 * texto cifrado a su registro: copiado a otro, no se descifra (CA-8). Cifra con la llave activa
 * y descifra con la versión con la que se cifró cada registro (CA-11, CA-12).
 */
export class CredentialCipher {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    readonly activeVersion: number,
  ) {}

  encrypt(plaintext: string, aad: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(this.activeVersion), iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: this.activeVersion };
  }

  decrypt(secret: EncryptedSecret, aad: string): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key(secret.keyVersion), secret.iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(secret.authTag);
    try {
      return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new DomainError(ErrorCode.CREDENTIAL_DECRYPT_FAILED, 500);
    }
  }

  private key(version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) throw new DomainError(ErrorCode.CREDENTIAL_KEY_UNAVAILABLE, 500);
    return key;
  }
}
