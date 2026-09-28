import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ENV, type Env } from '../../config/env';
import { LoginUseCase } from './application/login.use-case';
import {
  ChangePasswordUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from './application/password.use-cases';
import {
  ACCESS_TOKEN_ISSUER,
  CLOCK,
  COMMON_PASSWORDS,
  OPAQUE_TOKENS,
  PASSWORD_HASHER,
  PASSWORD_RESET_REPOSITORY,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from './application/ports';
import { SessionIssuer } from './application/session-issuer';
import {
  GetCurrentUserUseCase,
  LogoutUseCase,
  RefreshSessionUseCase,
} from './application/session.use-cases';
import { AuthController } from './http/auth.controller';
import { JwtAuthGuard, SuperAdminGuard } from './http/guards';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { ZxcvbnCommonPasswords } from './infrastructure/common-passwords';
import {
  DrizzlePasswordResetRepository,
  DrizzleSessionRepository,
  DrizzleUserRepository,
} from './infrastructure/drizzle-auth.repositories';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  CryptoOpaqueTokens,
  JwtAccessTokenIssuer,
  SystemClock,
} from './infrastructure/tokens';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Solo se aplica en las rutas marcadas con ThrottlerGuard (login y olvidé contraseña).
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ throttlers: [{ ttl: 60_000, limit: env.AUTH_THROTTLE_LIMIT }] }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: PASSWORD_RESET_REPOSITORY, useClass: DrizzlePasswordResetRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_ISSUER, useClass: JwtAccessTokenIssuer },
    { provide: OPAQUE_TOKENS, useClass: CryptoOpaqueTokens },
    { provide: CLOCK, useClass: SystemClock },
    { provide: COMMON_PASSWORDS, useClass: ZxcvbnCommonPasswords },
    SessionIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    ChangePasswordUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    SuperAdminGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    SuperAdminGuard,
    PASSWORD_HASHER,
    USER_REPOSITORY,
    PASSWORD_RESET_REPOSITORY,
    SESSION_REPOSITORY,
    OPAQUE_TOKENS,
    CLOCK,
  ],
})
export class AuthModule {}
