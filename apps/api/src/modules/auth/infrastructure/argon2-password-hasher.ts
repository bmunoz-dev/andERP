import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../application/ports';

/**
 * argon2id con el mínimo recomendado por OWASP (design.md §6.1). El algoritmo por defecto de
 * @node-rs/argon2 es argon2id; los parámetros quedan dentro del hash en formato PHC.
 */
export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_PARAMS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false; // Hash corrupto o de otro formato: se trata como contraseña incorrecta.
    }
  }

  needsRehash(passwordHash: string): boolean {
    const match = PHC.exec(passwordHash);
    if (!match) return true;
    const [, m, t, p] = match.map(Number) as [number, number, number, number];
    return (
      m < ARGON2_PARAMS.memoryCost || t < ARGON2_PARAMS.timeCost || p < ARGON2_PARAMS.parallelism
    );
  }

  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('anderp-timing-equalizer');
    await this.verify(await this.dummyHash, password);
  }
}
