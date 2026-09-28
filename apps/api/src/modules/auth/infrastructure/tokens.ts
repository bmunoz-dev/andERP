import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type {
  AccessTokenClaims,
  AccessTokenIssuer,
  Clock,
  OpaqueTokens,
} from '../application/ports';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh y recuperación: 32 bytes aleatorios; en la base de datos solo su SHA-256. */
@Injectable()
export class CryptoOpaqueTokens implements OpaqueTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  issue(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync({ ...claims });
  }
}

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
