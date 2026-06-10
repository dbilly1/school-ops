import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpsertPackageFeatureDto } from './dto/upsert-package-feature.dto';
import { PermissionCacheService } from '../../cache/permission-cache.service';

@Injectable()
export class PackagesService {
  constructor(
    private prisma: PrismaService,
    private cache: PermissionCacheService,
  ) {}

  async findAll() {
    return this.prisma.package.findMany({
      include: { features: true, _count: { select: { schools: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      include: { features: true, _count: { select: { schools: true } } },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  async create(dto: CreatePackageDto) {
    return this.prisma.package.create({ data: dto });
  }

  async update(id: string, dto: Partial<CreatePackageDto>) {
    await this.findOne(id);
    return this.prisma.package.update({ where: { id }, data: dto });
  }

  async addFeature(packageId: string, dto: UpsertPackageFeatureDto) {
    await this.findOne(packageId);

    const existing = await this.prisma.packageFeature.findFirst({
      where: {
        packageId,
        featureKey: dto.featureKey,
        subFeatureKey: dto.subFeatureKey ?? null,
      },
    });
    if (existing) throw new ConflictException('Feature already added to this package');

    const created = await this.prisma.packageFeature.create({
      data: {
        packageId,
        featureKey: dto.featureKey,
        subFeatureKey: dto.subFeatureKey ?? null,
      },
    });
    // Affects every school on this package — clear the whole cache.
    this.cache.invalidateAll();
    return created;
  }

  async removeFeature(packageId: string, featureId: string) {
    const feature = await this.prisma.packageFeature.findFirst({
      where: { id: featureId, packageId },
    });
    if (!feature) throw new NotFoundException('Feature not found on this package');

    const deleted = await this.prisma.packageFeature.delete({ where: { id: featureId } });
    this.cache.invalidateAll();
    return deleted;
  }

  // Returns the dev/testing all-features package, creating it if needed
  async ensureDevPackage(): Promise<string> {
    const existing = await this.prisma.package.findFirst({
      where: { name: 'All Features (Dev)' },
    });
    if (existing) return existing.id;

    const pkg = await this.prisma.package.create({
      data: { name: 'All Features (Dev)', description: 'Auto-assigned during development' },
    });

    // Seed all known features and sub-features
    const features = [
      { featureKey: 'admissions', subFeatureKey: null },
      { featureKey: 'admissions', subFeatureKey: 'lead_tracking' },
      { featureKey: 'admissions', subFeatureKey: 'inquiry_stage' },
      { featureKey: 'admissions', subFeatureKey: 'application_stage' },
      { featureKey: 'admissions', subFeatureKey: 'interview_stage' },
      { featureKey: 'admissions', subFeatureKey: 'acceptance_stage' },
      { featureKey: 'academics', subFeatureKey: null },
      { featureKey: 'academics', subFeatureKey: 'assessments' },
      { featureKey: 'academics', subFeatureKey: 'exams' },
      { featureKey: 'academics', subFeatureKey: 'grading' },
      { featureKey: 'academics', subFeatureKey: 'report_cards' },
      { featureKey: 'academics', subFeatureKey: 'transcripts' },
      { featureKey: 'attendance', subFeatureKey: null },
      { featureKey: 'attendance', subFeatureKey: 'student_attendance' },
      { featureKey: 'attendance', subFeatureKey: 'staff_attendance' },
      { featureKey: 'attendance', subFeatureKey: 'attendance_analytics' },
      { featureKey: 'finance', subFeatureKey: null },
      { featureKey: 'finance', subFeatureKey: 'fee_structures' },
      { featureKey: 'finance', subFeatureKey: 'invoicing' },
      { featureKey: 'finance', subFeatureKey: 'receipts' },
      { featureKey: 'finance', subFeatureKey: 'outstanding_balance_tracking' },
      { featureKey: 'finance', subFeatureKey: 'discount_management' },
      { featureKey: 'finance', subFeatureKey: 'feeding_fees' },
      { featureKey: 'finance', subFeatureKey: 'transport_fees' },
      { featureKey: 'student_portal', subFeatureKey: null },
      { featureKey: 'student_portal', subFeatureKey: 'attendance_view' },
      { featureKey: 'student_portal', subFeatureKey: 'report_card_view' },
      { featureKey: 'student_portal', subFeatureKey: 'academic_progress_view' },
      { featureKey: 'student_portal', subFeatureKey: 'notice_view' },
      { featureKey: 'student_portal', subFeatureKey: 'transport_view' },
      { featureKey: 'transport', subFeatureKey: null },
      { featureKey: 'transport', subFeatureKey: 'vehicles' },
      { featureKey: 'transport', subFeatureKey: 'routes' },
      { featureKey: 'transport', subFeatureKey: 'drivers' },
      { featureKey: 'transport', subFeatureKey: 'student_assignment' },
      { featureKey: 'transport', subFeatureKey: 'pickup_points' },
      { featureKey: 'transport', subFeatureKey: 'fee_collection' },
      { featureKey: 'feeding_fees', subFeatureKey: null },
      { featureKey: 'feeding_fees', subFeatureKey: 'fee_collection' },
      { featureKey: 'communication', subFeatureKey: null },
      { featureKey: 'communication', subFeatureKey: 'notices' },
      { featureKey: 'communication', subFeatureKey: 'announcements' },
      { featureKey: 'communication', subFeatureKey: 'internal_messaging' },
    ];

    await this.prisma.packageFeature.createMany({
      data: features.map((f) => ({ packageId: pkg.id, ...f })),
    });

    return pkg.id;
  }
}
