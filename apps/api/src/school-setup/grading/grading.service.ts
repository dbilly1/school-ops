import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGradingScaleDto, UpdateGradingBandsDto } from './dto/grading.dto';

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

  async getActiveScale(schoolId: string) {
    return this.prisma.gradingScale.findFirst({
      where: { schoolId, isActive: true },
      include: { bands: { orderBy: { minScore: 'desc' } } },
    });
  }

  async findAll(schoolId: string) {
    return this.prisma.gradingScale.findMany({
      where: { schoolId },
      include: { bands: { orderBy: { minScore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(schoolId: string, dto: CreateGradingScaleDto) {
    return this.prisma.$transaction(async (tx) => {
      // Deactivate existing active scale
      await tx.gradingScale.updateMany({
        where: { schoolId, isActive: true },
        data: { isActive: false },
      });

      return tx.gradingScale.create({
        data: {
          schoolId,
          scaleType: dto.scaleType,
          passmark: dto.passmark,
          gpaMax: dto.gpaMax,
          isActive: true,
          bands: { create: dto.bands },
        },
        include: { bands: { orderBy: { minScore: 'desc' } } },
      });
    });
  }

  async updateBands(schoolId: string, scaleId: string, dto: UpdateGradingBandsDto) {
    const scale = await this.prisma.gradingScale.findFirst({
      where: { id: scaleId, schoolId },
    });
    if (!scale) throw new NotFoundException('Grading scale not found');

    // Replace all bands: delete existing, create new ones
    return this.prisma.$transaction(async (tx) => {
      await tx.gradingScaleBand.deleteMany({ where: { gradingScaleId: scaleId } });
      return tx.gradingScale.update({
        where: { id: scaleId },
        data: { bands: { create: dto.bands } },
        include: { bands: { orderBy: { minScore: 'desc' } } },
      });
    });
  }

  async setActive(schoolId: string, scaleId: string) {
    const scale = await this.prisma.gradingScale.findFirst({
      where: { id: scaleId, schoolId },
    });
    if (!scale) throw new NotFoundException('Grading scale not found');

    await this.prisma.gradingScale.updateMany({
      where: { schoolId, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.gradingScale.update({
      where: { id: scaleId },
      data: { isActive: true },
    });
  }

  // Derive the display grade for a raw score
  async deriveGrade(schoolId: string, rawScore: number): Promise<string | null> {
    const scale = await this.getActiveScale(schoolId);
    if (!scale) return null;

    const band = scale.bands.find(
      (b) => rawScore >= Number(b.minScore) && rawScore <= Number(b.maxScore),
    );

    return band?.label ?? null;
  }
}
