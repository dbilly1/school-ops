import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GradingService } from './grading.service';
import { CreateGradingScaleDto, UpdateGradingBandsDto } from './dto/grading.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Grading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/grading')
export class GradingController {
  constructor(private service: GradingService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.schoolId);
  }

  @Get('active')
  getActive(@CurrentUser() user: any) {
    return this.service.getActiveScale(user.schoolId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateGradingScaleDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Patch(':id/bands')
  updateBands(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateGradingBandsDto) {
    return this.service.updateBands(user.schoolId, id, dto);
  }

  @Patch(':id/activate')
  setActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.setActive(user.schoolId, id);
  }
}
