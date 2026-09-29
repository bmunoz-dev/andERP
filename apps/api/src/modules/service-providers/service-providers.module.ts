import { Module } from '@nestjs/common';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { AuthModule } from '../auth/auth.module';
import { CatalogsModule } from '../catalogs/catalogs.module';
import { ContractsService } from './contracts.service';
import { ContractsController, ServiceProvidersController } from './service-providers.controller';
import { ServiceProvidersService } from './service-providers.service';

registerConstraintCodes({
  service_providers_document_uq: 'DUPLICATE_DOCUMENT',
  service_providers_bank_all_or_none: 'INCOMPLETE_BANK_ACCOUNT',
  provider_contracts_no_overlap: 'CONTRACT_OVERLAP',
  provider_contracts_date_range_ck: 'INVALID_DATE_RANGE',
});

@Module({
  imports: [AuthModule, CatalogsModule],
  controllers: [ServiceProvidersController, ContractsController],
  providers: [ServiceProvidersService, ContractsService],
  exports: [ServiceProvidersService, ContractsService],
})
export class ServiceProvidersModule {}
