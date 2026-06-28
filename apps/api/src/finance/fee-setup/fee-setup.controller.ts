import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeeSetupService } from './fee-setup.service';
import {
  CreateFeeComponentDto, UpdateFeeComponentDto, SaveFeeItemsDto,
} from './dto/fee-setup.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../permissions/permissions.guard';
import { RequirePermission } from '../../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Finance — Fee Setup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/finance')
export class FeeSetupController {
  constructor(private service: FeeSetupService) {}

  // ── Fee component catalog ───────────────────────────────────────────────

  @Get('fee-components')
  @RequirePermission('finance', 'VIEW')
  findComponents(@CurrentUser() user: any, @Query('includeArchived') includeArchived?: string) {
    return this.service.findComponents(user.schoolId, includeArchived === 'true');
  }

  @Post('fee-components')
  @RequirePermission('finance', 'CREATE')
  createComponent(@CurrentUser() user: any, @Body() dto: CreateFeeComponentDto) {
    return this.service.createComponent(user.schoolId, dto);
  }

  @Patch('fee-components/:id')
  @RequirePermission('finance', 'EDIT')
  updateComponent(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateFeeComponentDto) {
    return this.service.updateComponent(user.schoolId, id, dto);
  }

  @Delete('fee-components/:id')
  @RequirePermission('finance', 'DELETE')
  deleteComponent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteComponent(user.schoolId, id);
  }

  // ── Fee items (per category × term) ─────────────────────────────────────

  @Get('fee-items')
  @RequirePermission('finance', 'VIEW')
  getFeeItems(
    @CurrentUser() user: any,
    @Query('studentCategoryId') studentCategoryId: string,
  ) {
    return this.service.getFeeItems(user.schoolId, studentCategoryId);
  }

  @Put('fee-items')
  @RequirePermission('finance', 'EDIT')
  saveFeeItems(@CurrentUser() user: any, @Body() dto: SaveFeeItemsDto) {
    return this.service.saveFeeItems(user.schoolId, dto);
  }
}
