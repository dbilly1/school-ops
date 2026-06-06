import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpsertPackageFeatureDto } from './dto/upsert-package-feature.dto';
import { JwtSuperAdminGuard } from '../auth/guards/jwt-super-admin.guard';

@ApiTags('Super Admin — Packages')
@ApiBearerAuth()
@UseGuards(JwtSuperAdminGuard)
@Controller('super-admin/packages')
export class PackagesController {
  constructor(private packagesService: PackagesService) {}

  @Get()
  @ApiOperation({ summary: 'List all packages' })
  findAll() {
    return this.packagesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get package detail' })
  findOne(@Param('id') id: string) {
    return this.packagesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a package' })
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a package' })
  update(@Param('id') id: string, @Body() dto: Partial<CreatePackageDto>) {
    return this.packagesService.update(id, dto);
  }

  @Post(':id/features')
  @ApiOperation({ summary: 'Add a feature to a package' })
  addFeature(@Param('id') id: string, @Body() dto: UpsertPackageFeatureDto) {
    return this.packagesService.addFeature(id, dto);
  }

  @Delete(':id/features/:featureId')
  @ApiOperation({ summary: 'Remove a feature from a package' })
  removeFeature(@Param('id') id: string, @Param('featureId') featureId: string) {
    return this.packagesService.removeFeature(id, featureId);
  }
}
