import {
  CATALOG_KINDS,
  type CatalogItem,
  type CatalogKind,
  createExpenseCategorySchema,
  ErrorCode,
  type ExpenseCategory,
  reorderExpenseCategoriesSchema,
  updateExpenseCategorySchema,
} from '@anderp/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { DomainError } from '../../shared/errors/domain-error';
import { SuperAdminOnly } from '../auth/http/guards';
import { ExpenseCategoriesService } from './expense-categories.service';
import { GlobalCatalogsService } from './global-catalogs.service';

class CreateExpenseCategoryDto extends createZodDto(createExpenseCategorySchema) {}
class UpdateExpenseCategoryDto extends createZodDto(updateExpenseCategorySchema) {}
class ReorderExpenseCategoriesDto extends createZodDto(reorderExpenseCategoriesSchema) {}

function catalogKind(kind: string): CatalogKind {
  if (!(CATALOG_KINDS as readonly string[]).includes(kind)) {
    throw new DomainError(ErrorCode.NOT_FOUND, 404);
  }
  return kind as CatalogKind;
}

/** F02 CA-4: lectura de catálogos globales para cualquier usuario autenticado. */
@ApiTags('catalogs')
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: GlobalCatalogsService) {}

  @Get(':kind')
  list(
    @Param('kind') kind: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<CatalogItem[]> {
    return this.catalogs.list(catalogKind(kind), includeInactive === 'true');
  }
}

/** F02 CA-5: gestión de catálogos globales, solo super admin. */
@ApiTags('platform')
@SuperAdminOnly()
@Controller('platform/catalogs')
export class PlatformCatalogsController {
  constructor(private readonly catalogs: GlobalCatalogsService) {}

  @Post(':kind')
  create(@Param('kind') kind: string, @Body() body: unknown): Promise<CatalogItem> {
    return this.catalogs.create(catalogKind(kind), body);
  }

  @Patch(':kind/:id')
  update(
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CatalogItem> {
    return this.catalogs.update(catalogKind(kind), id, body);
  }
}

/** F02 CA-7 a CA-10: categorías de egreso de la organización. */
@ApiTags('expense-categories')
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Get()
  list(): Promise<ExpenseCategory[]> {
    return this.categories.list();
  }

  @Post()
  create(@Body() body: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    return this.categories.create(body);
  }

  // Va antes de ':id' para que "order" no se interprete como un id.
  @Put('order')
  reorder(@Body() body: ReorderExpenseCategoriesDto): Promise<ExpenseCategory[]> {
    return this.categories.reorder(body.ids);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    return this.categories.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
