import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../school-setup/calendar/calendar.service';
import { TransportRecordPaymentDto, TransportMarkPaidDto } from './dto/transport-fees.dto';

@Injectable()
export class TransportFeesService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
  ) {}

  // ── Daily Collection Screen (per route) ───────────────────

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

    const records = await this.prisma.transportDailyRecord.findMany({
      where: {
        schoolId,
        studentId: { in: studentIds },
        recordDate: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
    });

    const attendanceRecords = await this.prisma.studentAttendanceRecord.findMany({
      where: {
        schoolId,
        studentId: { in: studentIds },
        date: { gte: this.startOfDay(dateObj), lte: this.endOfDay(dateObj) },
      },
    });

    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    const attendanceMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));

    const rows = assignments
      .map(({ student }) => {
        const attendance = attendanceMap.get(student.id);
        const isAbsent = attendance?.status === 'ABSENT';
        const record = recordMap.get(student.id);
        const status = isAbsent ? 'ABSENT' : record?.status ?? 'UNPAID';
        return { student, status, record: record ?? null };
      })
      .sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));

    const summary = {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      preCovered: rows.filter((r) => r.status === 'PRE_COVERED').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      unpaid: rows.filter((r) => r.status === 'UNPAID').length,
    };

    return { date, routeId, dailyRate: Number(route.dailyRate), isSchoolDay, rows, summary };
  }

  // Mark a student as paid today (cash collected now)
  async markPaid(schoolId: string, dto: TransportMarkPaidDto, collectedBy: string) {
    const dateObj = new Date(dto.date);
    const isSchoolDay = await this.calendar.isSchoolDay(schoolId, dateObj);
    if (!isSchoolDay) throw new BadRequestException('Not a school day');

    return this.prisma.transportDailyRecord.upsert({
      where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: dateObj } },
      update: { status: 'PAID' },
      create: { schoolId, studentId: dto.studentId, recordDate: dateObj, status: 'PAID' },
    });
  }

  // Record a pre-payment — cash received today, future days pre-marked
  async recordPrePayment(schoolId: string, dto: TransportRecordPaymentDto, collectedBy: string) {
    const paymentDate = new Date(dto.paymentDate);

    // Daily rate comes from the student's assigned route
    const assignment = await this.prisma.studentTransportAssignment.findUnique({
      where: { studentId: dto.studentId },
      include: { transportRoute: { select: { schoolId: true, dailyRate: true } } },
    });
    if (!assignment || assignment.transportRoute.schoolId !== schoolId)
      throw new NotFoundException('Student is not assigned to a transport route');

    const dailyRate = Number(assignment.transportRoute.dailyRate);
    if (!dailyRate || dailyRate <= 0)
      throw new BadRequestException('No transport rate configured for this route');

    const daysCovered = Math.floor(dto.amountPaid / dailyRate);
    if (daysCovered < 1) throw new BadRequestException("Amount is less than one day's rate");

    const payment = await this.prisma.transportPayment.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        amountPaid: dto.amountPaid,
        paymentDate,
        daysCovered,
        recordedBy: collectedBy,
      },
    });

    const schoolDays = await this.getNextSchoolDays(schoolId, paymentDate, daysCovered);

    await this.prisma.$transaction(
      schoolDays.map((day) =>
        this.prisma.transportDailyRecord.upsert({
          where: { schoolId_studentId_recordDate: { schoolId, studentId: dto.studentId, recordDate: day } },
          update: { status: 'PRE_COVERED', transportPaymentId: payment.id },
          create: { schoolId, studentId: dto.studentId, recordDate: day, status: 'PRE_COVERED', transportPaymentId: payment.id },
        }),
      ),
    );

    return { payment, daysCovered, daysMarked: schoolDays.length };
  }

  // Daily reconciliation — how much cash was collected today
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
