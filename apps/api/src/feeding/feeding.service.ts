import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import { FeedingConfigService } from '../school-setup/feeding-config/feeding-config.service';
import { EnrollStudentDto, RecordPaymentDto, MarkPaidDto } from './dto/feeding.dto';

@Injectable()
export class FeedingService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
    private feedingConfig: FeedingConfigService,
  ) {}

  // ── Enrollment ────────────────────────────────────────────

  async enrollStudent(schoolId: string, dto: EnrollStudentDto) {
    return this.prisma.feedingEnrollment.upsert({
      where: { schoolId_studentId_academicYearId: { schoolId, studentId: dto.studentId, academicYearId: dto.academicYearId } },
      update: { isActive: true },
      create: { schoolId, studentId: dto.studentId, academicYearId: dto.academicYearId, isActive: true },
    });
  }

  async unenrollStudent(schoolId: string, studentId: string, academicYearId: string) {
    return this.prisma.feedingEnrollment.updateMany({
      where: { schoolId, studentId, academicYearId },
      data: { isActive: false },
    });
  }

  // ── Daily Collection Screen ───────────────────────────────

  async getDailyCollection(schoolId: string, classId: string, date: string) {
    const dateObj = new Date(date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);

    // Get gradeLevel so we can look up the daily rate for this class
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { gradeLevelId: true },
    });
    const dailyRate = classRecord?.gradeLevelId
      ? (await this.feedingConfig.getDailyRate(schoolId, classRecord.gradeLevelId)) ?? 0
      : 0;

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    const studentIds = assignments.map((a) => a.student.id);

    const enrolledStudentIds = (
      await this.prisma.feedingEnrollment.findMany({
        where: { schoolId, studentId: { in: studentIds }, isActive: true },
      })
    ).map((e) => e.studentId);

    const [records, attendanceRecords, futurePreCovered] = await Promise.all([
      this.prisma.feedingDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: enrolledStudentIds },
          recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      }),
      this.prisma.studentAttendanceRecord.findMany({
        where: {
          schoolId,
          studentId: { in: enrolledStudentIds },
          date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      }),
      this.prisma.feedingDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: enrolledStudentIds },
          status: 'PRE_COVERED',
          recordDate: { gt: this.endOfDay(dateObj) },
        },
        select: { studentId: true },
      }),
    ]);

    // Count future pre-covered days per student
    const balanceMap = new Map<string, number>();
    for (const r of futurePreCovered) {
      balanceMap.set(r.studentId, (balanceMap.get(r.studentId) ?? 0) + 1);
    }

    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    const attendanceMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));

    const rows = assignments
      .filter((a) => enrolledStudentIds.includes(a.student.id))
      .map(({ student }) => {
        const attendance = attendanceMap.get(student.id);
        const isAbsent = attendance?.status === 'ABSENT';
        const record = recordMap.get(student.id);
        const status = isAbsent ? 'ABSENT' : (record?.status ?? 'UNPAID');
        return {
          student,
          status,
          dailyRate,
          prePaymentBalance: balanceMap.get(student.id) ?? 0,
        };
      });

    const summary = {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      preCovered: rows.filter((r) => r.status === 'PRE_COVERED').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      unpaid: rows.filter((r) => r.status === 'UNPAID').length,
      cashCollected: rows.filter((r) => r.status === 'PAID').reduce((sum, r) => sum + r.dailyRate, 0),
    };

    return { date, classId, isSchoolDay, rows, summary };
  }

  // ── School-wide Daily Collection (all classes) ────────────

  async getSchoolDailyCollection(schoolId: string, date: string) {
    const dateObj = new Date(date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);

    const activeYear = await this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true },
      select: { id: true },
    });

    const classes = await this.prisma.class.findMany({
      where: { schoolId, ...(activeYear ? { academicYearId: activeYear.id } : {}) },
      select: { id: true, name: true, gradeLevelId: true },
      orderBy: [{ gradeLevel: { sequence: 'asc' } }, { name: 'asc' }],
    });

    // Fetch feeding config once and build a rate lookup
    const config = await this.feedingConfig.getCurrent(schoolId);
    const getRateForGrade = (gradeLevelId: string): number => {
      if (!config) return 0;
      if (config.rateMode === 'FLAT') return Number(config.flatRate ?? 0);
      const cr = config.classRates.find((r) => r.gradeLevelId === gradeLevelId);
      return cr ? Number(cr.dailyRate) : 0;
    };

    if (classes.length === 0) {
      return { date, isSchoolDay, classes: [], summary: { total: 0, paid: 0, preCovered: 0, absent: 0, unpaid: 0, cashCollected: 0 } };
    }

    const allAssignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId: { in: classes.map((c) => c.id) } },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    const allStudentIds = [...new Set(allAssignments.map((a) => a.student.id))];

    const enrolledStudentIds = new Set(
      (await this.prisma.feedingEnrollment.findMany({
        where: { schoolId, studentId: { in: allStudentIds }, isActive: true },
        select: { studentId: true },
      })).map((e) => e.studentId),
    );

    const [records, attendanceRecords, futurePreCovered] = await Promise.all([
      this.prisma.feedingDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: [...enrolledStudentIds] },
          recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      }),
      this.prisma.studentAttendanceRecord.findMany({
        where: {
          schoolId,
          studentId: { in: [...enrolledStudentIds] },
          date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      }),
      this.prisma.feedingDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: [...enrolledStudentIds] },
          status: 'PRE_COVERED',
          recordDate: { gt: this.endOfDay(dateObj) },
        },
        select: { studentId: true },
      }),
    ]);

    const balanceMap = new Map<string, number>();
    for (const r of futurePreCovered) {
      balanceMap.set(r.studentId, (balanceMap.get(r.studentId) ?? 0) + 1);
    }
    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    const attendanceMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));

    // Group assignments by classId
    const assignmentsByClass = new Map<string, typeof allAssignments>();
    for (const a of allAssignments) {
      const list = assignmentsByClass.get(a.classId) ?? [];
      list.push(a);
      assignmentsByClass.set(a.classId, list);
    }

    const classesWithRows = classes.map((cls) => {
      const dailyRate = getRateForGrade(cls.gradeLevelId);
      const classAssignments = (assignmentsByClass.get(cls.id) ?? [])
        .filter((a) => enrolledStudentIds.has(a.student.id));

      const rows = classAssignments.map(({ student }) => {
        const attendance = attendanceMap.get(student.id);
        const isAbsent = attendance?.status === 'ABSENT';
        const record = recordMap.get(student.id);
        const status = isAbsent ? 'ABSENT' : (record?.status ?? 'UNPAID');
        return {
          student,
          status,
          dailyRate,
          prePaymentBalance: balanceMap.get(student.id) ?? 0,
        };
      });

      return { classId: cls.id, className: cls.name, rows };
    }).filter((c) => c.rows.length > 0);

    const allRows = classesWithRows.flatMap((c) => c.rows);
    const summary = {
      total: allRows.length,
      paid: allRows.filter((r) => r.status === 'PAID').length,
      preCovered: allRows.filter((r) => r.status === 'PRE_COVERED').length,
      absent: allRows.filter((r) => r.status === 'ABSENT').length,
      unpaid: allRows.filter((r) => r.status === 'UNPAID').length,
      cashCollected: allRows.filter((r) => r.status === 'PAID').reduce((sum, r) => sum + r.dailyRate, 0),
    };

    return { date, isSchoolDay, classes: classesWithRows, summary };
  }

  // Mark a student as paid today (cash collected now)
  async markPaid(schoolId: string, dto: MarkPaidDto, collectedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');

    return this.prisma.feedingDailyRecord.upsert({
      where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: dateObj } },
      update: { status: 'PAID' },
      create: { schoolId, studentId: dto.studentId, recordDate: dateObj, status: 'PAID' },
    });
  }

  // Record a pre-payment — cash received today, future days pre-marked
  async recordPrePayment(schoolId: string, dto: RecordPaymentDto, collectedBy: string) {
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    // Get daily rate for this student
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, schoolId },
      include: {
        classAssignments: {
          include: { class: { include: { gradeLevel: true } } },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const gradeLevelId = student.classAssignments[0]?.class.gradeLevelId;
    const dailyRate = gradeLevelId
      ? await this.feedingConfig.getDailyRate(schoolId, gradeLevelId)
      : null;

    if (!dailyRate) throw new BadRequestException('No feeding rate configured');

    const daysCovered = Math.floor(dto.amount / dailyRate);
    if (daysCovered < 1) throw new BadRequestException('Amount is less than one day\'s rate');

    // Create the payment record
    const payment = await this.prisma.feedingPayment.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        amountPaid: dto.amount,
        paymentDate,
        daysCovered,
        recordedBy: collectedBy,
      },
    });

    // Pre-mark future school days
    const schoolDays = await this.getNextSchoolDays(schoolId, paymentDate, daysCovered);

    await this.prisma.$transaction(
      schoolDays.map((day) =>
        this.prisma.feedingDailyRecord.upsert({
          where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: day } },
          update: { status: 'PRE_COVERED', feedingPaymentId: payment.id },
          create: { schoolId, studentId: dto.studentId, recordDate: day, status: 'PRE_COVERED', feedingPaymentId: payment.id },
        }),
      ),
    );

    return { payment, daysCovered, daysMarked: schoolDays.length };
  }

  // Daily reconciliation — how much cash was collected today
  async getDailyReconciliation(schoolId: string, date: string) {
    const dateObj = new Date(date);

    const payments = await this.prisma.feedingPayment.findMany({
      where: {
        schoolId,
        paymentDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });

    const dailyPaid = await this.prisma.feedingDailyRecord.findMany({
      where: {
        schoolId,
        status: 'PAID',
        recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });

    const totalCashCollected = payments.reduce((sum, p) => sum + Number(p.amountPaid), 0);

    return {
      date,
      cashCollectedToday: totalCashCollected,
      prePayments: payments.map((p) => ({ student: p.student, amount: p.amountPaid, daysCovered: p.daysCovered })),
      paidToday: dailyPaid.map((r) => ({ student: r.student })),
      totalTransactions: payments.length + dailyPaid.length,
    };
  }

  private async getNextSchoolDays(schoolId: string, fromDate: Date, count: number): Promise<Date[]> {
    const days: Date[] = [];
    const current = new Date(fromDate);

    while (days.length < count) {
      current.setDate(current.getDate() + 1);
      const isSchool = await this.calendar.isSchoolDay(schoolId, new Date(current));
      if (isSchool) days.push(new Date(current));
      if (current > new Date(fromDate.getTime() + 365 * 24 * 60 * 60 * 1000)) break; // Safety
    }

    return days;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
  }

  private endOfDay(date: Date): Date {
    const d = new Date(date); d.setHours(23, 59, 59, 999); return d;
  }
}
