import { Injectable } from '@nestjs/common';
import { dictionary } from '@zxcvbn-ts/language-common';
import type { CommonPasswords } from '../application/ports';

/**
 * Contraseñas filtradas más comunes (~49 000, licencia MIT, de @zxcvbn-ts/language-common).
 * Se cargan una vez al arrancar y se comparan en minúsculas.
 */
@Injectable()
export class ZxcvbnCommonPasswords implements CommonPasswords {
  readonly list: ReadonlySet<string> = new Set(
    dictionary['passwords-common'].map((password) => password.toLowerCase()),
  );
}
