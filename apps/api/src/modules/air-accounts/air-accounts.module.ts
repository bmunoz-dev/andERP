import {
  type AirAccount,
  type AirMovement,
  type AirMovementSummary,
  type CreateAirMovement,
  type AirOperator,
  type AirOperatorBalance,
  airActiveFilterSchema,
  airMovementFiltersSchema,
  createAirMovementSchema,
  ErrorCode,
  saveAirAccountSchema,
  saveAirOperatorSchema,
  updateAirAccountSchema,
  updateAirMovementSchema,
  updateAirOperatorSchema,
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
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { RequiresModule } from '../auth/http/guards';
import { AirAccountMovementsService } from './air-account-movements.service';
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
class UpdateAirMovementDto extends createZodDto(updateAirMovementSchema) {}
class AirMovementFiltersDto extends createZodDto(airMovementFiltersSchema) {}

/** F18: catálogo de operadores aéreos. */
@ApiTags('air-accounts')
@RequiresModule('air_accounts')
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
@RequiresModule('air_accounts')
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

/** F18: libro de una cuenta (saldo inicial, recargas, pagos, reembolsos y emisiones). */
@ApiTags('air-accounts')
@RequiresModule('air_accounts')
@Controller('air-accounts/:accountId/movements')
export class AirAccountMovementsController {
  constructor(private readonly movements: AirAccountMovementsService) {}

  @Get()
  list(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() filters: AirMovementFiltersDto,
  ): Promise<AirMovement[]> {
    return this.movements.list(accountId, filters);
  }

  // Antes de `:id`, para que "summary" no se lea como un id.
  @Get('summary')
  summary(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() filters: AirMovementFiltersDto,
  ): Promise<AirMovementSummary> {
    return this.movements.summary(accountId, filters);
  }

  @Post()
  create(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    // Un DTO de clase no admite una unión; se valida con el esquema directamente.
    @Body(new ZodValidationPipe(createAirMovementSchema)) body: CreateAirMovement,
  ): Promise<AirMovement> {
    return this.movements.create(accountId, body);
  }

  @Get(':id')
  get(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AirMovement> {
    return this.movements.get(accountId, id);
  }

  @Patch(':id')
  update(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAirMovementDto,
  ): Promise<AirMovement> {
    return this.movements.update(accountId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.movements.remove(accountId, id);
  }
}

@Module({
  controllers: [AirOperatorsController, AirAccountsController, AirAccountMovementsController],
  providers: [AirOperatorsService, AirAccountsService, AirAccountMovementsService],
})
export class AirAccountsModule {}
