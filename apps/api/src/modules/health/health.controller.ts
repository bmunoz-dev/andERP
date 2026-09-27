import { ErrorCode } from '@anderp/shared';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SQL, type Sql } from '../../db/database.module';
import { Public } from '../../shared/auth/public.decorator';
import { DomainError } from '../../shared/errors/domain-error';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(SQL) private readonly sql: Sql) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; db: 'ok' }> {
    try {
      await this.sql`select 1`;
    } catch {
      throw new DomainError(ErrorCode.SERVICE_UNAVAILABLE, 503, 'Database unavailable');
    }
    return { status: 'ok', db: 'ok' };
  }
}
