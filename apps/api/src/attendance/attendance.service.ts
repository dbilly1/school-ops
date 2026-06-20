import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import { TeacherScopeService } from '../staff/teacher-scope.service';
import { StaffRole } from '@prisma/client';
import { BulkMarkAttendanceDto, MarkStaffAttendanceDto } from './dto/attendance.dto';

type Caller = { id: string; roles: StaffRole[] };

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
    private teacherScope: TeacherScopeService,
  ) {}

  // ── Student Attendance ────────────────────────────────────

  async getClassAttendance(schoolId: string, classId: string, date: string, caller: Caller) {
    await this.teacherScope.assertClassTeacher(caller.id, caller.roles, classId);
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

  async bulkMark(schoolId: string, dto: BulkMarkAttendanceDto, caller: Caller) {
    await this.teacherScope.assertClassTeacher(caller.id, caller.roles, dto.classId);

    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay)
      throw new BadRequestException('Cannot mark attendance on a non-school day');

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    const markedBy = caller.id;

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

  async getClassAttendanceSummary(schoolId: string, classId: string, startDate: string, endDate: string, caller: Caller) {
    await this.teacherScope.assertClassTeacher(caller.id, caller.roles, classId);
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

  // ── Coverage ──────────────────────────────────────────────
  // Which classes have / haven't had attendance marked across a date range.
  // Admins see every class; a restricted teacher sees only the classes they
  // class-teach. "Marked" for a day = at least one record exists for that
  // class+date, which matches bulkMark (it writes a row per student on save).
  // Returns every calendar day in range typed (school/weekend/holiday/off) so the
  // UI can render a day-grid that strikes non-school days, plus per-class marked /
  // missing summaries for longer ranges. Missing only ever counts school days.
  async getCoverage(schoolId: string, startStr: string, endStr: string, caller: Caller) {
    const restricted = this.teacherScope.isRestricted(caller.roles);
    const scopedClassIds = restricted
      ? await this.teacherScope.classTeacherClassIdsForUser(caller.id)
      : null;

    // Parse + clamp the range to a sane span (max ~1 year) to bound the scan.
    const today = new Date().toISOString().slice(0, 10);
    let start = /^\d{4}-\d{2}-\d{2}$/.test(startStr) ? startStr : today;
    let end = /^\d{4}-\d{2}-\d{2}$/.test(endStr) ? endStr : today;
    if (start > end) [start, end] = [end, start];

    let startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);

    // Cap the span at ~1 year so an extreme custom range can't blow up the scan.
    const MAX_DAYS = 366;
    if ((endDate.getTime() - startDate.getTime()) / 86_400_000 > MAX_DAYS) {
      startDate = new Date(endDate.getTime() - MAX_DAYS * 86_400_000);
      start = startDate.toISOString().slice(0, 10);
    }

    const { termStart, termEnd, days } = await this.calendar.classifyDaysInRange(schoolId, startDate, endDate);
    const schoolDays = days.filter((d) => d.type === 'school').map((d) => d.date);
    const schoolDaySet = new Set(schoolDays);

    const base = { restricted, start, end, termStart, termEnd, days, schoolDayCount: schoolDays.length };

    if ((scopedClassIds && scopedClassIds.length === 0) || schoolDays.length === 0) {
      return { ...base, classes: [] };
    }

    const classes = await this.prisma.class.findMany({
      where: { schoolId, ...(scopedClassIds ? { id: { in: scopedClassIds } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: {
        schoolId,
        date: { gte: startDate, lte: endDate },
        ...(scopedClassIds ? { classId: { in: scopedClassIds } } : {}),
      },
      select: { classId: true, date: true },
      distinct: ['classId', 'date'],
    });

    // class → set of school-day dates that have records
    const markedByClass = new Map<string, Set<string>>();
    for (const r of records) {
      const d = r.date.toISOString().slice(0, 10);
      if (!schoolDaySet.has(d)) continue;
      (markedByClass.get(r.classId) ?? markedByClass.set(r.classId, new Set()).get(r.classId)!).add(d);
    }

    return {
      ...base,
      classes: classes.map((c) => {
        const marked = markedByClass.get(c.id) ?? new Set<string>();
        const missingDates = schoolDays.filter((d) => !marked.has(d));
        return {
          id: c.id,
          name: c.name,
          markedDates: schoolDays.filter((d) => marked.has(d)),
          missingDates,
          markedCount: schoolDays.length - missingDates.length,
          missingCount: missingDates.length,
        };
      }),
    };
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
