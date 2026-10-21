import {
  type FixedPayment,
  saveFixedPaymentSchema,
  updateFixedPaymentSchema,
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
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { RequiresModule } from '../auth/http/guards';
import { FixedPaymentsService } from './fixed-payments.service';

registerConstraintCodes({ fixed_payments_amount_ck: 'VALIDATION_ERROR' });

class SaveFixedPaymentDto extends createZodDto(saveFixedPaymentSchema) {}
class UpdateFixedPaymentDto extends createZodDto(updateFixedPaymentSchema) {}

const intQuery = (value?: string) => (value && /^\d+$/.test(value) ? Number(value) : undefined);

/** F16: pagos de monto fijo por mes trabajado. */
@ApiTags('fixed-payments')
@RequiresModule('staff_payments')
@Controller('fixed-payments')
export class FixedPaymentsController {
  constructor(private readonly payments: FixedPaymentsService) {}

  @Get()
  list(
    @Query('periodYear') periodYear?: string,
    @Query('periodMonth') periodMonth?: string,
    @Query('serviceProviderId', new ParseUUIDPipe({ optional: true, errorHttpStatusCode: 422 }))
    serviceProviderId?: string,
  ): Promise<FixedPayment[]> {
    const filters = {
      periodYear: intQuery(periodYear),
      periodMonth: intQuery(periodMonth),
      serviceProviderId,
    };
    return this.payments.list(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
    );
  }

  @Post()
  create(@Body() body: SaveFixedPaymentDto): Promise<FixedPayment> {
    return this.payments.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<FixedPayment> {
    return this.payments.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFixedPaymentDto,
  ): Promise<FixedPayment> {
    return this.payments.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.payments.remove(id);
  }
}

@Module({ controllers: [FixedPaymentsController], providers: [FixedPaymentsService] })
export class FixedPaymentsModule {}
