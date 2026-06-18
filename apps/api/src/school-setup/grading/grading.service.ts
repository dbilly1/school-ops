import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGradingScaleDto, UpdateGradingBandsDto } from './dto/grading.dto';

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

  // Returns the grading scale to use. When a gradeLevelId is given, prefer a
  // scale that targets that grade level (e.g. JHS 1–9), otherwise fall back to
  // a school-wide default scale (no grade-level targeting).
  async getActiveScale(schoolId: string, gradeLevelId?: string) {
    const active = await this.prisma.gradingScale.findMany({
      where: { schoolId, isActive: true },
      include: { bands: { orderBy: { minScore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (active.length === 0) return null;

    if (gradeLevelId) {
      const targeted = active.find((s) => s.appliesToGradeLevelIds.includes(gradeLevelId));
      if (targeted) return targeted;
    }
    // Default scale = one with no grade-level targeting; else first active.
    return active.find((s) => s.appliesToGradeLevelIds.length === 0) ?? active[0];
  }

  async findAll(schoolId: string) {
    return this.prisma.gradingScale.findMany({
      where: { schoolId },
      include: { bands: { orderBy: { minScore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Two scales conflict if they'd ever apply to the same student: both are
  // school-wide defaults (no targeting), or their grade-level sets intersect.
  private conflicts(a: string[], b: string[]): boolean {
    if (a.length === 0 && b.length === 0) return true;
    return a.some((id) => b.includes(id));
  }

  async create(schoolId: string, dto: CreateGradingScaleDto) {
    const targets = dto.appliesToGradeLevelIds ?? [];

    return this.prisma.$transaction(async (tx) => {
      // Deactivate only the active scales this one would conflict with, so a
      // Primary scale and a JHS scale can both stay active at once.
      const active = await tx.gradingScale.findMany({
        where: { schoolId, isActive: true },
        select: { id: true, appliesToGradeLevelIds: true },
      });
      const toDeactivate = active.filter((s) => this.conflicts(s.appliesToGradeLevelIds, targets)).map((s) => s.id);
      if (toDeactivate.length > 0) {
        await tx.gradingScale.updateMany({ where: { id: { in: toDeactivate } }, data: { isActive: false } });
      }

      return tx.gradingScale.create({
        data: {
          schoolId,
          scaleType: dto.scaleType,
          passmark: dto.passmark,
          gpaMax: dto.gpaMax,
          appliesToGradeLevelIds: targets,
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

    // Deactivate only conflicting active scales (same grade-level coverage).
    const active = await this.prisma.gradingScale.findMany({
      where: { schoolId, isActive: true, id: { not: scaleId } },
      select: { id: true, appliesToGradeLevelIds: true },
    });
    const toDeactivate = active
      .filter((s) => this.conflicts(s.appliesToGradeLevelIds, scale.appliesToGradeLevelIds))
      .map((s) => s.id);
    if (toDeactivate.length > 0) {
      await this.prisma.gradingScale.updateMany({ where: { id: { in: toDeactivate } }, data: { isActive: false } });
    }

    return this.prisma.gradingScale.update({
      where: { id: scaleId },
      data: { isActive: true },
    });
  }

  // Derive the display grade/band for a percentage (0–100). Pass gradeLevelId to
  // pick the level-appropriate scale (e.g. Primary A–F vs JHS 1–9).
  async deriveGrade(schoolId: string, percentage: number, gradeLevelId?: string): Promise<string | null> {
    const band = await this.deriveBand(schoolId, percentage, gradeLevelId);
    return band?.label ?? null;
  }

  // Returns the full matching band (label + remark) for a percentage.
  async deriveBand(schoolId: string, percentage: number, gradeLevelId?: string) {
    const scale = await this.getActiveScale(schoolId, gradeLevelId);
    if (!scale) return null;
    return (
      scale.bands.find(
        (b) => percentage >= Number(b.minScore) && percentage <= Number(b.maxScore),
      ) ?? null
    );
  }
}
