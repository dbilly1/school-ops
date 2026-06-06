import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGradeLevelDto, CreateClassDto, UpdateGradeLevelDto, BulkCreateGradeLevelsDto } from './dto/grade-structure.dto';

@Injectable()
export class GradeStructureService {
  constructor(private prisma: PrismaService) {}

  // ── Grade Levels ──────────────────────────────────────────

  async findAllGradeLevels(schoolId: string) {
    return this.prisma.gradeLevel.findMany({
      where: { schoolId },
      include: { _count: { select: { classes: true } } },
      orderBy: { sequence: 'asc' },
    });
  }

  // ── Bulk create (onboarding) ──────────────────────────────

  async bulkCreateGradeLevels(schoolId: string, dto: BulkCreateGradeLevelsDto) {
    const levels = dto.levels.filter(l => l.name.trim());

    // 1. Fetch all existing grade levels for this school in one query
    const existing = await this.prisma.gradeLevel.findMany({
      where: { schoolId },
      select: { id: true, name: true, sequence: true },
    });
    const existingByName = new Map(existing.map(g => [g.name, g]));
    const existingSeqs   = new Set(existing.map(g => g.sequence));

    // 2. Separate new entries from already-existing ones
    const toCreate = levels.filter(l => !existingByName.has(l.name.trim()));

    // 3. Insert all new grade levels in a single createMany call
    if (toCreate.length > 0) {
      await this.prisma.gradeLevel.createMany({
        data: toCreate.map(l => ({
          schoolId,
          name: l.name.trim(),
          sequence: existingSeqs.has(l.sequence) ? l.sequence + 1000 : l.sequence,
        })),
        skipDuplicates: true,
      });

      // Re-fetch to get the assigned IDs
      const fresh = await this.prisma.gradeLevel.findMany({
        where: { schoolId },
        select: { id: true, name: true, sequence: true },
      });
      fresh.forEach(g => existingByName.set(g.name, g));
    }

    // 4. Create Class records (classes are permanent — not tied to academic year)
    const existingClasses = await this.prisma.class.findMany({
      where: { schoolId },
      select: { name: true },
    });
    const existingClassNames = new Set(existingClasses.map(c => c.name));

    const classRows: { schoolId: string; gradeLevelId: string; name: string }[] = [];
    for (const item of levels) {
      const gl = existingByName.get(item.name.trim());
      if (!gl) continue;

      if (item.classes.length === 0) {
        // No sub-classes — the grade level itself is the single class
        const className = item.name.trim();
        if (!existingClassNames.has(className)) {
          classRows.push({ schoolId, gradeLevelId: gl.id, name: className });
        }
      } else {
        for (const cls of item.classes) {
          const className = `${item.name.trim()} ${cls}`;
          if (!existingClassNames.has(className)) {
            classRows.push({ schoolId, gradeLevelId: gl.id, name: className });
          }
        }
      }
    }

    if (classRows.length > 0) {
      await this.prisma.class.createMany({ data: classRows, skipDuplicates: true });
    }

    return { saved: levels.length };
  }

  async createGradeLevel(schoolId: string, dto: CreateGradeLevelDto) {
    const existing = await this.prisma.gradeLevel.findFirst({
      where: { schoolId, name: dto.name },
    });
    if (existing) throw new ConflictException('Grade level with this name already exists');

    return this.prisma.gradeLevel.create({
      data: { schoolId, name: dto.name, sequence: dto.sequence },
    });
  }

  async updateGradeLevel(schoolId: string, id: string, dto: UpdateGradeLevelDto) {
    const level = await this.prisma.gradeLevel.findFirst({ where: { id, schoolId } });
    if (!level) throw new NotFoundException('Grade level not found');
    return this.prisma.gradeLevel.update({ where: { id }, data: dto });
  }

  async deleteGradeLevel(schoolId: string, id: string) {
    const level = await this.prisma.gradeLevel.findFirst({
      where: { id, schoolId },
      include: { _count: { select: { classes: true } } },
    });
    if (!level) throw new NotFoundException('Grade level not found');
    if (level._count.classes > 0)
      throw new ConflictException('Cannot delete a grade level that has classes');
    return this.prisma.gradeLevel.delete({ where: { id } });
  }

  // ── Classes ───────────────────────────────────────────────

  async findClassesByGrade(schoolId: string, gradeLevelId: string) {
    return this.prisma.class.findMany({
      where: { schoolId, gradeLevelId },
      include: {
        gradeLevel: { select: { id: true, name: true } },
        _count: { select: { studentAssignments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findAllClasses(schoolId: string) {
    return this.prisma.class.findMany({
      where: { schoolId },
      include: {
        gradeLevel: { select: { id: true, name: true, sequence: true } },
        _count: { select: { studentAssignments: true } },
      },
      orderBy: [{ gradeLevel: { sequence: 'asc' } }, { name: 'asc' }],
    });
  }

  async createClass(schoolId: string, dto: CreateClassDto) {
    const gradeLevel = await this.prisma.gradeLevel.findFirst({
      where: { id: dto.gradeLevelId, schoolId },
    });
    if (!gradeLevel) throw new NotFoundException('Grade level not found');

    const existing = await this.prisma.class.findFirst({
      where: { schoolId, name: dto.name },
    });
    if (existing) throw new ConflictException('A class with this name already exists');

    return this.prisma.class.create({
      data: { schoolId, gradeLevelId: dto.gradeLevelId, name: dto.name },
      include: { gradeLevel: { select: { id: true, name: true } } },
    });
  }

  async deleteClass(schoolId: string, classId: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, schoolId },
      include: { _count: { select: { studentAssignments: true } } },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls._count.studentAssignments > 0)
      throw new ConflictException('Cannot delete a class that has students assigned');
    return this.prisma.class.delete({ where: { id: classId } });
  }

  /**
   * Ensures at least one Class record exists for every GradeLevel.
   * Safe to call multiple times — only creates what's missing.
   */
  async ensureClasses(schoolId: string) {
    const gradeLevels = await this.prisma.gradeLevel.findMany({
      where: { schoolId },
      orderBy: { sequence: 'asc' },
      select: { id: true, name: true },
    });
    if (gradeLevels.length === 0) return { created: 0, message: 'No grade levels found' };

    const existing = await this.prisma.class.findMany({
      where: { schoolId },
      select: { gradeLevelId: true },
    });
    const coveredGradeLevelIds = new Set(existing.map(c => c.gradeLevelId));

    const toCreate = gradeLevels.filter(g => !coveredGradeLevelIds.has(g.id));
    if (toCreate.length === 0) return { created: 0, message: 'All grade levels already have classes' };

    await this.prisma.class.createMany({
      data: toCreate.map(g => ({ schoolId, gradeLevelId: g.id, name: g.name })),
    });

    return { created: toCreate.length };
  }
}
