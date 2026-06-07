import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Aggregated staff-dashboard payload. Each section is computed defensively so a
// missing feature / no active term never fails the whole request.
@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(schoolId: string, roles: string[]) {
    const privileged = roles.includes('SCHOOL_OWNER') || roles.includes('SCHOOL_ADMIN');

    const [counts, academics, activity] = await Promise.all([
      this.getCounts(schoolId, privileged),
      this.getAcademics(schoolId),
      this.getActivity(schoolId, privileged),
    ]);

    return { scope: privileged ? 'full' : 'restricted', counts, academics, activity };
  }

  // ── Core counts ───────────────────────────────────────────
  private async getCounts(schoolId: string, privileged: boolean) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();   todayEnd.setHours(23, 59, 59, 999);

    const [students, staff, attendanceToday, outstanding] = await Promise.all([
      this.prisma.student.count({ where: { schoolId } }).catch(() => 0),
      this.prisma.user.count({ where: { schoolId, isActive: true } }).catch(() => 0),
      this.prisma.studentAttendanceRecord
        .findMany({
          where: { schoolId, date: { gte: todayStart, lte: todayEnd } },
          select: { status: true },
        })
        .catch(() => [] as { status: string }[]),
      privileged ? this.getOutstandingTotal(schoolId).catch(() => null) : Promise.resolve(null),
    ]);

    const totalMarked = attendanceToday.length;
    const present = attendanceToday.filter(
      (r) => r.status === 'PRESENT' || r.status === 'LATE',
    ).length;

    return {
      students,
      staff,
      present: {
        present,
        total: totalMarked,
        rate: totalMarked > 0 ? Math.round((present / totalMarked) * 100) : null,
      },
      outstanding, // GHS total, or null when not privileged / unavailable
    };
  }

  private async getOutstandingTotal(schoolId: string): Promise<number | null> {
    const activeTerm = await this.prisma.term.findFirst({
      where: { schoolId, isActive: true },
      select: { id: true },
    });
    if (!activeTerm) return null;

    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId: activeTerm.id },
      select: { amount: true, amountPaid: true },
    });

    return invoices.reduce((sum, inv) => {
      const balance = Number(inv.amount) - Number(inv.amountPaid);
      return sum + (balance > 0 ? balance : 0);
    }, 0);
  }

  // ── Academics snapshot ────────────────────────────────────
  private async getAcademics(schoolId: string) {
    const activeTerm = await this.prisma.term
      .findFirst({ where: { schoolId, isActive: true }, select: { id: true, name: true } })
      .catch(() => null);

    const [recentAssessments, termAssessments] = await Promise.all([
      this.prisma.assessment
        .findMany({
          where: { schoolId },
          include: {
            subject: { select: { name: true } },
            term: { select: { name: true } },
            _count: { select: { scores: true } },
          },
          orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        })
        .catch(() => []),
      activeTerm
        ? this.prisma.assessment
            .findMany({
              where: { schoolId, termId: activeTerm.id },
              select: { _count: { select: { scores: true } } },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const scored = termAssessments.filter((a) => a._count.scores > 0).length;

    return {
      activeTerm: activeTerm?.name ?? null,
      recentAssessments: recentAssessments.map((a) => ({
        id: a.id,
        title: a.title,
        subject: a.subject.name,
        term: a.term.name,
        totalScore: a.totalScore,
        scoresRecorded: a._count.scores,
        assessmentDate: a.assessmentDate,
      })),
      scoring: { total: termAssessments.length, scored },
    };
  }

  // ── Activity & alerts ─────────────────────────────────────
  private async getActivity(schoolId: string, privileged: boolean) {
    const now = new Date();

    const [recentAdmissions, upcomingEvents, birthdayCandidates] = await Promise.all([
      privileged
        ? this.prisma.admissionRecord
            .findMany({
              where: { schoolId },
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: { id: true, stage: true, formData: true, createdAt: true },
            })
            .catch(() => [])
        : Promise.resolve(null),
      this.prisma.schoolCalendarEvent
        .findMany({
          where: { schoolId, startDate: { gte: now } },
          orderBy: { startDate: 'asc' },
          take: 5,
          select: { id: true, name: true, eventType: true, startDate: true, endDate: true },
        })
        .catch(() => []),
      this.prisma.student
        .findMany({
          where: { schoolId, dateOfBirth: { not: null } },
          select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
        })
        .catch(() => []),
    ]);

    const birthdaysToday = birthdayCandidates
      .filter((s) => {
        if (!s.dateOfBirth) return false;
        const d = new Date(s.dateOfBirth);
        return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      })
      .map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName }));

    return {
      recentAdmissions: recentAdmissions
        ? recentAdmissions.map((a) => ({
            id: a.id,
            stage: a.stage,
            name: this.extractName(a.formData),
            createdAt: a.createdAt,
          }))
        : null,
      upcomingEvents,
      birthdaysToday,
    };
  }

  // Admission formData is free-form JSON — pull a display name best-effort.
  private extractName(formData: unknown): string {
    if (formData && typeof formData === 'object') {
      const f = formData as Record<string, unknown>;
      const first = (f.firstName ?? f.first_name ?? f.childFirstName ?? '') as string;
      const last = (f.lastName ?? f.last_name ?? f.childLastName ?? '') as string;
      const full = `${first} ${last}`.trim();
      if (full) return full;
      if (typeof f.name === 'string' && f.name.trim()) return f.name.trim();
    }
    return 'New applicant';
  }
}
