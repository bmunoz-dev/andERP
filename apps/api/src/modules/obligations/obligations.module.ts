import {
  createObligationSchema,
  ErrorCode,
  type Obligation,
  type ObligationDetail,
  obligationStatusSchema,
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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { ObligationsService } from './obligations.service';

registerConstraintCodes({
  payment_obligations_name_uq: ErrorCode.DUPLICATE_OBLIGATION,
  obligation_due_dates_pending_uq: ErrorCode.OBLIGATION_ALREADY_PENDING,
});

class CreateObligationDto extends createZodDto(createObligationSchema) {}
class UpdateObligationDto extends createZodDto(updateObligationSchema) {}
class AgendaQueryDto extends createZodDto(
  z.object({ status: obligationStatusSchema.optional() }),
) {}

/** F13: agenda de pagos a entidades. */
@ApiTags('obligations')
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
}

@Module({
  controllers: [ObligationsController],
  providers: [ObligationsService],
})
export class ObligationsModule {}
