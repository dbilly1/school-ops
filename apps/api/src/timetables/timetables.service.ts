import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimetableConfigDto, UpdateTimetableConfigDto, UpsertSlotDto } from './dto/timetable.dto';

interface ClashWarning {
  teacherId: string;
  teacherName: string;
  day: string;
  periodNumber: number;
  classes: string[];
}

@Injectable()
export class TimetablesService {
  constructor(private prisma: PrismaService) {}

  // ── Config ────────────────────────────────────────────────

  async getConfig(schoolId: string, termId: string) {
    return this.prisma.timetableConfig.findFirst({
      where: { schoolId, termId },
      include: {
        breaks: { orderBy: { afterPeriod: 'asc' } },
        term: { select: { id: true, name: true } },
      },
    });
  }

  async createConfig(schoolId: string, dto: CreateTimetableConfigDto) {
    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const existing = await this.prisma.timetableConfig.findFirst({
      where: { schoolId, termId: dto.termId },
    });
    if (existing) throw new ConflictException('Timetable config already exists for this term');

    const { breaks, ...configData } = dto;
    return this.prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: term.academicYearId,
        ...configData,
        breaks: breaks ? { create: breaks } : undefined,
      },
      include: { breaks: { orderBy: { afterPeriod: 'asc' } } },
    });
  }

  async updateConfig(schoolId: string, termId: string, dto: UpdateTimetableConfigDto) {
    const config = await this.prisma.timetableConfig.findFirst({ where: { schoolId, termId } });
    if (!config) throw new NotFoundException('Timetable config not found for this term');

    const { breaks, ...fields } = dto;
    const newBreaks = (breaks ?? []).filter(b => b.afterPeriod > 0);

    return this.prisma.$transaction(async (tx) => {
      // Delete existing breaks first, then recreate
      await tx.timetableBreak.deleteMany({ where: { timetableConfigId: config.id } });

      return tx.timetableConfig.update({
        where: { id: config.id },
        data: {
          periodsPerDay:         fields.periodsPerDay,
          periodDurationMinutes: fields.periodDurationMinutes,
          schoolDays:            fields.schoolDays,
          breaks: newBreaks.length
            ? { create: newBreaks.map(b => ({ afterPeriod: b.afterPeriod, durationMinutes: b.durationMinutes, label: b.label ?? null })) }
            : undefined,
        },
        include: { breaks: { orderBy: { afterPeriod: 'asc' } } },
      });
    });
  }

  // ── Slots ─────────────────────────────────────────────────

  async getClassTimetable(schoolId: string, classId: string, termId: string) {
    const config = await this.prisma.timetableConfig.findFirst({
      where: { schoolId, termId },
      include: { breaks: true },
    });

    const slots = await this.prisma.timetableSlot.findMany({
      where: { schoolId, classId, timetableConfigId: config?.id },
      include: {
        subject: { select: { id: true, name: true } },
      },
      orderBy: [{ day: 'asc' }, { periodNumber: 'asc' }],
    });

    const clashes = await this.detectClashes(schoolId, config?.id);
    return { config, slots, clashes };
  }

  async getTeacherTimetable(schoolId: string, userId: string, termId: string) {
    const profile = await this.prisma.staffProfile.findFirst({ where: { schoolId, userId } });
    if (!profile) throw new NotFoundException('Staff profile not found');

    const config = await this.prisma.timetableConfig.findFirst({ where: { schoolId, termId } });

    return this.prisma.timetableSlot.findMany({
      where: { schoolId, teacherId: userId, timetableConfigId: config?.id },
      include: {
        subject: { select: { id: true, name: true } },
        class: { include: { gradeLevel: { select: { id: true, name: true } } } },
      },
      orderBy: [{ day: 'asc' }, { periodNumber: 'asc' }],
    });
  }

  async upsertSlot(schoolId: string, dto: UpsertSlotDto, termId: string) {
    const config = await this.prisma.timetableConfig.findFirst({ where: { schoolId, termId } });
    if (!config) throw new NotFoundException('Timetable config not found for this term');

    const slot = await this.prisma.timetableSlot.upsert({
      where: {
        classId_timetableConfigId_day_periodNumber: {
          classId: dto.classId,
          timetableConfigId: config.id,
          day: dto.day,
          periodNumber: dto.periodNumber,
        },
      },
      update: {
        slotType: dto.slotType ?? 'LESSON',
        subjectId: dto.subjectId ?? null,
        teacherId: dto.teacherId ?? null,
      },
      create: {
        schoolId,
        classId: dto.classId,
        timetableConfigId: config.id,
        day: dto.day,
        periodNumber: dto.periodNumber,
        slotType: dto.slotType ?? 'LESSON',
        subjectId: dto.subjectId ?? null,
        teacherId: dto.teacherId ?? null,
      },
      include: { subject: { select: { id: true, name: true } } },
    });

    // Return slot + any clashes
    const clashes = await this.detectClashes(schoolId, config.id);
    const relevantClashes = clashes.filter(
      (c) => c.day === dto.day && c.periodNumber === dto.periodNumber,
    );

    return { slot, clashes: relevantClashes };
  }

  async clearSlot(schoolId: string, classId: string, day: string, periodNumber: number, termId: string) {
    const config = await this.prisma.timetableConfig.findFirst({ where: { schoolId, termId } });
    if (!config) throw new NotFoundException('Timetable config not found');

    const slot = await this.prisma.timetableSlot.findFirst({
      where: { schoolId, classId, timetableConfigId: config.id, day, periodNumber },
    });
    if (!slot) throw new NotFoundException('Slot not found');

    return this.prisma.timetableSlot.delete({ where: { id: slot.id } });
  }

  async getClashReport(schoolId: string, termId: string): Promise<ClashWarning[]> {
    const config = await this.prisma.timetableConfig.findFirst({ where: { schoolId, termId } });
    if (!config) return [];
    return this.detectClashes(schoolId, config.id);
  }

  // ── Clash Detection ───────────────────────────────────────

  private async detectClashes(schoolId: string, configId?: string): Promise<ClashWarning[]> {
    if (!configId) return [];

    const slots = await this.prisma.timetableSlot.findMany({
      where: { schoolId, timetableConfigId: configId, teacherId: { not: null }, slotType: 'LESSON' },
      include: {
        class: { select: { name: true } },
      },
    });

    const clashes: ClashWarning[] = [];
    const grouped = new Map<string, typeof slots>();

    for (const slot of slots) {
      const key = `${slot.teacherId}|${slot.day}|${slot.periodNumber}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(slot);
    }

    for (const [key, group] of grouped.entries()) {
      if (group.length > 1) {
        const [teacherId, day, periodNumber] = key.split('|');
        clashes.push({
          teacherId,
          teacherName: teacherId,
          day,
          periodNumber: Number(periodNumber),
          classes: group.map((s) => s.class.name),
        });
      }
    }

    return clashes;
  }
}
