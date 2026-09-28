import {
  type AuthProfile,
  type AuthSessionResponse,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
} from '@anderp/shared';
import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../../shared/auth/public.decorator';
import type { RequestContext } from '../../../shared/context/request-context';
import { LoginUseCase } from '../application/login.use-case';
import {
  ChangePasswordUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from '../application/password.use-cases';
import type { IssuedSession, RequestMeta } from '../application/ports';
import {
  GetCurrentUserUseCase,
  LogoutUseCase,
  RefreshSessionUseCase,
} from '../application/session.use-cases';
import { requireActor } from './guards';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

class LoginDto extends createZodDto(loginRequestSchema) {}
class ChangePasswordDto extends createZodDto(changePasswordRequestSchema) {}
class ForgotPasswordDto extends createZodDto(forgotPasswordRequestSchema) {}
class ResetPasswordDto extends createZodDto(resetPasswordRequestSchema) {}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly currentUserUseCase: GetCurrentUserUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly requestResetUseCase: RequestPasswordResetUseCase,
    private readonly resetUseCase: ResetPasswordUseCase,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    return this.respond(res, await this.loginUseCase.execute(body, this.meta()));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    try {
      return this.respond(
        res,
        await this.refreshUseCase.execute(readRefreshCookie(req), this.meta()),
      );
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logoutUseCase.execute(readRefreshCookie(req));
    clearRefreshCookie(res);
  }

  @Get('me')
  me(): Promise<AuthProfile> {
    return this.currentUserUseCase.execute(requireActor(this.cls).userId);
  }

  @Post('password/change')
  @HttpCode(204)
  changePassword(@Body() body: ChangePasswordDto): Promise<void> {
    return this.changePasswordUseCase.execute(requireActor(this.cls), body);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('password/forgot')
  @HttpCode(202)
  forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    return this.requestResetUseCase.execute(body.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    return this.resetUseCase.execute(body);
  }

  private meta(): RequestMeta {
    return { ip: this.cls.get('ip'), userAgent: this.cls.get('userAgent') };
  }

  /** El refresh token solo viaja en la cookie; el cuerpo lleva el access token y el perfil. */
  private respond(res: Response, session: IssuedSession): AuthSessionResponse {
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    return { accessToken: session.accessToken, user: session.user };
  }
}
