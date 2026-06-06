import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateVehicleDto, CreateRouteDto, UpdateRouteDto,
  CreateDriverDto, AddPickupPointDto, AssignStudentToRouteDto,
} from './dto/transport.dto';

@Injectable()
export class TransportService {
  constructor(private prisma: PrismaService) {}

  // ── Vehicles ──────────────────────────────────────────────

  async findVehicles(schoolId: string) {
    return this.prisma.vehicle.findMany({
      where: { schoolId },
      include: { _count: { select: { routes: true } } },
      orderBy: { plateNumber: 'asc' },
    });
  }

  async createVehicle(schoolId: string, dto: CreateVehicleDto) {
    const existing = await this.prisma.vehicle.findFirst({
      where: { schoolId, plateNumber: dto.plateNumber },
    });
    if (existing) throw new ConflictException('Vehicle with this plate number already exists');
    return this.prisma.vehicle.create({ data: { schoolId, ...dto } });
  }

  async deleteVehicle(schoolId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, schoolId },
      include: { _count: { select: { routes: true } } },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle._count.routes > 0)
      throw new ConflictException('Cannot delete a vehicle assigned to a route');
    return this.prisma.vehicle.delete({ where: { id } });
  }

  // ── Drivers ───────────────────────────────────────────────

  async findDrivers(schoolId: string) {
    return this.prisma.driver.findMany({
      where: { schoolId },
      include: { _count: { select: { routes: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createDriver(schoolId: string, dto: CreateDriverDto) {
    return this.prisma.driver.create({ data: { schoolId, ...dto } });
  }

  async deleteDriver(schoolId: string, id: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, schoolId },
      include: { _count: { select: { routes: true } } },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver._count.routes > 0)
      throw new ConflictException('Cannot delete a driver assigned to a route');
    return this.prisma.driver.delete({ where: { id } });
  }

  // ── Routes ────────────────────────────────────────────────

  async findRoutes(schoolId: string) {
    return this.prisma.transportRoute.findMany({
      where: { schoolId },
      include: {
        vehicle: { select: { id: true, plateNumber: true, model: true } },
        driver: { select: { id: true, name: true, phone: true } },
        pickupPoints: { orderBy: { sequence: 'asc' } },
        _count: { select: { studentAssignments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findRoute(schoolId: string, id: string) {
    const route = await this.prisma.transportRoute.findFirst({
      where: { id, schoolId },
      include: {
        vehicle: true,
        driver: true,
        pickupPoints: { orderBy: { sequence: 'asc' } },
        studentAssignments: {
          include: {
            student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async createRoute(schoolId: string, dto: CreateRouteDto) {
    return this.prisma.transportRoute.create({
      data: { schoolId, ...dto },
      include: { vehicle: true, driver: true },
    });
  }

  async updateRoute(schoolId: string, id: string, dto: UpdateRouteDto) {
    const route = await this.prisma.transportRoute.findFirst({ where: { id, schoolId } });
    if (!route) throw new NotFoundException('Route not found');
    return this.prisma.transportRoute.update({ where: { id }, data: dto });
  }

  async addPickupPoint(schoolId: string, routeId: string, dto: AddPickupPointDto) {
    const route = await this.prisma.transportRoute.findFirst({ where: { id: routeId, schoolId } });
    if (!route) throw new NotFoundException('Route not found');
    return this.prisma.pickupPoint.create({
      data: { transportRouteId: routeId, ...dto },
    });
  }

  async removePickupPoint(schoolId: string, routeId: string, pointId: string) {
    const route = await this.prisma.transportRoute.findFirst({ where: { id: routeId, schoolId } });
    if (!route) throw new NotFoundException('Route not found');
    return this.prisma.pickupPoint.delete({ where: { id: pointId } });
  }

  // ── Student Assignments ───────────────────────────────────

  async assignStudent(schoolId: string, dto: AssignStudentToRouteDto) {
    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const route = await this.prisma.transportRoute.findFirst({
      where: { id: dto.transportRouteId, schoolId },
    });
    if (!route) throw new NotFoundException('Route not found');

    return this.prisma.studentTransportAssignment.upsert({
      where: { studentId: dto.studentId },
      update: { transportRouteId: dto.transportRouteId, pickupPointId: dto.pickupPointId ?? null },
      create: {
        studentId: dto.studentId,
        transportRouteId: dto.transportRouteId,
        pickupPointId: dto.pickupPointId ?? null,
      },
      include: {
        transportRoute: { select: { id: true, name: true, dailyRate: true } },
      },
    });
  }

  async removeStudentAssignment(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    return this.prisma.studentTransportAssignment.delete({ where: { studentId } });
  }
}
