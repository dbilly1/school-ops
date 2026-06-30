import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import {
  TransportPrepayDto,
  TransportRefundDto,
  TransportSettleArrearsDto,
  TransportMarkPaidDto,
  TransportMarkBoardingDto,
} from './dto/transport-fees.dto';

// Calendar cell states (superset of the DailyFeeStatus enum).
//   NON_SCHOOL — weekend/holiday/out-of-term, not payable
//   PROJECTED  — future school day covered by remaining prepaid balance
//   NONE       — no ride recorded (didn't board, or not yet marked)
type CalendarStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID' | 'NON_SCHOOL' | 'PROJECTED' | 'NONE';

type Leg = 'AM' | 'PM';
// Per-leg state on the boarding register.
//   NONE        — not yet checked (no record)
//   ABSENT      — explicitly marked as not riding this leg (no charge)
//   PRE_COVERED — boarded, paid from prepaid balance
//   PAID        — boarded, cash collected
//   UNPAID      — boarded, owes (accruing arrears)
type LegState = 'NONE' | 'ABSENT' | 'PRE_COVERED' | 'PAID' | 'UNPAID';
// Did the student actually board (vs. off/not-checked)? Drives rider counts.
const isRide = (s: LegState): boolean => s === 'PRE_COVERED' || s === 'PAID' || s === 'UNPAID';

// A day has two legs, so the billing unit is a leg = half the daily (round-trip)
// rate. Balances and arrears are counted in days, half a day per leg record.
const LEG_WEIGHT = 0.5;

