import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StudentCategoriesService } from './student-categories.service';
import { CreateStudentCategoryDto, BulkCreateCategoriesDto } from './dto/student-category.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Student Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/student-categories')
export class StudentCategoriesController {
  constructor(private service: StudentCategoriesService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.schoolId);
  }

  @Post('bulk')
  bulkCreate(@CurrentUser() user: any, @Body() dto: BulkCreateCategoriesDto) {
    return this.service.bulkCreate(user.schoolId, dto);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateStudentCategoryDto) {
    return this.service.create(user.schoolId, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.delete(user.schoolId, id);
  }
}
