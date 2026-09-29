import { Module } from '@nestjs/common';
import { registerConstraintCodes } from '../../shared/errors/pg-error.mapper';
import { AuthModule } from '../auth/auth.module';
import { MemberOnboarding } from './member-onboarding';
import { MembersService } from './members.service';
import { MembersController, PlatformOrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

registerConstraintCodes({
  organizations_tax_id_uq: 'TAX_ID_TAKEN',
  organization_members_user_id_organization_id_pk: 'ALREADY_MEMBER',
});

@Module({
  imports: [AuthModule],
  controllers: [PlatformOrganizationsController, MembersController],
  providers: [OrganizationsService, MembersService, MemberOnboarding],
})
export class OrganizationsModule {}
