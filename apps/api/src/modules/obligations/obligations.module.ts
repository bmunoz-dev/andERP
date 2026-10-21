import {
  completeDueDateSchema,
  createObligationSchema,
  ErrorCode,
  type Obligation,
  type ObligationDetail,
  obligationStatusSchema,
  pendingDueDateSchema,
  updateObligationSchema,
} from '@anderp/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { RequiresModule } from '../auth/http/guards';
import { ObligationsService } from './obligations.service';

registerConstraintCodes({
  payment_obligations_name_uq: ErrorCode.DUPLICATE_OBLIGATION,
  obligation_due_dates_pending_uq: ErrorCode.OBLIGATION_ALREADY_PENDING,
  obligation_due_dates_date_uq: ErrorCode.DUE_DATE_ALREADY_EXISTS,
});

class CreateObligationDto extends createZodDto(createObligationSchema) {}
class UpdateObligationDto extends createZodDto(updateObligationSchema) {}
class CompleteDueDateDto extends createZodDto(completeDueDateSchema) {}
class PendingDueDateDto extends createZodDto(pendingDueDateSchema) {}
class AgendaQueryDto extends createZodDto(
  z.object({ status: obligationStatusSchema.optional() }),
) {}

/** F13: agenda de pagos a entidades. */
@ApiTags('obligations')
@RequiresModule('agenda')
@Controller('obligations')
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get()
  list(@Query() query: AgendaQueryDto): Promise<Obligation[]> {
    return this.obligations.list(query.status);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ObligationDetail> {
    return this.obligations.get(id);
  }

  @Post()
  create(@Body() body: CreateObligationDto): Promise<ObligationDetail> {
    return this.obligations.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateObligationDto,
  ): Promise<ObligationDetail> {
    return this.obligations.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.obligations.remove(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteDueDateDto,
  ): Promise<ObligationDetail> {
    return this.obligations.complete(id, body);
  }

  @Put(':id/pending')
  setPending(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PendingDueDateDto,
  ): Promise<ObligationDetail> {
    return this.obligations.setPending(id, body);
  }

  @Delete(':id/pending')
  @HttpCode(204)
  removePending(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.obligations.removePending(id);
  }
}

@Module({
  controllers: [ObligationsController],
  providers: [ObligationsService],
  exports: [ObligationsService],
})
export class ObligationsModule {}
