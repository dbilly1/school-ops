import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GradeStructureService } from './grade-structure.service';
import { CreateGradeLevelDto, CreateClassDto, UpdateGradeLevelDto, BulkCreateGradeLevelsDto } from './dto/grade-structure.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Grade Structure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/grade-structure')
export class GradeStructureController {
  constructor(private service: GradeStructureService) {}

  @Get('grade-levels')
  findGradeLevels(@CurrentUser() user: any) {
    return this.service.findAllGradeLevels(user.schoolId);
  }

  @Post('grade-levels/bulk')
  bulkCreateGradeLevels(@CurrentUser() user: any, @Body() dto: BulkCreateGradeLevelsDto) {
    return this.service.bulkCreateGradeLevels(user.schoolId, dto);
  }

  @Post('grade-levels')
  createGradeLevel(@CurrentUser() user: any, @Body() dto: CreateGradeLevelDto) {
    return this.service.createGradeLevel(user.schoolId, dto);
  }

  @Patch('grade-levels/:id')
  updateGradeLevel(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateGradeLevelDto) {
    return this.service.updateGradeLevel(user.schoolId, id, dto);
  }

  @Delete('grade-levels/:id')
  deleteGradeLevel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteGradeLevel(user.schoolId, id);
  }

  @Get('classes')
  findAllClasses(@CurrentUser() user: any) {
    return this.service.findAllClasses(user.schoolId);
  }

  @Post('classes/ensure')
  ensureClasses(@CurrentUser() user: any) {
    return this.service.ensureClasses(user.schoolId);
  }

  @Get('grade-levels/:gradeLevelId/classes')
  findClassesByGrade(@CurrentUser() user: any, @Param('gradeLevelId') gradeLevelId: string) {
    return this.service.findClassesByGrade(user.schoolId, gradeLevelId);
  }

  @Post('classes')
  createClass(@CurrentUser() user: any, @Body() dto: CreateClassDto) {
    return this.service.createClass(user.schoolId, dto);
  }

  @Delete('classes/:id')
  deleteClass(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteClass(user.schoolId, id);
  }
}
