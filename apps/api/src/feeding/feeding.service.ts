import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import { FeedingConfigService } from '../school-setup/feeding-config/feeding-config.service';
import {
  EnrollStudentDto, MarkPaidDto,
  FeedingPrepayDto, FeedingRefundDto, FeedingSettleArrearsDto,
} from './dto/feeding.dto';

// Calendar cell states (superset of the DailyFeeStatus enum) — mirrors transport.
type CalendarStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID' | 'NON_SCHOOL' | 'PROJECTED' | 'NONE';

@Injectable()
export class FeedingService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
    private feedingConfig: FeedingConfigService,
  ) {}

  // ── Participation / exemptions ────────────────────────────
  // Feeding is mandatory by default: every class student participates. When the
  // school enables opt-out (FeedingConfig.optOutAllowed), a student is exempt if
  // they have an inactive FeedingEnrollment record.

  private async getParticipatingIds(schoolId: string, candidateIds: string[]): Promise<string[]> {
    if (candidateIds.length === 0) return [];
    const config = await this.feedingConfig.getCurrent(schoolId);
    if (!config?.optOutAllowed) return candidateIds;

    const exempt = new Set(
      (await this.prisma.feedingEnrollment.findMany({
        where: { schoolId, studentId: { in: candidateIds }, isActive: false },
        select: { studentId: true },
      })).map((e) => e.studentId),
    );
    return candidateIds.filter((id) => !exempt.has(id));
  }

  // Exempt a student from feeding (only meaningful when opt-out is allowed).
  async exemptStudent(schoolId: string, studentId: string, academicYearId: string) {
    return this.prisma.feedingEnrollment.upsert({
      where: { schoolId_studentId_academicYearId: { schoolId, studentId, academicYearId } },
      update: { isActive: false },
      create: { schoolId, studentId, academicYearId, isActive: false },
    });
  }

  // Re-include a previously exempted student.
  async includeStudent(schoolId: string, studentId: string, academicYearId: string) {
    return this.prisma.feedingEnrollment.updateMany({
      where: { schoolId, studentId, academicYearId },
      data: { isActive: true },
    });
  }

  private async getActiveYearId(schoolId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true }, select: { id: true },
    });
    if (!year) throw new BadRequestException('No active academic year');
    return year.id;
  }

  async exemptStudentActiveYear(schoolId: string, studentId: string) {
    return this.exemptStudent(schoolId, studentId, await this.getActiveYearId(schoolId));
  }

  async includeStudentActiveYear(schoolId: string, studentId: string) {
    return this.includeStudent(schoolId, studentId, await this.getActiveYearId(schoolId));
  }

  async getExemptStudents(schoolId: string) {
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true }, select: { id: true },
    });
    if (!activeYear) return [];
    const rows = await this.prisma.feedingEnrollment.findMany({
      where: { schoolId, academicYearId: activeYear.id, isActive: false },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
    });
    return rows.map((r) => r.student);
  }

  // Backwards-compatible aliases used by existing enroll/unenroll endpoints.
  enrollStudent(schoolId: string, dto: EnrollStudentDto) {
    return this.includeStudent(schoolId, dto.studentId, dto.academicYearId);
  }
  unenrollStudent(schoolId: string, studentId: string, academicYearId: string) {
    return this.exemptStudent(schoolId, studentId, academicYearId);
  }

  // ── Prepaid balance ───────────────────────────────────────

  private async getStudentBalance(schoolId: string, studentId: string): Promise<number> {
    const [banked, consumed] = await Promise.all([
      this.prisma.feedingPayment.aggregate({
        where: { schoolId, studentId }, _sum: { daysCovered: true },
      }),
      this.prisma.feedingDailyRecord.count({
        where: { schoolId, studentId, status: 'PRE_COVERED' },
      }),
    ]);
    return (banked._sum.daysCovered ?? 0) - consumed;
  }

  private async getStudentArrears(schoolId: string, studentId: string): Promise<number> {
    return this.prisma.feedingDailyRecord.count({
      where: { schoolId, studentId, status: 'UNPAID' },
    });
  }

  // ── Daily Collection Screen (per class) ───────────────────
  // Same reconciliation as transport: consume a banked day for a present student,
  // release a consumed/unpaid day for an absent one, and materialise an UNPAID
  // record (IOU) when a present student is uncovered so arrears accrue.

  async getDailyCollection(schoolId: string, classId: string, date: string) {
    const dateObj = new Date(date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);

    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { gradeLevelId: true },
    });
    if (!classRecord) throw new NotFoundException('Class not found');

    const dailyRate = classRecord.gradeLevelId
      ? (await this.feedingConfig.getDailyRate(schoolId, classRecord.gradeLevelId)) ?? 0
      : 0;

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    const participatingIds = new Set(
      await this.getParticipatingIds(schoolId, assignments.map((a) => a.student.id)),
    );
    const participants = assignments.filter((a) => participatingIds.has(a.student.id));
    const studentIds = participants.map((a) => a.student.id);

    const [records, attendanceRecords, bankedGroups, consumedGroups] = await Promise.all([
      this.prisma.feedingDailyRecord.findMany({
        where: { schoolId, studentId: { in: studentIds }, recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) } },
      }),
      this.prisma.studentAttendanceRecord.findMany({
        where: { schoolId, studentId: { in: studentIds }, date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) } },
      }),
      this.prisma.feedingPayment.groupBy({
        by: ['studentId'], where: { schoolId, studentId: { in: studentIds } }, _sum: { daysCovered: true },
      }),
      this.prisma.feedingDailyRecord.groupBy({
        by: ['studentId'], where: { schoolId, studentId: { in: studentIds }, status: 'PRE_COVERED' }, _count: { _all: true },
      }),
    ]);

    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    const attendanceMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));
    const bankedMap = new Map(bankedGroups.map((g) => [g.studentId, g._sum.daysCovered ?? 0]));
    const consumedMap = new Map(consumedGroups.map((g) => [g.studentId, g._count._all]));

    const reconcilable = isSchoolDay && dateObj <= this.endOfDay(new Date());
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    const baseRows = participants.map(({ student }) => {
      const isAbsent = attendanceMap.get(student.id)?.status === 'ABSENT';
      const existing = recordMap.get(student.id);
      const banked = bankedMap.get(student.id) ?? 0;
      const consumedTotal = consumedMap.get(student.id) ?? 0;

      let status: 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID';

      if (existing?.status === 'PAID') {
        status = 'PAID';
      } else if (isAbsent) {
        status = 'ABSENT';
        if (reconcilable && existing) {
          writes.push(this.prisma.feedingDailyRecord.delete({ where: { id: existing.id } }));
        }
      } else if (!reconcilable) {
        status = existing?.status === 'PRE_COVERED' ? 'PRE_COVERED' : 'UNPAID';
      } else {
        const consumedOther = consumedTotal - (existing?.status === 'PRE_COVERED' ? 1 : 0);
        if (consumedOther < banked) {
          status = 'PRE_COVERED';
          if (!existing) {
            writes.push(this.prisma.feedingDailyRecord.create({
              data: { schoolId, studentId: student.id, recordDate: dateObj, status: 'PRE_COVERED' },
            }));
          } else if (existing.status !== 'PRE_COVERED') {
            writes.push(this.prisma.feedingDailyRecord.update({ where: { id: existing.id }, data: { status: 'PRE_COVERED' } }));
          }
        } else {
          status = 'UNPAID';
          if (!existing) {
            writes.push(this.prisma.feedingDailyRecord.create({
              data: { schoolId, studentId: student.id, recordDate: dateObj, status: 'UNPAID' },
            }));
          } else if (existing.status !== 'UNPAID') {
            writes.push(this.prisma.feedingDailyRecord.update({ where: { id: existing.id }, data: { status: 'UNPAID' } }));
          }
        }
      }
      return { student, status };
    });

    if (writes.length) await this.prisma.$transaction(writes);

    const arrearsGroups = await this.prisma.feedingDailyRecord.groupBy({
      by: ['studentId'], where: { schoolId, studentId: { in: studentIds }, status: 'UNPAID' }, _count: { _all: true },
    });
    const arrearsMap = new Map(arrearsGroups.map((g) => [g.studentId, g._count._all]));

    const rows = baseRows.map((r) => {
      const owedDays = arrearsMap.get(r.student.id) ?? 0;
      return { student: r.student, status: r.status, dailyRate, owedDays, owedAmount: owedDays * dailyRate };
    });

    const summary = {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      preCovered: rows.filter((r) => r.status === 'PRE_COVERED').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      unpaid: rows.filter((r) => r.status === 'UNPAID').length,
      cashCollected: rows.filter((r) => r.status === 'PAID').length * dailyRate,
    };

    return { date, classId, dailyRate, isSchoolDay, rows, summary };
  }

  // Mark a student as paid today (cash collected now)
  async markPaid(schoolId: string, dto: MarkPaidDto, _collectedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');

    const existing = await this.prisma.feedingDailyRecord.findUnique({
      where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: dateObj } },
    });
    if (existing?.status === 'PRE_COVERED')
      throw new ConflictException("This day is already covered by the student's prepaid balance");
    if (existing?.status === 'PAID') return existing;

    return this.prisma.feedingDailyRecord.upsert({
      where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: dateObj } },
      update: { status: 'PAID' },
      create: { schoolId, studentId: dto.studentId, recordDate: dateObj, status: 'PAID' },
    });
  }

  // ── Prepayment / refund ───────────────────────────────────

  async prepay(schoolId: string, dto: FeedingPrepayDto, recordedBy: string) {
    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);
    const amountPaid = dailyRate * dto.days;

    const payment = await this.prisma.feedingPayment.create({
      data: {
        schoolId, studentId: dto.studentId, amountPaid,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        daysCovered: dto.days, recordedBy,
      },
    });

    const balance = await this.getStudentBalance(schoolId, dto.studentId);
    return { payment, daysAdded: dto.days, amountPaid, balance };
  }

  async refundBalance(schoolId: string, dto: FeedingRefundDto, recordedBy: string) {
    const balance = await this.getStudentBalance(schoolId, dto.studentId);
    if (dto.days > balance)
      throw new BadRequestException(
        balance <= 0 ? 'No unused prepaid days to refund' : `Only ${balance} unused prepaid day(s) can be refunded`,
      );

    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);
    await this.prisma.feedingPayment.create({
      data: {
        schoolId, studentId: dto.studentId, amountPaid: -(dailyRate * dto.days),
        paymentDate: new Date(), daysCovered: -dto.days, recordedBy,
      },
    });

    return { daysRefunded: dto.days, amountRefunded: dailyRate * dto.days, balance: balance - dto.days };
  }

  // ── Arrears ───────────────────────────────────────────────

  async settleArrears(schoolId: string, dto: FeedingSettleArrearsDto, recordedBy: string) {
    const unpaid = await this.prisma.feedingDailyRecord.findMany({
      where: { schoolId, studentId: dto.studentId, status: 'UNPAID' },
      orderBy: { recordDate: 'asc' },
      ...(dto.days ? { take: dto.days } : {}),
    });
    if (unpaid.length === 0) throw new BadRequestException('No arrears to settle');

    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);
    const amountSettled = unpaid.length * dailyRate;

    const payment = await this.prisma.feedingPayment.create({
      data: {
        schoolId, studentId: dto.studentId, amountPaid: amountSettled,
        paymentDate: new Date(), daysCovered: 0, recordedBy,
      },
    });

    await this.prisma.feedingDailyRecord.updateMany({
      where: { id: { in: unpaid.map((r) => r.id) } },
      data: { status: 'PAID', feedingPaymentId: payment.id },
    });

    const owedDays = await this.getStudentArrears(schoolId, dto.studentId);
    return { daysSettled: unpaid.length, amountSettled, owedDays, owedAmount: owedDays * dailyRate };
  }

  // ── Per-student payment calendar ──────────────────────────

  async getStudentCalendar(schoolId: string, studentId: string, month: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, studentId: true, firstName: true, lastName: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestException('month must be in YYYY-MM format');
    const year = Number(match[1]);
    const mon = Number(match[2]);

    const first = new Date(year, mon - 1, 1);
    const last = new Date(year, mon, 0);

    const [dailyRate, balance, owedDays, records, attendanceRecords] = await Promise.all([
      this.getStudentDailyRate(schoolId, studentId).catch(() => 0),
      this.getStudentBalance(schoolId, studentId),
      this.getStudentArrears(schoolId, studentId),
      this.prisma.feedingDailyRecord.findMany({
        where: { schoolId, studentId, recordDate: { gte: this.startOfDay(first), lte: this.endOfDay(last) } },
      }),
      this.prisma.studentAttendanceRecord.findMany({
        where: { schoolId, studentId, date: { gte: this.startOfDay(first), lte: this.endOfDay(last) } },
      }),
    ]);

    const recordMap = new Map(records.map((r) => [this.dayKey(r.recordDate), r]));
    const attendanceMap = new Map(attendanceRecords.map((r) => [this.dayKey(r.date), r]));

    const dayList: Date[] = [];
    for (let d = 1; d <= last.getDate(); d++) dayList.push(new Date(year, mon - 1, d));

    const schoolDayFlags = await Promise.all(dayList.map((d) => this.calendar.isSchoolDay(schoolId, d)));

    const todayKey = this.dayKey(new Date());
    let projectionRemaining = Math.max(balance, 0);

    const days = dayList.map((d, i) => {
      const key = this.dayKey(d);
      const isSchoolDay = schoolDayFlags[i];
      const record = recordMap.get(key);
      const isAbsent = attendanceMap.get(key)?.status === 'ABSENT';

      let status: CalendarStatus;
      if (!isSchoolDay) status = 'NON_SCHOOL';
      else if (isAbsent) status = 'ABSENT';
      else if (record?.status === 'PAID') status = 'PAID';
      else if (record?.status === 'PRE_COVERED') status = 'PRE_COVERED';
      else if (key < todayKey) status = 'UNPAID';
      else if (projectionRemaining > 0) { projectionRemaining--; status = 'PROJECTED'; }
      else status = key === todayKey ? 'UNPAID' : 'NONE';

      return { date: key, isSchoolDay, status };
    });

    return { studentId, student, month, dailyRate, balance, owedDays, owedAmount: owedDays * dailyRate, days };
  }

  // ── Daily reconciliation — how much cash was collected today ──

  async getDailyReconciliation(schoolId: string, date: string) {
    const dateObj = new Date(date);

    const payments = await this.prisma.feedingPayment.findMany({
      where: { schoolId, paymentDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) } },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
    });

    const dailyPaid = await this.prisma.feedingDailyRecord.findMany({
      where: { schoolId, status: 'PAID', recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) } },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
    });

    // Same-day feeding outflow — needed to reconcile the cash drawer. Only
    // cash-method expenses reduce the physical cash; other methods are listed
    // for context but don't count toward the expected-in-hand figure.
    const expenses = await this.prisma.expense.findMany({
      where: {
        schoolId,
        costCenter: 'FEEDING',
        expenseDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const totalCashCollected = payments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
    const isCash = (m: string | null) => (m ?? '').trim().toLowerCase() === 'cash';
    const cashPaidOut = expenses.filter((e) => isCash(e.method)).reduce((s, e) => s + Number(e.amount), 0);
    const totalPaidOut = expenses.reduce((s, e) => s + Number(e.amount), 0);

    return {
      date,
      cashCollectedToday: totalCashCollected,
      prePayments: payments.map((p) => ({ student: p.student, amount: p.amountPaid, daysCovered: p.daysCovered })),
      paidToday: dailyPaid.map((r) => ({ student: r.student })),
      totalTransactions: payments.length + dailyPaid.length,
      expenses: expenses.map((e) => ({
        id: e.id,
        category: e.category.name,
        payee: e.payee,
        method: e.method,
        amount: Number(e.amount),
        isCash: isCash(e.method),
      })),
      cashPaidOut,
      totalPaidOut,
      expectedCashInHand: totalCashCollected - cashPaidOut,
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  private async getStudentDailyRate(schoolId: string, studentId: string): Promise<number> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        classAssignments: {
          include: { class: { select: { gradeLevelId: true } } },
          orderBy: { assignedAt: 'desc' }, take: 1,
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const gradeLevelId = student.classAssignments[0]?.class.gradeLevelId;
    const rate = gradeLevelId ? await this.feedingConfig.getDailyRate(schoolId, gradeLevelId) : null;
    if (!rate || rate <= 0) throw new BadRequestException('No feeding rate configured for this student');
    return rate;
  }

  private dayKey(date: Date): string {
    const d = new Date(date);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private startOfDay(date: Date): Date { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  private endOfDay(date: Date): Date { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; }
}
