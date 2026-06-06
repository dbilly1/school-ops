import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GradingService } from '../school-setup/grading/grading.service';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private grading: GradingService,
  ) {}

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

    return {
      academicYearId: yearId,
      totalStudents,
      newStudents,
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

    return {
      termId,
      studentCount: rows.length,
      avgPercentage,
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

    return {
      termId,
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

    const totalCollected = payments.reduce((s, p) => s + Number(p.amountPaid), 0);

    return {
      startDate, endDate,
      totalCollected,
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

  private async getActiveYearId(schoolId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isActive: true } });
    if (!year) throw new NotFoundException('No active academic year');
    return year.id;
  }
}
