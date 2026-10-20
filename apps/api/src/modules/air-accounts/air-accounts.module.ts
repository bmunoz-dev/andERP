import {
  type AirAccount,
  type AirOperator,
  type AirOperatorBalance,
  airActiveFilterSchema,
  ErrorCode,
  saveAirAccountSchema,
  saveAirOperatorSchema,
  updateAirAccountSchema,
  updateAirOperatorSchema,
} from '@anderp/shared';
import {
  Body,
  Controller,
  Get,
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
import { AirAccountsService } from './air-accounts.service';
import { AirOperatorsService } from './air-operators.service';

// Los `code` de los triggers (cupo, inmutables) llegan como P0001 y el mapper ya los traduce.
registerConstraintCodes({
  air_operators_name_uq: ErrorCode.DUPLICATE_NAME,
  air_accounts_name_uq: ErrorCode.DUPLICATE_NAME,
  air_account_movements_ticket_ck: ErrorCode.AIR_MOVEMENT_TICKET_FIELDS_MISMATCH,
  air_account_movements_amount_ck: ErrorCode.AIR_MOVEMENT_AMOUNT_INVALID,
  air_account_movements_fare_ck: ErrorCode.AIR_MOVEMENT_AMOUNT_INVALID,
  air_account_movements_ticket_number_uq: ErrorCode.AIR_TICKET_NUMBER_TAKEN,
  air_account_movements_opening_uq: ErrorCode.AIR_OPENING_BALANCE_EXISTS,
});

class ActiveFilterDto extends createZodDto(airActiveFilterSchema) {}
class SaveAirOperatorDto extends createZodDto(saveAirOperatorSchema) {}
class UpdateAirOperatorDto extends createZodDto(updateAirOperatorSchema) {}
class SaveAirAccountDto extends createZodDto(saveAirAccountSchema) {}
class UpdateAirAccountDto extends createZodDto(updateAirAccountSchema) {}

/** F18: catálogo de operadores aéreos. */
@ApiTags('air-accounts')
@Controller('air-operators')
export class AirOperatorsController {
  constructor(private readonly operators: AirOperatorsService) {}

  @Get()
  list(@Query() { active }: ActiveFilterDto): Promise<AirOperator[]> {
    return this.operators.list(active);
  }

  @Post()
  create(@Body() body: SaveAirOperatorDto): Promise<AirOperator> {
    return this.operators.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAirOperatorDto,
  ): Promise<AirOperator> {
    return this.operators.update(id, body);
  }
}

/** F18: cuentas con los operadores, su saldo y el consolidado por operador. */
@ApiTags('air-accounts')
@Controller('air-accounts')
export class AirAccountsController {
  constructor(private readonly accounts: AirAccountsService) {}

  @Get()
  list(@Query() { active }: ActiveFilterDto): Promise<AirAccount[]> {
    return this.accounts.list(active);
  }

  // Antes de `:id`, para que "by-operator" no se lea como un id.
  @Get('by-operator')
  byOperator(): Promise<AirOperatorBalance[]> {
    return this.accounts.byOperator();
  }

  @Post()
  create(@Body() body: SaveAirAccountDto): Promise<AirAccount> {
    return this.accounts.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AirAccount> {
    return this.accounts.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAirAccountDto,
  ): Promise<AirAccount> {
    return this.accounts.update(id, body);
  }
}

@Module({
  controllers: [AirOperatorsController, AirAccountsController],
  providers: [AirOperatorsService, AirAccountsService],
})
export class AirAccountsModule {}
