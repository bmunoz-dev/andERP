import { type FeePayment, saveFeePaymentSchema } from '@anderp/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { FeePaymentsService } from './fee-payments.service';

registerConstraintCodes({
  fee_payments_period_uq: 'FEE_PAYMENT_ALREADY_EXISTS',
  fee_payment_days_date_uq: 'DUPLICATE_WORK_DATE',
});

class SaveFeePaymentDto extends createZodDto(saveFeePaymentSchema) {}

const intQuery = (value?: string) => (value && /^\d+$/.test(value) ? Number(value) : undefined);

/** F04: pagos semanales de honorarios. */
@ApiTags('fee-payments')
@Controller('fee-payments')
export class FeePaymentsController {
  constructor(private readonly payments: FeePaymentsService) {}

  @Get()
  list(
    @Query('periodYear') periodYear?: string,
    @Query('periodMonth') periodMonth?: string,
    @Query('weekOfMonth') weekOfMonth?: string,
    @Query('serviceProviderId') serviceProviderId?: string,
  ): Promise<FeePayment[]> {
    const filters = {
      periodYear: intQuery(periodYear),
      periodMonth: intQuery(periodMonth),
      weekOfMonth: intQuery(weekOfMonth),
      serviceProviderId,
    };
    return this.payments.list(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
    );
  }

  @Post()
  create(@Body() body: SaveFeePaymentDto): Promise<FeePayment> {
    return this.payments.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<FeePayment> {
    return this.payments.get(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveFeePaymentDto,
  ): Promise<FeePayment> {
    return this.payments.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.payments.remove(id);
  }
}

@Module({ controllers: [FeePaymentsController], providers: [FeePaymentsService] })
export class FeePaymentsModule {}
