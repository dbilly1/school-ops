import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuperAdminSchoolsService } from './super-admin-schools.service';
import { UpdateSubscriptionDto, GrantFeatureDto } from './dto/manage-school.dto';
import { JwtSuperAdminGuard } from '../auth/guards/jwt-super-admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Super Admin — Schools')
@ApiBearerAuth()
@UseGuards(JwtSuperAdminGuard)
@Controller('super-admin/schools')
export class SuperAdminSchoolsController {
  constructor(private schoolsService: SuperAdminSchoolsService) {}

  @Get()
  @ApiOperation({ summary: 'List all schools' })
  findAll() {
    return this.schoolsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get school detail' })
  findOne(@Param('id') id: string) {
    return this.schoolsService.findOne(id);
  }

  @Patch(':id/subscription')
  @ApiOperation({ summary: 'Update school subscription state' })
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.schoolsService.updateSubscription(id, dto);
  }

  @Patch(':id/package/:packageId')
  @ApiOperation({ summary: 'Assign a package to a school' })
  assignPackage(@Param('id') id: string, @Param('packageId') packageId: string) {
    return this.schoolsService.assignPackage(id, packageId);
  }

  @Post(':id/grants')
  @ApiOperation({ summary: 'Grant a feature to a school' })
  grantFeature(
    @Param('id') id: string,
    @Body() dto: GrantFeatureDto,
    @CurrentUser() admin: any,
  ) {
    return this.schoolsService.grantFeature(id, dto, admin.id);
  }

  @Delete(':id/grants/:grantId')
  @ApiOperation({ summary: 'Revoke a feature grant' })
  revokeGrant(@Param('id') id: string, @Param('grantId') grantId: string) {
    return this.schoolsService.revokeGrant(id, grantId);
  }
}
