import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurriculumSubjectsService } from './curriculum-subjects.service';
import { CreateCurriculumSubjectDto, UpdateCurriculumSubjectDto } from './dto/curriculum-subject.dto';
import { JwtSuperAdminGuard } from '../auth/guards/jwt-super-admin.guard';

@ApiTags('Super Admin — Curriculum Subjects')
@ApiBearerAuth()
@UseGuards(JwtSuperAdminGuard)
@Controller('super-admin/curriculum-subjects')
export class CurriculumSubjectsController {
  constructor(private service: CurriculumSubjectsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateCurriculumSubjectDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCurriculumSubjectDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
