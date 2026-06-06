import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateReportCardConfigDto } from './dto/report-card-config.dto';

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
}
