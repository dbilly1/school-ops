import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeedingConfigDto } from './dto/feeding-config.dto';

@Injectable()
export class FeedingConfigService {
  constructor(private prisma: PrismaService) {}

  async getCurrent(schoolId: string) {
    return this.prisma.feedingConfig.findFirst({
      where: { schoolId },
      include: { classRates: { include: { gradeLevel: { select: { id: true, name: true } } } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async getAll(schoolId: string) {
    return this.prisma.feedingConfig.findMany({
      where: { schoolId },
      include: { classRates: { include: { gradeLevel: { select: { id: true, name: true } } } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async create(schoolId: string, dto: CreateFeedingConfigDto) {
    if (dto.rateMode === 'FLAT' && !dto.flatRate) {
      throw new BadRequestException('flatRate is required when rateMode is FLAT');
    }
    if (dto.rateMode === 'PER_CLASS' && (!dto.classRates || dto.classRates.length === 0)) {
      throw new BadRequestException('classRates are required when rateMode is PER_CLASS');
    }

    return this.prisma.feedingConfig.create({
      data: {
        schoolId,
        rateMode: dto.rateMode,
        flatRate: dto.flatRate,
        effectiveFrom: new Date(dto.effectiveFrom),
        classRates: dto.classRates
          ? { create: dto.classRates.map((r) => ({ gradeLevelId: r.gradeLevelId, dailyRate: r.dailyRate })) }
          : undefined,
      },
      include: { classRates: { include: { gradeLevel: { select: { id: true, name: true } } } } },
    });
  }

  // Returns the applicable daily rate for a student given their grade level
  async getDailyRate(schoolId: string, gradeLevelId: string): Promise<number | null> {
    const config = await this.getCurrent(schoolId);
    if (!config) return null;

    if (config.rateMode === 'FLAT') return Number(config.flatRate);

    const classRate = config.classRates.find((r) => r.gradeLevelId === gradeLevelId);
    return classRate ? Number(classRate.dailyRate) : null;
  }
}
