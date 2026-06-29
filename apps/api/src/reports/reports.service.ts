import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GradingService } from '../school-setup/grading/grading.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private grading: GradingService,
    private calendar: CalendarService,
  ) {}

  // School days (weekday, in active term, not a confirmed holiday) within a range.
  private async schoolDayKeys(schoolId: string, startDate: string, endDate: string): Promise<string[]> {
    const { days } = await this.calendar.classifyDaysInRange(schoolId, new Date(startDate), new Date(endDate));
    return days.filter((d) => d.type === 'school').map((d) => d.date);
  }

  // ── Enrollment ────────────────────────────────────────────

  async enrollmentReport(schoolId: string, academicYearId?: string) {
    const yearId = academicYearId ?? await this.getActiveYearId(schoolId);

    const gradeLevels = await this.prisma.gradeLevel.findMany({
      where: { schoolId },
      include: {
        classes: {
          include: {
            _count: {
              select: {
                studentAssignments: { where: { academicYearId: yearId } },
              },
            },
          },
        },
      },
      orderBy: { sequence: 'asc' },
    });

    const totalStudents = await this.prisma.studentClassAssignment.count({
      where: { academicYearId: yearId, class: { schoolId } },
    });

    const activeYear = await this.prisma.academicYear.findUnique({ where: { id: yearId } });
    const newStudents = await this.prisma.student.count({
      where: {
        schoolId,
        ...(activeYear?.startDate ? { enrolledAt: { gte: activeYear.startDate } } : {}),
      },
    });

    // New students per term — only terms with both bounds set can be counted.
    const terms = await this.prisma.term.findMany({
      where: { schoolId, academicYearId: yearId },
      orderBy: { sequence: 'asc' },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    const byTerm = await Promise.all(
      terms.map(async (t) => ({
        term: { id: t.id, name: t.name },
        newStudents: t.startDate && t.endDate
          ? await this.prisma.student.count({
              where: { schoolId, enrolledAt: { gte: t.startDate, lte: t.endDate } },
            })
          : null,
      })),
    );

    return {
      academicYearId: yearId,
      totalStudents,
      newStudents,
      byTerm,
      byGradeLevel: gradeLevels.map((g) => ({
        gradeLevel: { id: g.id, name: g.name, sequence: g.sequence },
        classes: g.classes.map((c) => ({ id: c.id, name: c.name, studentCount: c._count.studentAssignments })),
        total: g.classes.reduce((s, c) => s + c._count.studentAssignments, 0),
      })),
    };
  }

  // ── Attendance ────────────────────────────────────────────

  async attendanceReport(schoolId: string, startDate: string, endDate: string, classId?: string) {
    const where: any = {
      schoolId,
      date: { gte: new Date(startDate), lte: new Date(endDate) },
      ...(classId ? { classId } : {}),
    };

    const records = await this.prisma.studentAttendanceRecord.findMany({
      where,
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });

    // Group by student
    const studentMap = new Map<string, { student: any; present: number; absent: number; late: number; total: number }>();

    for (const r of records) {
      if (!studentMap.has(r.studentId)) {
        studentMap.set(r.studentId, { student: r.student, present: 0, absent: 0, late: 0, total: 0 });
      }
      const entry = studentMap.get(r.studentId)!;
      entry.total++;
      if (r.status === 'PRESENT') entry.present++;
      else if (r.status === 'ABSENT') entry.absent++;
      else if (r.status === 'LATE') entry.late++;
    }

    const rows = Array.from(studentMap.values()).map((e) => ({
      ...e,
      rate: e.total > 0 ? Math.round(((e.present + e.late) / e.total) * 100) : 0,
    })).sort((a, b) => a.rate - b.rate);

    const schoolAvgRate = rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.rate, 0) / rows.length)
      : 0;

    return { startDate, endDate, schoolAvgRate, studentCount: rows.length, rows };
  }

  // ── Academic Performance ──────────────────────────────────

  async academicReport(schoolId: string, termId: string, classId?: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: {
        academicYearId: term.academicYearId,
        class: { schoolId },
        ...(classId ? { classId } : {}),
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
        class: { include: { gradeLevel: { select: { id: true, name: true } } } },
      },
    });

    const rows = await Promise.all(
      assignments.map(async ({ student, class: cls }) => {
        const scores = await this.prisma.assessmentScore.findMany({
          where: { studentId: student.id, assessment: { schoolId, termId } },
          include: { assessment: { select: { totalScore: true } } },
        });

        const totalRaw = scores.reduce((s, r) => s + Number(r.rawScore), 0);
        const totalPossible = scores.reduce((s, r) => s + Number(r.assessment.totalScore), 0);
        const percentage = totalPossible > 0 ? Math.round((totalRaw / totalPossible) * 100) : null;
        const gradeLabel = percentage !== null ? await this.grading.deriveGrade(schoolId, percentage) : null;

        return {
          student,
          class: { id: cls.id, name: cls.name, gradeLevel: cls.gradeLevel },
          assessmentCount: scores.length,
          totalRaw,
          totalPossible,
          percentage,
          gradeLabel,
        };
      }),
    );

    const withScores = rows.filter((r) => r.percentage !== null);
    const avgPercentage = withScores.length > 0
      ? Math.round(withScores.reduce((s, r) => s + r.percentage!, 0) / withScores.length)
      : null;

    // Class performance comparison.
    const classMap = new Map<string, { class: { id: string; name: string }; sum: number; scored: number; count: number }>();
    for (const r of rows) {
      const entry = classMap.get(r.class.id) ?? { class: { id: r.class.id, name: r.class.name }, sum: 0, scored: 0, count: 0 };
      entry.count++;
      if (r.percentage !== null) { entry.sum += r.percentage; entry.scored++; }
      classMap.set(r.class.id, entry);
    }
    const byClass = Array.from(classMap.values())
      .map((e) => ({ class: e.class, studentCount: e.count, avgPercentage: e.scored > 0 ? Math.round(e.sum / e.scored) : null }))
      .sort((a, b) => (b.avgPercentage ?? -1) - (a.avgPercentage ?? -1));

    // Grade distribution (counts per derived grade label).
    const distMap = new Map<string, number>();
    for (const r of rows) {
      if (r.gradeLabel) distMap.set(r.gradeLabel, (distMap.get(r.gradeLabel) ?? 0) + 1);
    }
    const distribution = Array.from(distMap.entries()).map(([grade, count]) => ({ grade, count }));

    // Subject performance — aggregate scores by subject across the term/class.
    const subjectScores = await this.prisma.assessmentScore.findMany({
      where: { assessment: { schoolId, termId, ...(classId ? { classId } : {}) } },
      include: { assessment: { select: { totalScore: true, subject: { select: { id: true, name: true } } } } },
    });
    const subjMap = new Map<string, { subject: { id: string; name: string }; raw: number; possible: number; scored: number }>();
    for (const s of subjectScores) {
      const subj = s.assessment.subject;
      if (!subj) continue;
      const entry = subjMap.get(subj.id) ?? { subject: subj, raw: 0, possible: 0, scored: 0 };
      entry.raw += Number(s.rawScore);
      entry.possible += Number(s.assessment.totalScore);
      entry.scored++;
      subjMap.set(subj.id, entry);
    }
    const bySubject = Array.from(subjMap.values())
      .map((e) => ({ subject: e.subject, scored: e.scored, avgPercentage: e.possible > 0 ? Math.round((e.raw / e.possible) * 100) : null }))
      .sort((a, b) => (b.avgPercentage ?? -1) - (a.avgPercentage ?? -1));

    return {
      termId,
      studentCount: rows.length,
      avgPercentage,
      byClass,
      distribution,
      bySubject,
      rows: rows.sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1)),
    };
  }

  // ── Finance / Fee Balances ────────────────────────────────

  async feeBalancesReport(schoolId: string, termId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: {
        student: {
          select: { id: true, studentId: true, firstName: true, lastName: true },
          include: {
            classAssignments: {
              include: { class: { include: { gradeLevel: { select: { id: true, name: true } } } } },
              orderBy: { assignedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const rows = invoices.map((inv) => ({
      student: { id: inv.student.id, studentId: inv.student.studentId, firstName: inv.student.firstName, lastName: inv.student.lastName },
      class: inv.student.classAssignments[0]?.class ?? null,
      amount: Number(inv.amount),
      amountPaid: Number(inv.amountPaid),
      balance: Number(inv.amount) - Number(inv.amountPaid),
      isPaid: Number(inv.amountPaid) >= Number(inv.amount),
    }));

    const totalBilled = rows.reduce((s, r) => s + r.amount, 0);
    const totalCollected = rows.reduce((s, r) => s + r.amountPaid, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.balance, 0);

    // Class breakdown.
    const classMap = new Map<string, { class: { id: string; name: string }; billed: number; collected: number; outstanding: number; students: number }>();
    for (const r of rows) {
      const key = r.class?.id ?? 'unassigned';
      const label = r.class ? { id: r.class.id, name: r.class.name } : { id: 'unassigned', name: 'Unassigned' };
      const entry = classMap.get(key) ?? { class: label, billed: 0, collected: 0, outstanding: 0, students: 0 };
      entry.billed += r.amount;
      entry.collected += r.amountPaid;
      entry.outstanding += r.balance;
      entry.students++;
      classMap.set(key, entry);
    }
    const byClass = Array.from(classMap.values()).sort((a, b) => b.outstanding - a.outstanding);

    return {
      termId,
      byClass,
      summary: {
        totalStudents: rows.length,
        fullyPaid: rows.filter((r) => r.isPaid).length,
        withBalance: rows.filter((r) => !r.isPaid).length,
        totalBilled,
        totalCollected,
        totalOutstanding,
        collectionRate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
      },
      rows: rows.sort((a, b) => b.balance - a.balance),
    };
  }

  // ── Transport ─────────────────────────────────────────────

  async transportReport(schoolId: string) {
    const routes = await this.prisma.transportRoute.findMany({
      where: { schoolId },
      include: {
        vehicle: { select: { plateNumber: true, model: true, capacity: true } },
        driver: { select: { name: true, phone: true } },
        studentAssignments: {
          include: {
            student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { studentAssignments: true } },
      },
    });

    const totalAssigned = await this.prisma.studentTransportAssignment.count({
      where: { transportRoute: { schoolId } },
    });

    return {
      totalRoutes: routes.length,
      totalStudentsAssigned: totalAssigned,
      routes: routes.map((r) => ({
        id: r.id,
        name: r.name,
        dailyRate: r.dailyRate,
        vehicle: r.vehicle,
        driver: r.driver,
        studentCount: r._count.studentAssignments,
        capacity: r.vehicle?.capacity ?? null,
        occupancyRate: r.vehicle?.capacity
          ? Math.round((r._count.studentAssignments / r.vehicle.capacity) * 100)
          : null,
      })),
    };
  }

  // ── Feeding Collection ────────────────────────────────────

  async feedingReport(schoolId: string, startDate: string, endDate: string) {
    const payments = await this.prisma.feedingPayment.findMany({
      where: {
        schoolId,
        paymentDate: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
        recordedByUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });

    const dailyPaid = await this.prisma.feedingDailyRecord.count({
      where: {
        schoolId, status: 'PAID',
        recordDate: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    });

    const unpaid = await this.prisma.feedingDailyRecord.count({
      where: {
        schoolId, status: 'UNPAID',
        recordDate: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    });

    const spentAgg = await this.prisma.expense.aggregate({
      where: {
        schoolId, costCenter: 'FEEDING',
        expenseDate: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      _sum: { amount: true },
    });

    const totalCollected = payments.reduce((s, p) => s + Number(p.amountPaid), 0);
    const totalSpent = Number(spentAgg._sum.amount ?? 0);

    return {
      startDate, endDate,
      totalCollected,
      totalSpent,
      net: totalCollected - totalSpent,
      paymentCount: payments.length,
      dailyPaidCount: dailyPaid,
      unpaidCount: unpaid,
      payments,
    };
  }

  // ── Performance Tracking (Longitudinal) ──────────────────

  async performanceTracking(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, studentId: true, firstName: true, lastName: true, enrolledAt: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { studentId },
      include: {
        class: { include: { gradeLevel: { select: { id: true, name: true } } } },
        academicYear: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });

    const termHistory = await Promise.all(
      assignments.map(async ({ class: cls, academicYear }) => {
        const terms = await this.prisma.term.findMany({
          where: { academicYearId: academicYear.id, schoolId },
          orderBy: { sequence: 'asc' },
        });

        return Promise.all(
          terms.map(async (term) => {
            const scores = await this.prisma.assessmentScore.findMany({
              where: { studentId, assessment: { schoolId, termId: term.id } },
              include: { assessment: { select: { totalScore: true } } },
            });

            const totalRaw = scores.reduce((s, r) => s + Number(r.rawScore), 0);
            const totalPossible = scores.reduce((s, r) => s + Number(r.assessment.totalScore), 0);
            const percentage = totalPossible > 0 ? Math.round((totalRaw / totalPossible) * 100) : null;

            const attendance = await this.prisma.studentAttendanceRecord.findMany({
              where: { schoolId, studentId, ...(term.startDate && term.endDate ? { date: { gte: term.startDate, lte: term.endDate } } : {}) },
            });
            const attendanceRate = attendance.length > 0
              ? Math.round((attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length / attendance.length) * 100)
              : null;

            return {
              academicYear: academicYear.name,
              term: term.name,
              class: cls.name,
              gradeLevel: cls.gradeLevel.name,
              percentage,
              attendanceRate,
              assessmentCount: scores.length,
            };
          }),
        );
      }),
    );

    const flat = termHistory.flat();
    const withScores = flat.filter((t) => t.percentage !== null);

    // Trend: flag declining performance over last 3 terms
    const recent = withScores.slice(-3);
    const declining = recent.length === 3 &&
      recent[0].percentage! > recent[1].percentage! &&
      recent[1].percentage! > recent[2].percentage!;

    return { student, history: flat, declining, termsTracked: flat.length };
  }

  // ── Attendance — daily trend ──────────────────────────────

  async attendanceDaily(schoolId: string, startDate: string, endDate: string, classId?: string) {
    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: {
        schoolId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
        ...(classId ? { classId } : {}),
      },
      select: { date: true, status: true },
    });

    const map = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (const r of records) {
      const k = r.date.toISOString().slice(0, 10);
      const e = map.get(k) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      if (r.status === 'PRESENT') e.present++;
      else if (r.status === 'ABSENT') e.absent++;
      else if (r.status === 'LATE') e.late++;
      else if (r.status === 'EXCUSED') e.excused++;
      map.set(k, e);
    }

    const days = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e]) => {
        const total = e.present + e.absent + e.late + e.excused;
        return { date, ...e, total, rate: total > 0 ? Math.round(((e.present + e.late) / total) * 100) : 0 };
      });

    return { days };
  }

  // ── Attendance — coverage (who hasn't marked) ─────────────

  async attendanceCoverage(schoolId: string, startDate: string, endDate: string) {
    const schoolDays = new Set(await this.schoolDayKeys(schoolId, startDate, endDate));

    const classes = await this.prisma.class.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        classTeachers: {
          select: { staffProfile: { select: { user: { select: { firstName: true, lastName: true } } } } },
        },
      },
    });

    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: { schoolId, date: { gte: new Date(startDate), lte: new Date(endDate) } },
      select: { classId: true, date: true },
    });

    const markedByClass = new Map<string, Set<string>>();
    for (const r of records) {
      const k = r.date.toISOString().slice(0, 10);
      if (!schoolDays.has(k)) continue;
      const set = markedByClass.get(r.classId) ?? new Set<string>();
      set.add(k);
      markedByClass.set(r.classId, set);
    }

    const allDays = Array.from(schoolDays).sort();
    const rows = classes.map((c) => {
      const marked = markedByClass.get(c.id) ?? new Set<string>();
      const missingDates = allDays.filter((d) => !marked.has(d));
      return {
        class: { id: c.id, name: c.name },
        classTeachers: c.classTeachers.map((t) => `${t.staffProfile.user.firstName} ${t.staffProfile.user.lastName}`),
        markedCount: marked.size,
        missingCount: missingDates.length,
        missingDates,
      };
    });

    return { schoolDayCount: schoolDays.size, rows: rows.sort((a, b) => b.missingCount - a.missingCount) };
  }

  // ── Transport — daily history ─────────────────────────────

  async transportDaily(schoolId: string, startDate: string, endDate: string, routeId?: string) {
    let studentFilter: { studentId: { in: string[] } } | object = {};
    if (routeId) {
      const assigns = await this.prisma.studentTransportAssignment.findMany({
        where: { transportRouteId: routeId, transportRoute: { schoolId } },
        select: { studentId: true },
      });
      studentFilter = { studentId: { in: assigns.map((a) => a.studentId) } };
    }

    const [records, payments] = await Promise.all([
      this.prisma.transportDailyRecord.findMany({
        where: { schoolId, recordDate: { gte: new Date(startDate), lte: new Date(endDate) }, ...studentFilter },
        select: { recordDate: true, status: true },
      }),
      this.prisma.transportPayment.findMany({
        where: { schoolId, paymentDate: { gte: new Date(startDate), lte: new Date(endDate) }, ...studentFilter },
        select: { paymentDate: true, amountPaid: true },
      }),
    ]);

    const map = new Map<string, { paid: number; preCovered: number; unpaid: number; absent: number; collected: number }>();
    const get = (k: string) => {
      const e = map.get(k) ?? { paid: 0, preCovered: 0, unpaid: 0, absent: 0, collected: 0 };
      map.set(k, e);
      return e;
    };
    for (const r of records) {
      const e = get(r.recordDate.toISOString().slice(0, 10));
      if (r.status === 'PAID') e.paid++;
      else if (r.status === 'PRE_COVERED') e.preCovered++;
      else if (r.status === 'UNPAID') e.unpaid++;
      else if (r.status === 'ABSENT') e.absent++;
    }
    for (const p of payments) {
      get(p.paymentDate.toISOString().slice(0, 10)).collected += Number(p.amountPaid);
    }

    const days = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e]) => ({ date, ...e, riders: e.paid + e.preCovered + e.unpaid }));

    // Period financials are always whole-stream: collected can be route-scoped
    // but expenses aren't attributable to a route, so the net summary ignores the
    // route filter (which only governs the daily-history table above).
    const [collectedAgg, spentAgg] = await Promise.all([
      this.prisma.transportPayment.aggregate({
        where: { schoolId, paymentDate: { gte: new Date(startDate), lte: new Date(endDate) } },
        _sum: { amountPaid: true },
      }),
      this.prisma.expense.aggregate({
        where: { schoolId, costCenter: 'TRANSPORT', expenseDate: { gte: new Date(startDate), lte: new Date(endDate) } },
        _sum: { amount: true },
      }),
    ]);
    const collected = Number(collectedAgg._sum.amountPaid ?? 0);
    const spent = Number(spentAgg._sum.amount ?? 0);

    return { days, totals: { collected, spent, net: collected - spent } };
  }

  private async getActiveYearId(schoolId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isActive: true } });
    if (!year) throw new NotFoundException('No active academic year');
    return year.id;
  }
}
