import { Module } from '@nestjs/common';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { AuthModule } from '../auth/auth.module';
import {
  CatalogsController,
  ExpenseCategoriesController,
  PlatformCatalogsController,
} from './catalogs.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { GlobalCatalogsService } from './global-catalogs.service';

registerConstraintCodes({
  banks_name_uq: 'DUPLICATE_NAME',
  account_types_name_uq: 'DUPLICATE_NAME',
  document_types_code_uq: 'DUPLICATE_NAME',
  expense_categories_name_uq: 'DUPLICATE_NAME',
});

@Module({
  imports: [AuthModule],
  controllers: [CatalogsController, PlatformCatalogsController, ExpenseCategoriesController],
  providers: [GlobalCatalogsService, ExpenseCategoriesService],
  exports: [GlobalCatalogsService],
})
export class CatalogsModule {}
