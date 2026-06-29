import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import { TransportPrepayDto, TransportRefundDto, TransportSettleArrearsDto, TransportMarkPaidDto } from './dto/transport-fees.dto';

// Calendar cell states (superset of the DailyFeeStatus enum).
//   NON_SCHOOL — weekend/holiday/out-of-term, not payable
//   PROJECTED  — future school day covered by remaining prepaid balance
//   NONE       — future school day with no coverage
type CalendarStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID' | 'NON_SCHOOL' | 'PROJECTED' | 'NONE';

@Injectable()
export class TransportFeesService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
  ) {}

  // ── Prepaid balance ───────────────────────────────────────
  // Balance = days banked via payments − days already consumed (PRE_COVERED
  // records). A banked day is only consumed on a day the student actually rides,
  // so absences leave the credit intact and it carries forward automatically.

  private async getStudentBalance(schoolId: string, studentId: string): Promise<number> {
    const [banked, consumed] = await Promise.all([
      this.prisma.transportPayment.aggregate({
        where: { schoolId, studentId },
        _sum: { daysCovered: true },
      }),
      this.prisma.transportDailyRecord.count({
        where: { schoolId, studentId, status: 'PRE_COVERED' },
      }),
    ]);
    return (banked._sum.daysCovered ?? 0) - consumed;
  }

  // ── Daily Collection Screen (per route) ───────────────────
  // For dates up to today this also *reconciles* coverage: present students with
  // prepaid balance get a banked day consumed (→ PRE_COVERED); students marked
  // absent have any consumed day for that date released back to their balance.

  async getDailyCollection(schoolId: string, routeId: string, date: string) {
    const dateObj = new Date(date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);

    const route = await this.prisma.transportRoute.findFirst({
      where: { id: routeId, schoolId },
    });
    if (!route) throw new NotFoundException('Route not found');

    const assignments = await this.prisma.studentTransportAssignment.findMany({
      where: { transportRouteId: routeId },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });
    const studentIds = assignments.map((a) => a.student.id);

    const [records, attendanceRecords, bankedGroups, consumedGroups] = await Promise.all([
      this.prisma.transportDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: studentIds },
          recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      }),
      this.prisma.studentAttendanceRecord.findMany({
        where: {
          schoolId,
          studentId: { in: studentIds },
          date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      }),
      this.prisma.transportPayment.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds } },
        _sum: { daysCovered: true },
      }),
      this.prisma.transportDailyRecord.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds }, status: 'PRE_COVERED' },
        _count: { _all: true },
      }),
    ]);

    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    const attendanceMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));
    const bankedMap = new Map(bankedGroups.map((g) => [g.studentId, g._sum.daysCovered ?? 0]));
    const consumedMap = new Map(consumedGroups.map((g) => [g.studentId, g._count._all]));

    // Only reconcile (consume/release/record-debt) for real, settled school days (≤ today).
    const reconcilable = isSchoolDay && dateObj <= this.endOfDay(new Date());
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    const dailyRate = Number(route.dailyRate);

    const baseRows = assignments.map(({ student }) => {
      const attendance = attendanceMap.get(student.id);
      const isAbsent = attendance?.status === 'ABSENT';
      const existing = recordMap.get(student.id);
      const banked = bankedMap.get(student.id) ?? 0;
      const consumedTotal = consumedMap.get(student.id) ?? 0;

      let status: 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID';

      if (existing?.status === 'PAID') {
        // Cash already collected for this day — always wins.
        status = 'PAID';
      } else if (isAbsent) {
        status = 'ABSENT';
        // Absent day owes nothing: release any prepaid/unpaid record for it.
        if (reconcilable && existing) {
          writes.push(this.prisma.transportDailyRecord.delete({ where: { id: existing.id } }));
        }
      } else if (!reconcilable) {
        status = existing?.status === 'PRE_COVERED' ? 'PRE_COVERED' : 'UNPAID';
      } else {
        // Days consumed on *other* dates — this date may already hold one.
        const consumedOther = consumedTotal - (existing?.status === 'PRE_COVERED' ? 1 : 0);
        if (consumedOther < banked) {
          status = 'PRE_COVERED';
          if (!existing) {
            writes.push(this.prisma.transportDailyRecord.create({
              data: { schoolId, studentId: student.id, recordDate: dateObj, status: 'PRE_COVERED' },
            }));
          } else if (existing.status !== 'PRE_COVERED') {
            writes.push(this.prisma.transportDailyRecord.update({
              where: { id: existing.id }, data: { status: 'PRE_COVERED' },
            }));
          }
        } else {
          // Rode but uncovered → record the debt (IOU) so arrears accrue.
          status = 'UNPAID';
          if (!existing) {
            writes.push(this.prisma.transportDailyRecord.create({
              data: { schoolId, studentId: student.id, recordDate: dateObj, status: 'UNPAID' },
            }));
          } else if (existing.status !== 'UNPAID') {
            writes.push(this.prisma.transportDailyRecord.update({
              where: { id: existing.id }, data: { status: 'UNPAID' },
            }));
          }
        }
      }
      return { student, status };
    });

    if (writes.length) await this.prisma.$transaction(writes);

    // Total outstanding per student (across all days), computed after reconciliation.
    const arrearsGroups = await this.prisma.transportDailyRecord.groupBy({
      by: ['studentId'],
      where: { schoolId, studentId: { in: studentIds }, status: 'UNPAID' },
      _count: { _all: true },
    });
    const arrearsMap = new Map(arrearsGroups.map((g) => [g.studentId, g._count._all]));

    const rows = baseRows
      .map((r) => {
        const owedDays = arrearsMap.get(r.student.id) ?? 0;
        return { ...r, owedDays, owedAmount: owedDays * dailyRate };
      })
      .sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));

    const summary = {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      preCovered: rows.filter((r) => r.status === 'PRE_COVERED').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      unpaid: rows.filter((r) => r.status === 'UNPAID').length,
    };

    return { date, routeId, dailyRate, isSchoolDay, rows, summary };
  }

  // Mark a student as paid today (cash collected now)
  async markPaid(schoolId: string, dto: TransportMarkPaidDto, _collectedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');

    const existing = await this.prisma.transportDailyRecord.findUnique({
      where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: dateObj } },
    });
    // Don't take cash for a day already covered by prepaid balance.
    if (existing?.status === 'PRE_COVERED')
      throw new ConflictException("This day is already covered by the student's prepaid balance");
    // Already settled in cash — idempotent, nothing to charge again.
    if (existing?.status === 'PAID') return existing;

    return this.prisma.transportDailyRecord.upsert({
      where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: dateObj } },
      update: { status: 'PAID' },
      create: { schoolId, studentId: dto.studentId, recordDate: dateObj, status: 'PAID' },
    });
  }

  // ── Prepayment (top up balance) ───────────────────────────
  // Banks `days` of credit. Unlike the old flow it does NOT stamp specific future
  // dates — coverage is consumed lazily on actual ride days (see getDailyCollection),
  // which is what lets unused credit carry past absences.

  async prepay(schoolId: string, dto: TransportPrepayDto, recordedBy: string) {
    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);
    const amountPaid = dailyRate * dto.days;

    const payment = await this.prisma.transportPayment.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        amountPaid,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        daysCovered: dto.days,
        recordedBy,
      },
    });

    const balance = await this.getStudentBalance(schoolId, dto.studentId);
    return { payment, daysAdded: dto.days, amountPaid, balance };
  }

  // Refund unconsumed prepaid days — recorded as a negative payment so the audit
  // trail and daily reconciliation stay consistent.
  async refundBalance(schoolId: string, dto: TransportRefundDto, recordedBy: string) {
    const balance = await this.getStudentBalance(schoolId, dto.studentId);
    if (dto.days > balance)
      throw new BadRequestException(
        balance <= 0
          ? 'No unused prepaid days to refund'
          : `Only ${balance} unused prepaid day(s) can be refunded`,
      );

    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);

    await this.prisma.transportPayment.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        amountPaid: -(dailyRate * dto.days),
        paymentDate: new Date(),
        daysCovered: -dto.days,
        recordedBy,
      },
    });

    return { daysRefunded: dto.days, amountRefunded: dailyRate * dto.days, balance: balance - dto.days };
  }

  // ── Arrears ───────────────────────────────────────────────
  // Outstanding = days the student rode but never covered (materialised UNPAID
  // records). Settling clears the oldest debts first and books the cash as a
  // zero-day payment (so it shows in today's reconciliation without touching the
  // prepaid-balance math).

  private async getStudentArrears(schoolId: string, studentId: string): Promise<number> {
    return this.prisma.transportDailyRecord.count({
      where: { schoolId, studentId, status: 'UNPAID' },
    });
  }

  async settleArrears(schoolId: string, dto: TransportSettleArrearsDto, recordedBy: string) {
    const unpaid = await this.prisma.transportDailyRecord.findMany({
      where: { schoolId, studentId: dto.studentId, status: 'UNPAID' },
      orderBy: { recordDate: 'asc' },
      ...(dto.days ? { take: dto.days } : {}),
    });
    if (unpaid.length === 0) throw new BadRequestException('No arrears to settle');

    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);
    const amountSettled = unpaid.length * dailyRate;

    const payment = await this.prisma.transportPayment.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        amountPaid: amountSettled,
        paymentDate: new Date(),
        daysCovered: 0, // settles past debt, not prepaid days — leaves balance untouched
        recordedBy,
      },
    });

    await this.prisma.transportDailyRecord.updateMany({
      where: { id: { in: unpaid.map((r) => r.id) } },
      data: { status: 'PAID', transportPaymentId: payment.id },
    });

    const owedDays = await this.getStudentArrears(schoolId, dto.studentId);
    return { daysSettled: unpaid.length, amountSettled, owedDays, owedAmount: owedDays * dailyRate };
  }

  // ── Per-student payment calendar ──────────────────────────
  // Read-only view for the prepay modal: past/today reflect materialised records,
  // future school days are a soft projection from the remaining balance.

  async getStudentCalendar(schoolId: string, studentId: string, month: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, studentId: true, firstName: true, lastName: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestException('month must be in YYYY-MM format');
    const year = Number(match[1]);
    const mon = Number(match[2]); // 1-12

    const first = new Date(year, mon - 1, 1);
    const last = new Date(year, mon, 0); // day 0 of next month = last day of this month

    const [dailyRate, balance, owedDays, records, attendanceRecords] = await Promise.all([
      this.getStudentDailyRate(schoolId, studentId).catch(() => 0),
      this.getStudentBalance(schoolId, studentId),
      this.getStudentArrears(schoolId, studentId),
      this.prisma.transportDailyRecord.findMany({
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
      else if (key < todayKey) status = 'UNPAID'; // past school day, rode but not settled
      // today-or-future school day with no record: covered by remaining balance (auto-slides past absences)
      else if (projectionRemaining > 0) { projectionRemaining--; status = 'PROJECTED'; }
      else status = key === todayKey ? 'UNPAID' : 'NONE'; // today with no balance still needs settling

      return { date: key, isSchoolDay, status };
    });

    return { studentId, student, month, dailyRate, balance, owedDays, owedAmount: owedDays * dailyRate, days };
  }

  // ── Daily reconciliation — how much cash was collected today ──

  async getDailyReconciliation(schoolId: string, date: string) {
    const dateObj = new Date(date);

    const payments = await this.prisma.transportPayment.findMany({
      where: {
        schoolId,
        paymentDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });

    const dailyPaid = await this.prisma.transportDailyRecord.findMany({
      where: {
        schoolId,
        status: 'PAID',
        recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });

    // Same-day transport outflow — needed to reconcile the cash drawer. Only
    // cash-method expenses reduce the physical cash; other methods are listed
    // for context but don't count toward the expected-in-hand figure.
    const expenses = await this.prisma.expense.findMany({
      where: {
        schoolId,
        costCenter: 'TRANSPORT',
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
    const assignment = await this.prisma.studentTransportAssignment.findUnique({
      where: { studentId },
      include: { transportRoute: { select: { schoolId: true, dailyRate: true } } },
    });
    if (!assignment || assignment.transportRoute.schoolId !== schoolId)
      throw new NotFoundException('Student is not assigned to a transport route');

    const dailyRate = Number(assignment.transportRoute.dailyRate);
    if (!dailyRate || dailyRate <= 0)
      throw new BadRequestException('No transport rate configured for this route');
    return dailyRate;
  }

  private dayKey(date: Date): string {
    const d = new Date(date);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
  }

  private endOfDay(date: Date): Date {
    const d = new Date(date); d.setHours(23, 59, 59, 999); return d;
  }
}
