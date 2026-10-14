import {
  type ClickiuMovement,
  type ClickiuSummary,
  clickiuFiltersSchema,
  ErrorCode,
  saveClickiuMovementSchema,
  updateClickiuMovementSchema,
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
import { ClickiuService } from './clickiu.service';

// CA-2: la combinación tipo/estado la valida solo el CHECK.
registerConstraintCodes({ clickiu_movements_status_ck: ErrorCode.CLICKIU_SALE_STATUS_REQUIRED });

class SaveClickiuMovementDto extends createZodDto(saveClickiuMovementSchema) {}
class UpdateClickiuMovementDto extends createZodDto(updateClickiuMovementSchema) {}
class ClickiuFiltersDto extends createZodDto(clickiuFiltersSchema) {}

/** F11: recargas y ventas del saldo de Clic Kiu. */
@ApiTags('clickiu')
@Controller('clickiu')
export class ClickiuController {
  constructor(private readonly clickiu: ClickiuService) {}

  @Get('movements')
  list(@Query() filters: ClickiuFiltersDto): Promise<ClickiuMovement[]> {
    return this.clickiu.list(filters);
  }

  @Get('summary')
  summary(@Query() filters: ClickiuFiltersDto): Promise<ClickiuSummary> {
    return this.clickiu.summary(filters);
  }

  @Post('movements')
  create(@Body() body: SaveClickiuMovementDto): Promise<ClickiuMovement> {
    return this.clickiu.create(body);
  }

  @Get('movements/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ClickiuMovement> {
    return this.clickiu.get(id);
  }

  @Patch('movements/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClickiuMovementDto,
  ): Promise<ClickiuMovement> {
    return this.clickiu.update(id, body);
  }

  @Delete('movements/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.clickiu.remove(id);
  }
}

@Module({
  controllers: [ClickiuController],
  providers: [ClickiuService],
})
export class ClickiuModule {}
