import { Controller, Post, Get, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SchoolsService } from './schools.service';
import { RegisterSchoolDto } from './dto/register-school.dto';

@ApiTags('Schools')
@Controller('schools')
export class SchoolsController {
  constructor(private schoolsService: SchoolsService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new school (public)' })
  register(@Body() dto: RegisterSchoolDto) {
    return this.schoolsService.register(dto);
  }

  @Get('branding')
  @ApiOperation({ summary: 'Public branding (name/logo/colour) for a school by subdomain slug' })
  getBranding(@Headers('x-school-slug') slug?: string) {
    return this.schoolsService.getPublicBranding(slug);
  }
}
