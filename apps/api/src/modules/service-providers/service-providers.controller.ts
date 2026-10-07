import {
  type Contract,
  type ContractOption,
  ErrorCode,
  isIsoDate,
  createContractSchema,
  createServiceProviderSchema,
  type ServiceProvider,
  updateContractSchema,
  updateServiceProviderSchema,
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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { DomainError } from '../../shared/errors/domain-error';
import { ContractsService } from './contracts.service';
import { ServiceProvidersService } from './service-providers.service';

class CreateServiceProviderDto extends createZodDto(createServiceProviderSchema) {}
class UpdateServiceProviderDto extends createZodDto(updateServiceProviderSchema) {}
class CreateContractDto extends createZodDto(createContractSchema) {}
class UpdateContractDto extends createZodDto(updateContractSchema) {}

const booleanQuery = (value?: string): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined;

/** F03 CA-1 a CA-8: prestadores y sus contratos. */
@ApiTags('service-providers')
@Controller('service-providers')
export class ServiceProvidersController {
  constructor(
    private readonly providers: ServiceProvidersService,
    private readonly contracts: ContractsService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('hasActiveContract') hasActiveContract?: string,
  ): Promise<ServiceProvider[]> {
    const active = booleanQuery(hasActiveContract);
    return this.providers.list({
      ...(search ? { search } : {}),
      ...(active !== undefined ? { hasActiveContract: active } : {}),
    });
  }

  @Post()
  create(@Body() body: CreateServiceProviderDto): Promise<ServiceProvider> {
    return this.providers.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceProvider> {
    return this.providers.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateServiceProviderDto,
  ): Promise<ServiceProvider> {
    return this.providers.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.providers.remove(id);
  }

  @Get(':id/contracts')
  listContracts(@Param('id', ParseUUIDPipe) id: string): Promise<Contract[]> {
    return this.contracts.listForProvider(id);
  }

  @Post(':id/contracts')
  createContract(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateContractDto,
  ): Promise<Contract> {
    return this.contracts.create(id, body);
  }
}

@ApiTags('service-providers')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  /** `?overlaps=YYYY-MM-DD..YYYY-MM-DD`: contratos vigentes en algún día de ese rango (F04 CA-17). */
  @Get()
  overlapping(@Query('overlaps') overlaps?: string): Promise<ContractOption[]> {
    const [start = '', end = ''] = (overlaps ?? '').split('..');
    if (!isIsoDate(start) || !isIsoDate(end) || end < start) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        422,
        'overlaps must be YYYY-MM-DD..YYYY-MM-DD',
      );
    }
    return this.contracts.overlapping(start, end);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateContractDto,
  ): Promise<Contract> {
    return this.contracts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.contracts.remove(id);
  }
}
