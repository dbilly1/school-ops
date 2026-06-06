import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('school/permissions')
export class PermissionsController {
  constructor(private prisma: PrismaService) {}

  /** All role permission defaults — global, not school-specific */
  @Get('defaults')
  getDefaults() {
    return this.prisma.rolePermissionDefault.findMany();
  }
}
