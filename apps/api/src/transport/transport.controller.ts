import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransportService } from './transport.service';
import {
  CreateVehicleDto, CreateRouteDto, UpdateRouteDto,
  CreateDriverDto, AddPickupPointDto, AssignStudentToRouteDto,
} from './dto/transport.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Transport')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/transport')
export class TransportController {
  constructor(private transportService: TransportService) {}

  // Vehicles
  @Get('vehicles')
  @RequirePermission('transport', 'VIEW')
  findVehicles(@CurrentUser() user: any) {
    return this.transportService.findVehicles(user.schoolId);
  }

  @Post('vehicles')
  @RequirePermission('transport', 'CREATE')
  createVehicle(@CurrentUser() user: any, @Body() dto: CreateVehicleDto) {
    return this.transportService.createVehicle(user.schoolId, dto);
  }

  @Delete('vehicles/:id')
  @RequirePermission('transport', 'DELETE')
  deleteVehicle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.transportService.deleteVehicle(user.schoolId, id);
  }

  // Drivers
  @Get('drivers')
  @RequirePermission('transport', 'VIEW')
  findDrivers(@CurrentUser() user: any) {
    return this.transportService.findDrivers(user.schoolId);
  }

  @Post('drivers')
  @RequirePermission('transport', 'CREATE')
  createDriver(@CurrentUser() user: any, @Body() dto: CreateDriverDto) {
    return this.transportService.createDriver(user.schoolId, dto);
  }

  @Delete('drivers/:id')
  @RequirePermission('transport', 'DELETE')
  deleteDriver(@CurrentUser() user: any, @Param('id') id: string) {
    return this.transportService.deleteDriver(user.schoolId, id);
  }

  // Routes
  @Get('routes')
  @RequirePermission('transport', 'VIEW')
  findRoutes(@CurrentUser() user: any) {
    return this.transportService.findRoutes(user.schoolId);
  }

  @Get('routes/:id')
  @RequirePermission('transport', 'VIEW')
  findRoute(@CurrentUser() user: any, @Param('id') id: string) {
    return this.transportService.findRoute(user.schoolId, id);
  }

  @Post('routes')
  @RequirePermission('transport', 'CREATE')
  createRoute(@CurrentUser() user: any, @Body() dto: CreateRouteDto) {
    return this.transportService.createRoute(user.schoolId, dto);
  }

  @Patch('routes/:id')
  @RequirePermission('transport', 'EDIT')
  updateRoute(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.transportService.updateRoute(user.schoolId, id, dto);
  }

  @Post('routes/:id/pickup-points')
  @RequirePermission('transport', 'EDIT')
  addPickupPoint(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddPickupPointDto) {
    return this.transportService.addPickupPoint(user.schoolId, id, dto);
  }

  @Delete('routes/:id/pickup-points/:pointId')
  @RequirePermission('transport', 'DELETE')
  removePickupPoint(@CurrentUser() user: any, @Param('id') id: string, @Param('pointId') pointId: string) {
    return this.transportService.removePickupPoint(user.schoolId, id, pointId);
  }

  // Student assignments
  @Post('assignments')
  @RequirePermission('transport', 'CREATE')
  assignStudent(@CurrentUser() user: any, @Body() dto: AssignStudentToRouteDto) {
    return this.transportService.assignStudent(user.schoolId, dto);
  }

  @Delete('assignments/:studentId')
  @RequirePermission('transport', 'DELETE')
  removeAssignment(@CurrentUser() user: any, @Param('studentId') studentId: string) {
    return this.transportService.removeStudentAssignment(user.schoolId, studentId);
  }
}
