import { describe, expect, it } from 'vitest';
import { CredentialCipher } from './credential-cipher';

const key1 = Buffer.alloc(32, 1);
const key2 = Buffer.alloc(32, 2);
const cipher = new CredentialCipher(new Map([[1, key1]]), 1);

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe('CredentialCipher (F06 CA-3, CA-8, CA-12)', () => {
  it('cifrar → descifrar devuelve el texto original', () => {
    const secret = cipher.encrypt('clave ñ 🔑', 'org:id');
    expect(secret.keyVersion).toBe(1);
    expect(secret.iv).toHaveLength(12);
    expect(secret.authTag).toHaveLength(16);
    expect(secret.ciphertext.toString('utf8')).not.toContain('clave');
    expect(cipher.decrypt(secret, 'org:id')).toBe('clave ñ 🔑');
  });

  it('el IV cambia en cada cifrado', () => {
    const a = cipher.encrypt('igual', 'org:id');
    const b = cipher.encrypt('igual', 'org:id');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('un AAD distinto falla (texto cifrado copiado a otro registro)', () => {
    const secret = cipher.encrypt('clave', 'org:uno');
    expect(code(() => cipher.decrypt(secret, 'org:otro'))).toBe('CREDENTIAL_DECRYPT_FAILED');
  });

  it('un authTag alterado falla', () => {
    const secret = cipher.encrypt('clave', 'org:id');
    const authTag = Buffer.from(secret.authTag);
    authTag[0] = (authTag[0] ?? 0) ^ 1;
    expect(code(() => cipher.decrypt({ ...secret, authTag }, 'org:id'))).toBe(
      'CREDENTIAL_DECRYPT_FAILED',
    );
  });

  it('una versión de llave que ya no está configurada falla', () => {
    const old = new CredentialCipher(new Map([[2, key2]]), 2).encrypt('clave', 'org:id');
    expect(code(() => cipher.decrypt(old, 'org:id'))).toBe('CREDENTIAL_KEY_UNAVAILABLE');
  });

  it('cifra siempre con la llave activa y descifra con la del registro', () => {
    const rotated = new CredentialCipher(
      new Map([
        [1, key1],
        [2, key2],
      ]),
      2,
    );
    const old = cipher.encrypt('clave', 'org:id');
    expect(rotated.decrypt(old, 'org:id')).toBe('clave');
    expect(rotated.encrypt('clave', 'org:id').keyVersion).toBe(2);
  });
});
