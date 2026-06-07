import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { ReportCardPdfService } from '../report-cards/report-card-pdf.service';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private reportCards: ReportCardsService,
    private reportCardPdf: ReportCardPdfService,
  ) {}

  // First-login / self-service password change for a student portal account.
  async changePassword(studentId: string, dto: ChangePasswordDto) {
    const cred = await this.prisma.studentPortalCredential.findUnique({ where: { studentId } });
    if (!cred) throw new NotFoundException('Portal account not found');

    const ok = await bcrypt.compare(dto.currentPassword, cred.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (!dto.newPassword || dto.newPassword.length < 6)
      throw new BadRequestException('New password must be at least 6 characters');

    await this.prisma.studentPortalCredential.update({
      where: { studentId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 10),
        mustChange: false,
        tempPassword: null,
      },
    });

    return { success: true };
  }

  async getReportCardPdf(studentId: string, schoolId: string, termId: string): Promise<Buffer> {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { studentId, termId, publishedAt: { not: null } },
    });
    if (!reportCard) throw new NotFoundException('Report card not available');
    return this.reportCardPdf.generate(schoolId, studentId, termId);
  }

  async getStudentProfile(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        guardians: true,
        classAssignments: {
          include: {
            class: { include: { gradeLevel: { select: { id: true, name: true } } } },
            academicYear: { select: { id: true, name: true } },
          },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async getAttendance(studentId: string, schoolId: string, startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    const records = await this.prisma.studentAttendanceRecord.findMany({
      where: { studentId, schoolId, date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    return { records, summary: { total, present, absent: total - present, rate: total > 0 ? Math.round((present / total) * 100) : 0 } };
  }

  async getTimetable(studentId: string, schoolId: string) {
    const assignment = await this.prisma.studentClassAssignment.findFirst({
      where: { studentId },
      include: { class: true, academicYear: true },
      orderBy: { assignedAt: 'desc' },
    });
    if (!assignment) return null;

    const activeTerm = await this.prisma.term.findFirst({
      where: { schoolId, isActive: true },
    });
    if (!activeTerm) return null;

    const config = await this.prisma.timetableConfig.findFirst({
      where: { schoolId, termId: activeTerm.id },
      include: { breaks: { orderBy: { afterPeriod: 'asc' } } },
    });

    const slots = await this.prisma.timetableSlot.findMany({
      where: { schoolId, classId: assignment.classId, timetableConfigId: config?.id },
      include: { subject: { select: { id: true, name: true } } },
      orderBy: [{ day: 'asc' }, { periodNumber: 'asc' }],
    });

    return { class: assignment.class, term: activeTerm, config, slots };
  }

  async getReportCards(studentId: string, schoolId: string) {
    return this.prisma.reportCard.findMany({
      where: { studentId, publishedAt: { not: null } },
      include: { term: { include: { academicYear: { select: { id: true, name: true } } } } },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getReportCard(studentId: string, schoolId: string, termId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { studentId, termId, publishedAt: { not: null } },
    });
    if (!reportCard) throw new NotFoundException('Report card not available');
    return this.reportCards.getStudentReportCard(schoolId, studentId, termId);
  }

  async getNotices(schoolId: string) {
    return this.prisma.notice.findMany({
      where: { schoolId, publishedAt: { not: null } },
      select: { id: true, title: true, body: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
  }

  async getTransportInfo(studentId: string) {
    return this.prisma.studentTransportAssignment.findUnique({
      where: { studentId },
      include: {
        transportRoute: {
          include: {
            vehicle: { select: { plateNumber: true, model: true } },
            driver: { select: { name: true, phone: true } },
            pickupPoints: { orderBy: { sequence: 'asc' } },
          },
        },
      },
    });
  }

  async getFeedingBalance(studentId: string, schoolId: string) {
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true },
    });

    const enrollment = activeYear
      ? await this.prisma.feedingEnrollment.findFirst({
          where: { studentId, academicYearId: activeYear.id, isActive: true },
        })
      : null;

    if (!enrollment) return { enrolled: false };

    const preCoveredDays = await this.prisma.feedingDailyRecord.count({
      where: { studentId, status: 'PRE_COVERED', recordDate: { gte: new Date() } },
    });

    return { enrolled: true, daysRemaining: preCoveredDays };
  }

  async getNotifications(studentId: string, schoolId: string) {
    return this.prisma.notification.findMany({
      where: { recipientId: studentId, schoolId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
}
