import {
  type Credential,
  ErrorCode,
  type RevealedPassword,
  saveCredentialSchema,
  updateCredentialSchema,
} from '@anderp/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { ENV, type Env } from '../../config/env';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { CredentialCipher } from './credential-cipher';
import { CredentialsService } from './credentials.service';

registerConstraintCodes({ entity_credentials_uq: ErrorCode.DUPLICATE_CREDENTIAL });

class SaveCredentialDto extends createZodDto(saveCredentialSchema) {}
class UpdateCredentialDto extends createZodDto(updateCredentialSchema) {}

@ApiTags('credentials')
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  list(@Query('search') search?: string): Promise<Credential[]> {
    return this.credentials.list(search);
  }

  @Post()
  create(@Body() body: SaveCredentialDto): Promise<Credential> {
    return this.credentials.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Credential> {
    return this.credentials.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCredentialDto,
  ): Promise<Credential> {
    return this.credentials.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.credentials.remove(id);
  }

  /** CA-6: la contraseña en claro no queda en ninguna caché. */
  @Post(':id/reveal')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  reveal(@Param('id', ParseUUIDPipe) id: string): Promise<RevealedPassword> {
    return this.credentials.reveal(id);
  }
}

@Module({
  controllers: [CredentialsController],
  providers: [
    CredentialsService,
    {
      provide: CredentialCipher,
      inject: [ENV],
      useFactory: (env: Env) =>
        new CredentialCipher(env.CREDENTIALS_KEYS, env.CREDENTIALS_ACTIVE_KEY_VERSION),
    },
  ],
})
export class CredentialsModule {}
