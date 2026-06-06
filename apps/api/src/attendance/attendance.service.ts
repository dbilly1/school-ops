import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import { BulkMarkAttendanceDto, MarkStaffAttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
  ) {}

  // ── Student Attendance ────────────────────────────────────

  async getClassAttendance(schoolId: string, classId: string, date: string) {
    const dateObj = new Date(date);
    const students = await this.prisma.studentClassAssignment.findMany({
      where: { classId },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: {
        schoolId,
        classId,
        date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
    });

    const recordMap = new Map(records.map((r) => [r.studentId, r]));

    return {
      date,
      classId,
      isSchoolDay: await this.calendar.isSchoolDay(schoolId, dateObj),
      students: students.map(({ student }) => ({
        student,
        record: recordMap.get(student.id) ?? null,
      })),
    };
  }

  async bulkMark(schoolId: string, dto: BulkMarkAttendanceDto, markedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay)
      throw new BadRequestException('Cannot mark attendance on a non-school day');

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.studentAttendanceRecord.upsert({
          where: { studentId_date: { studentId: entry.studentId, date: dateObj } },
          update: { status: entry.status, notes: entry.notes, markedBy },
          create: {
            schoolId,
            studentId: entry.studentId,
            classId: dto.classId,
            date: dateObj,
            status: entry.status,
            notes: entry.notes,
            markedBy,
          },
        }),
      ),
    );

    return { marked: dto.entries.length, date: dto.date, classId: dto.classId };
  }

  async getStudentAttendance(schoolId: string, studentId: string, startDate: string, endDate: string) {
    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: {
        schoolId,
        studentId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'asc' },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    return { records, summary: { total, present, absent, rate } };
  }

  async getClassAttendanceSummary(schoolId: string, classId: string, startDate: string, endDate: string) {
    const students = await this.prisma.studentClassAssignment.findMany({
      where: { classId },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
    });

    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: {
        schoolId, classId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    });

    return students.map(({ student }) => {
      const studentRecords = records.filter((r) => r.studentId === student.id);
      const total = studentRecords.length;
      const present = studentRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
      const absent = studentRecords.filter((r) => r.status === 'ABSENT').length;
      return {
        student,
        total, present, absent,
        rate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });
  }

  // ── Staff Attendance ──────────────────────────────────────

  async markStaffAttendance(schoolId: string, dto: MarkStaffAttendanceDto, markedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay)
      throw new BadRequestException('Cannot mark attendance on a non-school day');

    return this.prisma.staffAttendanceRecord.upsert({
      where: { userId_date: { userId: dto.userId, date: dateObj } },
      update: { status: dto.status, notes: dto.notes },
      create: { schoolId, userId: dto.userId, date: dateObj, status: dto.status, notes: dto.notes },
    });
  }

  async getStaffAttendance(schoolId: string, date: string) {
    const dateObj = new Date(date);
    const users = await this.prisma.user.findMany({
      where: { schoolId, isActive: true },
      select: { id: true, firstName: true, lastName: true, roles: { select: { role: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const records = await this.prisma.staffAttendanceRecord.findMany({
      where: {
        schoolId,
        date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
    });

    const recordMap = new Map(records.map((r) => [r.userId, r]));
    return {
      date,
      staff: users.map((u) => ({ user: u, record: recordMap.get(u.id) ?? null })),
    };
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
