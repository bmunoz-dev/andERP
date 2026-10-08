import {
  ErrorCode,
  type ResponsiblePerson,
  type SaveResponsiblePerson,
  saveResponsiblePersonSchema,
  type UpdateResponsiblePerson,
  updateResponsiblePersonSchema,
} from '@anderp/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, eq } from 'drizzle-orm';
import { createZodDto } from 'nestjs-zod';
import { DB, type Database } from '../../db/database.module';
import { responsiblePersons } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';

registerConstraintCodes({ responsible_persons_contact_ck: ErrorCode.CONTACT_REQUIRED });

const columns = {
  id: responsiblePersons.id,
  firstName: responsiblePersons.firstName,
  lastName: responsiblePersons.lastName,
  email: responsiblePersons.email,
  phone: responsiblePersons.phone,
};

/** Responsables de credenciales (F06 CA-1, CA-2). `RESPONSIBLE_IN_USE` lo lanza un trigger. */
@Injectable()
export class ResponsiblePersonsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scope: OrgScope,
  ) {}

  list(): Promise<ResponsiblePerson[]> {
    return this.db
      .select(columns)
      .from(responsiblePersons)
      .where(this.scope.where(responsiblePersons))
      .orderBy(asc(responsiblePersons.firstName), asc(responsiblePersons.lastName));
  }

  async get(id: string): Promise<ResponsiblePerson> {
    const [row] = await this.db
      .select(columns)
      .from(responsiblePersons)
      .where(and(this.scope.where(responsiblePersons), eq(responsiblePersons.id, id)));
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    return row;
  }

  async create(input: SaveResponsiblePerson): Promise<ResponsiblePerson> {
    const [row] = await this.db
      .insert(responsiblePersons)
      .values(
        this.scope.forInsert({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
        }),
      )
      .returning(columns);
    if (!row) throw new Error('Insert returned no rows');
    return row;
  }

  async update(id: string, changes: UpdateResponsiblePerson): Promise<ResponsiblePerson> {
    const [row] = await this.db
      .update(responsiblePersons)
      .set(this.scope.forUpdate(changes))
      .where(and(this.scope.where(responsiblePersons), eq(responsiblePersons.id, id)))
      .returning(columns);
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    return row;
  }

  async remove(id: string): Promise<void> {
    const [row] = await this.db
      .update(responsiblePersons)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(responsiblePersons), eq(responsiblePersons.id, id)))
      .returning({ id: responsiblePersons.id });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
  }
}

class SaveResponsiblePersonDto extends createZodDto(saveResponsiblePersonSchema) {}
class UpdateResponsiblePersonDto extends createZodDto(updateResponsiblePersonSchema) {}

@ApiTags('responsible-persons')
@Controller('responsible-persons')
export class ResponsiblePersonsController {
  constructor(private readonly persons: ResponsiblePersonsService) {}

  @Get()
  list(): Promise<ResponsiblePerson[]> {
    return this.persons.list();
  }

  @Post()
  create(@Body() body: SaveResponsiblePersonDto): Promise<ResponsiblePerson> {
    return this.persons.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ResponsiblePerson> {
    return this.persons.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateResponsiblePersonDto,
  ): Promise<ResponsiblePerson> {
    return this.persons.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.persons.remove(id);
  }
}

@Module({
  controllers: [ResponsiblePersonsController],
  providers: [ResponsiblePersonsService],
})
export class ResponsiblePersonsModule {}
