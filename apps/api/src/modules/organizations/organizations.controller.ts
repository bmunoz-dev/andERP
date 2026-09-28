import {
  createOrganizationSchema,
  inviteMemberSchema,
  type Member,
  type Organization,
  updateMemberSchema,
  updateOrganizationSchema,
} from '@anderp/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { SuperAdminOnly } from '../auth/http/guards';
import { MembersService } from './members.service';
import { OrganizationsService } from './organizations.service';

class CreateOrganizationDto extends createZodDto(createOrganizationSchema) {}
class UpdateOrganizationDto extends createZodDto(updateOrganizationSchema) {}
class InviteMemberDto extends createZodDto(inviteMemberSchema) {}
class UpdateMemberDto extends createZodDto(updateMemberSchema) {}

/** F02 CA-1 a CA-3: organizaciones de la plataforma. */
@ApiTags('platform')
@SuperAdminOnly()
@Controller('platform/organizations')
export class PlatformOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(): Promise<Organization[]> {
    return this.organizations.list();
  }

  @Post()
  create(@Body() body: CreateOrganizationDto): Promise<Organization> {
    return this.organizations.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Organization> {
    return this.organizations.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizations.update(id, body);
  }
}

/** F02 CA-11 a CA-15: usuarios de la organización del actor. */
@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(): Promise<Member[]> {
    return this.members.list();
  }

  @Post()
  invite(@Body() body: InviteMemberDto): Promise<Member> {
    return this.members.invite(body);
  }

  @Patch(':userId')
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateMemberDto,
  ): Promise<Member> {
    return this.members.setActive(userId, body.isActive);
  }

  @Post(':userId/resend-invite')
  @HttpCode(204)
  resendInvite(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.members.resendInvite(userId);
  }
}
