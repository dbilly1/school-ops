import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateReportCardConfigDto, UpdateCategoryWeightsDto } from './dto/report-card-config.dto';

@Injectable()
export class ReportCardConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(schoolId: string) {
    let config = await this.prisma.reportCardConfig.findUnique({
      where: { schoolId },
      include: { customSections: { orderBy: { position: 'asc' } } },
    });

    if (!config) {
      config = await this.prisma.reportCardConfig.create({
        data: { schoolId },
        include: { customSections: { orderBy: { position: 'asc' } } },
      });
    }

    return config;
  }

  async updateConfig(schoolId: string, dto: UpdateReportCardConfigDto) {
    const { customSections, ...configData } = dto;

    // SBA + exam weights must sum to 100 when both are supplied.
    if (configData.sbaWeight !== undefined && configData.examWeight !== undefined) {
      if (Math.round(configData.sbaWeight + configData.examWeight) !== 100) {
        throw new BadRequestException('Class-score and exam weights must add up to 100%.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (customSections !== undefined) {
        const config = await tx.reportCardConfig.findUnique({ where: { schoolId } });
        if (config) {
          await tx.reportCardCustomSection.deleteMany({
            where: { reportCardConfigId: config.id },
          });
        }
      }

      return tx.reportCardConfig.upsert({
        where: { schoolId },
        update: {
          ...configData,
          ...(customSections
            ? { customSections: { create: customSections } }
            : {}),
        },
        create: {
          schoolId,
          ...configData,
          ...(customSections
            ? { customSections: { create: customSections } }
            : {}),
        },
        include: { customSections: { orderBy: { position: 'asc' } } },
      });
    });
  }

  // ── Per-category SBA weights ──────────────────────────────
  // No rows = equal weighting across whichever SBA categories a student has.

  async getCategoryWeights(schoolId: string) {
    return this.prisma.assessmentCategoryWeight.findMany({ where: { schoolId } });
  }

  async updateCategoryWeights(schoolId: string, dto: UpdateCategoryWeightsDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentCategoryWeight.deleteMany({ where: { schoolId } });
      if (dto.weights.length > 0) {
        await tx.assessmentCategoryWeight.createMany({
          data: dto.weights.map((w) => ({ schoolId, category: w.category, weight: w.weight })),
        });
      }
      return tx.assessmentCategoryWeight.findMany({ where: { schoolId } });
    });
  }
}
