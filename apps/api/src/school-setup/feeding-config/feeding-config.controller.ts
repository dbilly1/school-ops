import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeedingConfigService } from './feeding-config.service';
import { CreateFeedingConfigDto } from './dto/feeding-config.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Feeding Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/feeding-config')
export class FeedingConfigController {
  constructor(private service: FeedingConfigService) {}

  @Get()
  getCurrent(@CurrentUser() user: any) {
    return this.service.getCurrent(user.schoolId);
  }

  @Get('all')
  getAll(@CurrentUser() user: any) {
    return this.service.getAll(user.schoolId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateFeedingConfigDto) {
    return this.service.create(user.schoolId, dto);
  }
}
