import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto, AssignSubjectToGradeLevelDto } from './dto/subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(schoolId: string, gradeLevelId?: string) {
    return this.prisma.subject.findMany({
      where: {
        schoolId,
        ...(gradeLevelId
          ? { gradeLevels: { some: { gradeLevelId } } }
          : {}),
      },
      include: {
        gradeLevels: { include: { gradeLevel: { select: { id: true, name: true } } } },
        _count: { select: { subjectAssignments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(schoolId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, schoolId },
      include: {
        gradeLevels: { include: { gradeLevel: { select: { id: true, name: true } } } },
        subjectAssignments: {
          include: {
            staffProfile: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  async create(schoolId: string, dto: CreateSubjectDto) {
    const existing = await this.prisma.subject.findFirst({
      where: { schoolId, name: dto.name },
    });
    if (existing) throw new ConflictException('Subject with this name already exists');

    return this.prisma.subject.create({
      data: {
        schoolId,
        name: dto.name,
        code: dto.code,
        gradeLevels: dto.gradeLevelIds
          ? { create: dto.gradeLevelIds.map((gradeLevelId) => ({ gradeLevelId })) }
          : undefined,
      },
      include: {
        gradeLevels: { include: { gradeLevel: { select: { id: true, name: true } } } },
      },
    });
  }

  async update(schoolId: string, id: string, dto: UpdateSubjectDto) {
    const subject = await this.prisma.subject.findFirst({ where: { id, schoolId } });
    if (!subject) throw new NotFoundException('Subject not found');
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  async delete(schoolId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, schoolId },
      include: {
        _count: {
          select: { assessments: true },
        },
      },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    // Block deletion if assessments already exist — scores are tied to them
    if (subject._count.assessments > 0)
      throw new ConflictException(
        'Cannot delete a subject that has assessments. Archive or remove the assessments first.',
      );

    // Clean up remaining child records, then delete
    return this.prisma.$transaction([
      this.prisma.gradeLevelSubject.deleteMany({ where: { subjectId: id } }),
      this.prisma.teacherSubjectAssignment.deleteMany({ where: { subjectId: id } }),
      this.prisma.timetableSlot.deleteMany({ where: { subjectId: id } }),
      this.prisma.subject.delete({ where: { id } }),
    ]);
  }

  // Apply the platform GES curriculum catalog to this school: for every grade
  // level tagged with a levelType, create the matching subjects (deduped by name)
  // and link them to that level. Idempotent — safe to run repeatedly.
  async applyCurriculum(schoolId: string) {
    const gradeLevels = await this.prisma.gradeLevel.findMany({
      where: { schoolId, levelType: { not: null } },
      select: { id: true, levelType: true },
    });
    if (gradeLevels.length === 0) {
      return { subjectsCreated: 0, linksCreated: 0, message: 'Tag your grade levels with a level type (KG / Primary / JHS) first.' };
    }

    const catalog = await this.prisma.curriculumSubject.findMany();
    const namesByLevel = new Map<string, string[]>();
    for (const c of catalog) {
      const arr = namesByLevel.get(c.levelType) ?? [];
      arr.push(c.name);
      namesByLevel.set(c.levelType, arr);
    }

    const existing = await this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true } });
    const subjectIdByName = new Map(existing.map((s) => [s.name, s.id]));

    let subjectsCreated = 0;
    let linksCreated = 0;

    for (const gl of gradeLevels) {
      const names = namesByLevel.get(gl.levelType as string) ?? [];
      for (const name of names) {
        let subjectId = subjectIdByName.get(name);
        if (!subjectId) {
          const created = await this.prisma.subject.create({ data: { schoolId, name } });
          subjectId = created.id;
          subjectIdByName.set(name, subjectId);
          subjectsCreated++;
        }
        const link = await this.prisma.gradeLevelSubject.findFirst({
          where: { gradeLevelId: gl.id, subjectId },
        });
        if (!link) {
          await this.prisma.gradeLevelSubject.create({ data: { gradeLevelId: gl.id, subjectId } });
          linksCreated++;
        }
      }
    }

    return { subjectsCreated, linksCreated };
  }

  async assignToGradeLevel(schoolId: string, id: string, dto: AssignSubjectToGradeLevelDto) {
    const subject = await this.prisma.subject.findFirst({ where: { id, schoolId } });
    if (!subject) throw new NotFoundException('Subject not found');

    const gradeLevel = await this.prisma.gradeLevel.findFirst({
      where: { id: dto.gradeLevelId, schoolId },
    });
    if (!gradeLevel) throw new NotFoundException('Grade level not found');

    const existing = await this.prisma.gradeLevelSubject.findFirst({
      where: { gradeLevelId: dto.gradeLevelId, subjectId: id },
    });
    if (existing) throw new ConflictException('Subject already assigned to this grade level');

    return this.prisma.gradeLevelSubject.create({
      data: { gradeLevelId: dto.gradeLevelId, subjectId: id },
      include: { gradeLevel: { select: { id: true, name: true } } },
    });
  }

  async removeFromGradeLevel(schoolId: string, subjectId: string, gradeLevelId: string) {
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
    if (!subject) throw new NotFoundException('Subject not found');

    const link = await this.prisma.gradeLevelSubject.findFirst({
      where: { subjectId, gradeLevelId },
    });
    if (!link) throw new NotFoundException('Assignment not found');

    return this.prisma.gradeLevelSubject.delete({ where: { id: link.id } });
  }
}
