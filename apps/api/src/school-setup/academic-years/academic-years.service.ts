import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicYearDto, UpdateTermDto } from './dto/academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(private prisma: PrismaService) {}

  async findAll(schoolId: string) {
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      include: { terms: { orderBy: { sequence: 'asc' } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async findActive(schoolId: string) {
    return this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    });
  }

  async create(schoolId: string, dto: CreateAcademicYearDto) {
    const existing = await this.prisma.academicYear.findFirst({
      where: { schoolId, name: dto.name },
    });
    if (existing) throw new ConflictException('Academic year with this name already exists');

    const yearStart = dto.startDate ? new Date(dto.startDate) : null;
    const yearEnd   = dto.endDate   ? new Date(dto.endDate)   : null;

    if (yearStart && yearEnd && yearEnd <= yearStart)
      throw new BadRequestException('End date must be after start date');

    // Auto-activate if this is the first academic year for the school
    const existingCount = await this.prisma.academicYear.count({ where: { schoolId } });
    const shouldActivate = existingCount === 0;

    return this.prisma.$transaction(async (tx) => {
      // Deactivate any current active year if we're activating the new one
      if (shouldActivate) {
        await tx.academicYear.updateMany({ where: { schoolId, isActive: true }, data: { isActive: false } });
      }

      const year = await tx.academicYear.create({
        data: {
          schoolId,
          name: dto.name,
          startDate: yearStart,
          endDate: yearEnd,
          isActive: shouldActivate,
        },
      });

      // Use provided terms if supplied, otherwise auto-scaffold
      let termsData: { schoolId: string; academicYearId: string; name: string; startDate: Date | null; endDate: Date | null; sequence: number }[];

      if (dto.terms && dto.terms.length > 0) {
        termsData = dto.terms.map(t => ({
          schoolId,
          academicYearId: year.id,
          name: t.name,
          startDate: t.startDate ? new Date(t.startDate) : null,
          endDate:   t.endDate   ? new Date(t.endDate)   : null,
          sequence: t.sequence,
        }));
      } else {
        const count = dto.numberOfTerms ?? 3;
        termsData = Array.from({ length: count }, (_, i) => ({
          schoolId,
          academicYearId: year.id,
          name: `Term ${i + 1}`,
          startDate: null,
          endDate: null,
          sequence: i + 1,
        }));
      }

      await tx.term.createMany({ data: termsData });

      return tx.academicYear.findUnique({
        where: { id: year.id },
        include: { terms: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async setActive(schoolId: string, yearId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: yearId, schoolId },
    });
    if (!year) throw new NotFoundException('Academic year not found');

    // Check overlap setting
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    const currentActive = await this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true },
    });

    return this.prisma.$transaction(async (tx) => {
      if (currentActive && currentActive.id !== yearId) {
        await tx.academicYear.update({
          where: { id: currentActive.id },
          data: { isActive: false },
        });
      }
      return tx.academicYear.update({
        where: { id: yearId },
        data: { isActive: true },
      });
    });
  }

  async updateTerm(schoolId: string, termId: string, dto: UpdateTermDto) {
    const term = await this.prisma.term.findFirst({
      where: { id: termId, schoolId },
    });
    if (!term) throw new NotFoundException('Term not found');

    return this.prisma.term.update({
      where: { id: termId },
      data: {
        name: dto.name,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async setActiveTerm(schoolId: string, termId: string) {
    const term = await this.prisma.term.findFirst({
      where: { id: termId, schoolId },
      include: { academicYear: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.term.updateMany({
        where: { academicYearId: term.academicYearId },
        data: { isActive: false },
      });
      return tx.term.update({
        where: { id: termId },
        data: { isActive: true },
      });
    });
  }
}