@Injectable()
export class TransportFeesService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
  ) {}

  // ── Prepaid balance ───────────────────────────────────────
  // Balance (in days) = days banked via payments − days already consumed (each
  // PRE_COVERED leg burns half a day). Credit is only spent when a ride is
  // actually marked, so unused balance carries forward across days off the bus.

  private async getStudentBalance(schoolId: string, studentId: string): Promise<number> {
    const [banked, consumedLegs] = await Promise.all([
      this.prisma.transportPayment.aggregate({
        where: { schoolId, studentId },
        _sum: { daysCovered: true },
      }),
      this.prisma.transportDailyRecord.count({
        where: { schoolId, studentId, status: 'PRE_COVERED' },
      }),
    ]);
    return (banked._sum.daysCovered ?? 0) - consumedLegs * LEG_WEIGHT;
  }

  // Outstanding (in days): ride legs the student boarded but never covered.
  private async getStudentArrears(schoolId: string, studentId: string): Promise<number> {
    const unpaidLegs = await this.prisma.transportDailyRecord.count({
      where: { schoolId, studentId, status: 'UNPAID' },
    });
    return unpaidLegs * LEG_WEIGHT;
  }

  // ── Daily Boarding Register (per route) ───────────────────
  // Read-only. Lists every rider on the route with an AM and a PM slot. Nothing
  // is assumed — a slot is only PAID/PRE_COVERED/UNPAID once someone confirms the
  // student actually boarded (see markBoarding). Unmarked = didn't ride = no charge.

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

    const [dayRecords, arrearsGroups, preCoveredGroups, bankedGroups] = await Promise.all([
      this.prisma.transportDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: studentIds },
          recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
        select: { studentId: true, leg: true, status: true },
      }),
      this.prisma.transportDailyRecord.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds }, status: 'UNPAID' },
        _count: { _all: true },
      }),
      this.prisma.transportDailyRecord.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds }, status: 'PRE_COVERED' },
        _count: { _all: true },
      }),
      this.prisma.transportPayment.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds } },
        _sum: { daysCovered: true },
      }),
    ]);

    // Group today's records by student.
    const recordsByStudent = new Map<string, { leg: Leg; status: LegState }[]>();
    for (const r of dayRecords) {
      const arr = recordsByStudent.get(r.studentId) ?? [];
      arr.push({ leg: r.leg as Leg, status: r.status as LegState });
      recordsByStudent.set(r.studentId, arr);
    }

    // Per-student owed days and consumed days (half a day per leg record).
    const owedByStudent = new Map(arrearsGroups.map((g) => [g.studentId, g._count._all * LEG_WEIGHT]));
    const consumedByStudent = new Map(preCoveredGroups.map((g) => [g.studentId, g._count._all * LEG_WEIGHT]));
    const bankedByStudent = new Map(bankedGroups.map((g) => [g.studentId, g._sum.daysCovered ?? 0]));

    const dailyRate = Number(route.dailyRate);
    const legRate = dailyRate * LEG_WEIGHT;

    const rows = assignments
      .map(({ student }) => {
        const recs = recordsByStudent.get(student.id) ?? [];
        const stateFor = (leg: Leg): LegState =>
          recs.find((r) => r.leg === leg)?.status ?? 'NONE';

        const owedDays = owedByStudent.get(student.id) ?? 0;
        const balance = (bankedByStudent.get(student.id) ?? 0) - (consumedByStudent.get(student.id) ?? 0);

        return {
          student,
          am: stateFor('AM'),
          pm: stateFor('PM'),
          owedDays,
          owedAmount: owedDays * dailyRate,
          balance,
        };
      })
      .sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));

    const summary = {
      total: rows.length,
      ridersAm: rows.filter((r) => isRide(r.am)).length,
      ridersPm: rows.filter((r) => isRide(r.pm)).length,
      // Legs boarded-but-unpaid today (awaiting cash).
      unpaidLegs: rows.reduce(
        (n, r) => n + (r.am === 'UNPAID' ? 1 : 0) + (r.pm === 'UNPAID' ? 1 : 0),
        0,
      ),
      // Cash legs collected today.
      paidLegs: rows.reduce(
        (n, r) => n + (r.am === 'PAID' ? 1 : 0) + (r.pm === 'PAID' ? 1 : 0),
        0,
      ),
    };

    return { date, routeId, dailyRate, legRate, isSchoolDay, rows, summary };
  }

  // Set a student's status for a given leg. Boarding is the single source of
  // truth — marking ridden consumes a prepaid leg (PRE_COVERED) or records the
  // debt (UNPAID); "off" records an explicit no-ride; "clear" returns to unmarked.
  async markBoarding(schoolId: string, dto: TransportMarkBoardingDto, _userId: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');
    await this.getStudentDailyRate(schoolId, dto.studentId); // validates route assignment

    const where = {
      schoolId_studentId_recordDate_leg: {
        schoolId,
        studentId: dto.studentId,
        recordDate: dateObj,
        leg: dto.leg,
      },
    };
    const existing = await this.prisma.transportDailyRecord.findUnique({ where });

    // Cash already collected can't be silently reversed — refund it first.
    if (existing?.status === 'PAID' && dto.action !== 'rode')
      throw new ConflictException('Cash was already collected for this leg — refund it before changing this');

    if (dto.action === 'clear') {
      if (existing) await this.prisma.transportDailyRecord.delete({ where: { id: existing.id } });
      return this.boardingResult(schoolId, dto.studentId, 'NONE');
    }

    if (dto.action === 'off') {
      // Explicit no-ride: record ABSENT (no charge; frees any prepaid leg held).
      if (existing?.status === 'ABSENT') return this.boardingResult(schoolId, dto.studentId, 'ABSENT');
      await this.prisma.transportDailyRecord.upsert({
        where,
        update: { status: 'ABSENT', transportPaymentId: null },
        create: { schoolId, studentId: dto.studentId, recordDate: dateObj, leg: dto.leg, status: 'ABSENT' },
      });
      return this.boardingResult(schoolId, dto.studentId, 'ABSENT');
    }

    // action === 'rode'. Idempotent if it's already a ride; an ABSENT leg flips.
    if (existing && existing.status !== 'ABSENT')
      return this.boardingResult(schoolId, dto.studentId, existing.status as LegState);

    const balance = await this.getStudentBalance(schoolId, dto.studentId);
    const status: LegState = balance >= LEG_WEIGHT ? 'PRE_COVERED' : 'UNPAID';
    await this.prisma.transportDailyRecord.upsert({
      where,
      update: { status },
      create: { schoolId, studentId: dto.studentId, recordDate: dateObj, leg: dto.leg, status },
    });
    return this.boardingResult(schoolId, dto.studentId, status);
  }

  // Fast path: mark every still-unmarked leg (AM and PM) as ridden for the whole
  // route — "everyone rode both legs today" — so the operator only un-marks the
  // exceptions. Each student's prepaid balance is allocated leg-by-leg.
  async markAllBoarding(schoolId: string, routeId: string, date: string, _userId: string) {
    const dateObj = new Date(date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');

    const assignments = await this.prisma.studentTransportAssignment.findMany({
      where: { transportRouteId: routeId, transportRoute: { schoolId } },
      select: { studentId: true },
    });
    const studentIds = assignments.map((a) => a.studentId);
    if (studentIds.length === 0) return { created: 0 };

    const [todays, preCoveredGroups, banked] = await Promise.all([
      this.prisma.transportDailyRecord.findMany({
        where: {
          schoolId,
          studentId: { in: studentIds },
          recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
        select: { studentId: true, leg: true },
      }),
      this.prisma.transportDailyRecord.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds }, status: 'PRE_COVERED' },
        _count: { _all: true },
      }),
      this.prisma.transportPayment.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: studentIds } },
        _sum: { daysCovered: true },
      }),
    ]);

    const consumed = new Map(preCoveredGroups.map((g) => [g.studentId, g._count._all * LEG_WEIGHT]));
    const bankedMap = new Map(banked.map((g) => [g.studentId, g._sum.daysCovered ?? 0]));
    const presentLegs = new Map<string, Set<Leg>>();
    for (const r of todays) {
      const set = presentLegs.get(r.studentId) ?? new Set<Leg>();
      set.add(r.leg as Leg);
      presentLegs.set(r.studentId, set);
    }

    const creates = [];
    for (const studentId of studentIds) {
      const present = presentLegs.get(studentId) ?? new Set<Leg>();
      let bal = (bankedMap.get(studentId) ?? 0) - (consumed.get(studentId) ?? 0);
      for (const leg of ['AM', 'PM'] as Leg[]) {
        if (present.has(leg)) continue;
        const status: LegState = bal >= LEG_WEIGHT ? 'PRE_COVERED' : 'UNPAID';
        if (status === 'PRE_COVERED') bal -= LEG_WEIGHT;
        creates.push(
          this.prisma.transportDailyRecord.create({
            data: { schoolId, studentId, recordDate: dateObj, leg, status },
          }),
        );
      }
    }

    if (creates.length) await this.prisma.$transaction(creates);
    return { created: creates.length };
  }

  private async boardingResult(schoolId: string, studentId: string, status: LegState) {
    const [balance, owedDays, rate] = await Promise.all([
      this.getStudentBalance(schoolId, studentId),
      this.getStudentArrears(schoolId, studentId),
      this.getStudentDailyRate(schoolId, studentId).catch(() => 0),
    ]);
    return { status, balance, owedDays, owedAmount: owedDays * rate };
  }

  // Collect cash for a leg the student boarded. With a leg, settles that one leg;
  // without a leg (e.g. from the per-student calendar) settles every unpaid leg
  // for the day. Cash never touches the prepaid balance, but it IS banked as a
  // payment (daysCovered = 0) so it lands in the day's cash reconciliation.
  async markPaid(schoolId: string, dto: TransportMarkPaidDto, collectedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');
    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);

    if (!dto.leg) {
      // Day-level: settle whatever is unpaid for the date.
      const unpaid = await this.prisma.transportDailyRecord.findMany({
        where: {
          schoolId,
          studentId: dto.studentId,
          status: 'UNPAID',
          recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
        },
      });
      if (unpaid.length === 0)
        throw new ConflictException('No unpaid ride to settle for this day');

      const amount = unpaid.length * LEG_WEIGHT * dailyRate;
      const payment = await this.prisma.transportPayment.create({
        data: { schoolId, studentId: dto.studentId, amountPaid: amount, paymentDate: new Date(), daysCovered: 0, recordedBy: collectedBy },
      });
      await this.prisma.transportDailyRecord.updateMany({
        where: { id: { in: unpaid.map((r) => r.id) } },
        data: { status: 'PAID', transportPaymentId: payment.id },
      });
      return { settled: unpaid.length, amount };
    }

    const where = {
      schoolId_studentId_recordDate_leg: { schoolId, studentId: dto.studentId, recordDate: dateObj, leg: dto.leg },
    };
    const existing = await this.prisma.transportDailyRecord.findUnique({ where });
    if (existing?.status === 'PRE_COVERED')
      throw new ConflictException("This leg is already covered by the student's prepaid balance");
    if (existing?.status === 'PAID') return existing; // already settled — don't bank twice

    const payment = await this.prisma.transportPayment.create({
      data: { schoolId, studentId: dto.studentId, amountPaid: dailyRate * LEG_WEIGHT, paymentDate: new Date(), daysCovered: 0, recordedBy: collectedBy },
    });
    return this.prisma.transportDailyRecord.upsert({
      where,
      update: { status: 'PAID', transportPaymentId: payment.id },
      create: { schoolId, studentId: dto.studentId, recordDate: dateObj, leg: dto.leg, status: 'PAID', transportPaymentId: payment.id },
    });
  }

  // ── Prepayment (top up balance) ───────────────────────────
  // Banks `days` of credit (a day = a round trip = two legs). Coverage is
  // consumed lazily, half a day at a time, as legs are actually boarded.

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
  // Settling clears the oldest boarded-but-unpaid legs first and books the cash
  // as a zero-day payment (so it shows in today's reconciliation without touching
  // the prepaid-balance math).

  async settleArrears(schoolId: string, dto: TransportSettleArrearsDto, recordedBy: string) {
    const unpaid = await this.prisma.transportDailyRecord.findMany({
      where: { schoolId, studentId: dto.studentId, status: 'UNPAID' },
      orderBy: { recordDate: 'asc' },
      ...(dto.days ? { take: dto.days } : {}),
    });
    if (unpaid.length === 0) throw new BadRequestException('No arrears to settle');

    const dailyRate = await this.getStudentDailyRate(schoolId, dto.studentId);
    const daysSettled = unpaid.length * LEG_WEIGHT;
    const amountSettled = daysSettled * dailyRate;

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
    return { daysSettled, amountSettled, owedDays, owedAmount: owedDays * dailyRate };
  }

  // ── Per-student payment calendar ──────────────────────────
  // Read-only history view for the prepay modal. A day aggregates its two legs:
  // any unpaid leg shows UNPAID, otherwise paid/prepaid if covered, else (no ride
  // recorded) it's simply blank — boarding is no longer assumed from attendance.

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

    const [dailyRate, balance, owedDays, records] = await Promise.all([
      this.getStudentDailyRate(schoolId, studentId).catch(() => 0),
      this.getStudentBalance(schoolId, studentId),
      this.getStudentArrears(schoolId, studentId),
      this.prisma.transportDailyRecord.findMany({
        where: { schoolId, studentId, recordDate: { gte: this.startOfDay(first), lte: this.endOfDay(last) } },
        select: { recordDate: true, status: true },
      }),
    ]);

    // Group records by day → set of statuses present.
    const statusesByDay = new Map<string, Set<string>>();
    for (const r of records) {
      const key = this.dayKey(r.recordDate);
      const set = statusesByDay.get(key) ?? new Set<string>();
      set.add(r.status);
      statusesByDay.set(key, set);
    }

    const dayList: Date[] = [];
    for (let d = 1; d <= last.getDate(); d++) dayList.push(new Date(year, mon - 1, d));

    const schoolDayFlags = await Promise.all(dayList.map((d) => this.calendar.isSchoolDay(schoolId, d)));

    const todayKey = this.dayKey(new Date());
    let projectionRemaining = Math.max(balance, 0);

    const days = dayList.map((d, i) => {
      const key = this.dayKey(d);
      const isSchoolDay = schoolDayFlags[i];
      const statuses = statusesByDay.get(key);

      let status: CalendarStatus;
      if (!isSchoolDay) status = 'NON_SCHOOL';
      else if (statuses?.has('UNPAID')) status = 'UNPAID';
      else if (statuses?.has('PAID')) status = 'PAID';
      else if (statuses?.has('PRE_COVERED')) status = 'PRE_COVERED';
      else if (statuses?.has('ABSENT')) status = 'ABSENT'; // explicitly marked off the bus
      // No ride recorded. Future school days project against remaining balance
      // (a round trip a day); past/today simply had no ride → blank.
      else if (key > todayKey && projectionRemaining >= 1) {
        projectionRemaining -= 1;
        status = 'PROJECTED';
      } else status = 'NONE';

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

    // Any end-of-day cash count already recorded for this date (so the page can
    // show the saved figure and whether the drawer balanced).
    const cashCount = await this.prisma.cashReconciliation.findUnique({
      where: { schoolId_stream_date: { schoolId, stream: 'TRANSPORT', date: this.startOfDay(dateObj) } },
      include: { reconciledByUser: { select: { firstName: true, lastName: true } } },
    });

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
      cashCount: this.mapCashCount(cashCount),
    };
  }

  // Record (or re-record) the actual cash counted in the drawer for a day. The
  // expected figure is recomputed now and snapshotted alongside the count, so a
  // later expense/payment edit never silently rewrites a closed day's variance.
  async recordCashCount(schoolId: string, dto: { date: string; countedCash: number; note?: string }, userId: string) {
    const recon = await this.getDailyReconciliation(schoolId, dto.date);
    const date = this.startOfDay(new Date(dto.date));
    const expectedCash = recon.expectedCashInHand;
    const variance = dto.countedCash - expectedCash;

    const saved = await this.prisma.cashReconciliation.upsert({
      where: { schoolId_stream_date: { schoolId, stream: 'TRANSPORT', date } },
      create: {
        schoolId, stream: 'TRANSPORT', date,
        expectedCash, countedCash: dto.countedCash, variance,
        cashCollected: recon.cashCollectedToday, cashPaidOut: recon.cashPaidOut,
        note: dto.note ?? null, reconciledBy: userId,
      },
      update: {
        expectedCash, countedCash: dto.countedCash, variance,
        cashCollected: recon.cashCollectedToday, cashPaidOut: recon.cashPaidOut,
        note: dto.note ?? null, reconciledBy: userId,
      },
      include: { reconciledByUser: { select: { firstName: true, lastName: true } } },
    });
    return this.mapCashCount(saved);
  }

  private mapCashCount(r: any) {
    if (!r) return null;
    return {
      date: this.dayKey(r.date),
      expectedCash: Number(r.expectedCash),
      countedCash: Number(r.countedCash),
      variance: Number(r.variance),
      cashCollected: Number(r.cashCollected),
      cashPaidOut: Number(r.cashPaidOut),
      note: r.note ?? null,
      reconciledBy: r.reconciledByUser ? `${r.reconciledByUser.firstName} ${r.reconciledByUser.lastName}` : null,
      recordedAt: r.updatedAt,
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
