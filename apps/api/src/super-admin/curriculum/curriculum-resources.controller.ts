import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EducationLevelType } from '@prisma/client';
import { CurriculumResourcesService } from './curriculum-resources.service';
import { CreateCurriculumResourceDto, UploadedFileLike } from './dto/curriculum-resource.dto';
import { JwtSuperAdminGuard } from '../auth/guards/jwt-super-admin.guard';

@ApiTags('Super Admin — Curriculum Resources')
@ApiBearerAuth()
@UseGuards(JwtSuperAdminGuard)
@Controller('super-admin/curriculum-resources')
export class CurriculumResourcesController {
  constructor(private service: CurriculumResourcesService) {}

  @Get()
  findAll(@Query('levelType') levelType?: EducationLevelType) {
    return this.service.findAll(levelType);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  create(@Body() dto: CreateCurriculumResourceDto, @UploadedFile() file: UploadedFileLike) {
    return this.service.create(dto, file);
  }

  @Get(':id/download')
  download(@Param('id') id: string) {
    return this.service.download(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
