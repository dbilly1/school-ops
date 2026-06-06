import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto, UpdateTermDto } from './dto/academic-year.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Academic Years')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/academic-years')
export class AcademicYearsController {
  constructor(private service: AcademicYearsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.schoolId);
  }

  @Get('active')
  findActive(@CurrentUser() user: any) {
    return this.service.findActive(user.schoolId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateAcademicYearDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Patch(':id/activate')
  setActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.setActive(user.schoolId, id);
  }

  @Patch('terms/:termId')
  updateTerm(
    @CurrentUser() user: any,
    @Param('termId') termId: string,
    @Body() dto: UpdateTermDto,
  ) {
    return this.service.updateTerm(user.schoolId, termId, dto);
  }

  @Patch('terms/:termId/activate')
  setActiveTerm(@CurrentUser() user: any, @Param('termId') termId: string) {
    return this.service.setActiveTerm(user.schoolId, termId);
  }
}
