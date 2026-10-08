import {
  ErrorCode,
  type Expense,
  type LedgerEntry,
  type MonthlyMatrix,
  saveExpenseSchema,
  updateExpenseSchema,
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
import { DomainError } from '../../shared/errors/domain-error';
import { ExpensesService } from './expenses.service';
import { ReportsService } from './reports.service';

class SaveExpenseDto extends createZodDto(saveExpenseSchema) {}
class UpdateExpenseDto extends createZodDto(updateExpenseSchema) {}

/** `year` (2000–2100) y `month` (1–12) obligatorios en los reportes. */
function period(year?: string, month?: string): { year: number; month: number } {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new DomainError(ErrorCode.VALIDATION_ERROR, 422, 'year and month are required');
  }
  return { year: y, month: m };
}

/** F05 CA-1 a CA-6: egresos manuales. */
@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  create(@Body() body: SaveExpenseDto): Promise<Expense> {
    return this.expenses.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Expense> {
    return this.expenses.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateExpenseDto): Promise<Expense> {
    return this.expenses.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.expenses.remove(id);
  }
}

/** F05 CA-11 y CA-12: matriz mensual y libro de egresos. */
@ApiTags('reports')
@Controller('reports/expenses')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('monthly')
  monthly(@Query('year') year?: string, @Query('month') month?: string): Promise<MonthlyMatrix> {
    const p = period(year, month);
    return this.reports.monthly(p.year, p.month);
  }

  @Get('ledger')
  ledger(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('categoryId') categoryId?: string,
    @Query('week') week?: string,
  ): Promise<LedgerEntry[]> {
    const p = period(year, month);
    return this.reports.ledger(p.year, p.month, {
      ...(categoryId ? { categoryId } : {}),
      ...(week && /^[1-4]$/.test(week) ? { week: Number(week) } : {}),
    });
  }
}

@Module({
  controllers: [ExpensesController, ReportsController],
  providers: [ExpensesService, ReportsService],
})
export class ExpensesModule {}
