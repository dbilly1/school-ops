import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlannerEntryDto, UpdatePlannerEntryDto } from './dto/planner.dto';

// Personal planner — every query is scoped to the calling user (entries are
// private). schoolId is also stored for tenant isolation, but ownership is by
// userId. Class/subject tags are optional and validated against the school.
@Injectable()
export class PlannerService {
  constructor(private prisma: PrismaService) {}

  // A YYYY-MM-DD string → that calendar day at UTC midnight, so day grouping is
  // stable regardless of server timezone.
  private dayUtc(dateStr: string): Date {
    const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new BadRequestException('Invalid date');
    return d;
  }

  // List the user's entries within an inclusive [start, end] date range
  // (defaults to today when omitted), ordered for day-by-day rendering.
  async list(schoolId: string, userId: string, start?: string, end?: string) {
    const startDate = start ? this.dayUtc(start) : this.dayUtc(new Date().toISOString());
    const endDay = end ? this.dayUtc(end) : startDate;
    const endDate = new Date(endDay.getTime() + 24 * 60 * 60 * 1000 - 1); // end-of-day

    return this.prisma.plannerEntry.findMany({
      where: { schoolId, userId, date: { gte: startDate, lte: endDate } },
      orderBy: [{ date: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });
  }

  async create(schoolId: string, userId: string, dto: CreatePlannerEntryDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');

    await this.assertTags(schoolId, dto.classId, dto.subjectId);

    return this.prisma.plannerEntry.create({
      data: {
        schoolId,
        userId,
        title,
        date: this.dayUtc(dto.date),
        notes: dto.notes?.trim() || null,
        color: dto.color || null,
        classId: dto.classId || null,
        subjectId: dto.subjectId || null,
        status: dto.status ?? undefined,
        position: dto.position ?? undefined,
      },
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });
  }

  async update(schoolId: string, userId: string, id: string, dto: UpdatePlannerEntryDto) {
    const entry = await this.prisma.plannerEntry.findFirst({ where: { id, schoolId, userId } });
    if (!entry) throw new NotFoundException('Planner entry not found');

    if (dto.classId !== undefined || dto.subjectId !== undefined) {
      await this.assertTags(schoolId, dto.classId || undefined, dto.subjectId || undefined);
    }

    const data: Prisma.PlannerEntryUpdateInput = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Title is required');
      data.title = title;
    }
    if (dto.date !== undefined) data.date = this.dayUtc(dto.date);
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.color !== undefined) data.color = dto.color || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.position !== undefined) data.position = dto.position;
    // Empty string clears the tag.
    if (dto.classId !== undefined) data.class = dto.classId ? { connect: { id: dto.classId } } : { disconnect: true };
    if (dto.subjectId !== undefined) data.subject = dto.subjectId ? { connect: { id: dto.subjectId } } : { disconnect: true };

    return this.prisma.plannerEntry.update({
      where: { id },
      data,
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });
  }

  async remove(schoolId: string, userId: string, id: string) {
    const entry = await this.prisma.plannerEntry.findFirst({ where: { id, schoolId, userId } });
    if (!entry) throw new NotFoundException('Planner entry not found');
    await this.prisma.plannerEntry.delete({ where: { id } });
    return { deleted: true };
  }

  // Optional class/subject tags must belong to this school.
  private async assertTags(schoolId: string, classId?: string, subjectId?: string) {
    if (classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } });
      if (!cls) throw new BadRequestException('Class not found');
    }
    if (subjectId) {
      const subj = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } });
      if (!subj) throw new BadRequestException('Subject not found');
    }
  }
}
