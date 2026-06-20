import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCalendarEventDto } from './dto/calendar.dto';

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  fixed: boolean;
}

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getEvents(schoolId: string, academicYearId: string) {
    return this.prisma.schoolCalendarEvent.findMany({
      where: { schoolId, academicYearId },
      orderBy: { startDate: 'asc' },
    });
  }

  async createEvent(schoolId: string, dto: CreateCalendarEventDto, userId: string) {
    const academicYearId = dto.academicYearId ?? await this.getActiveYearId(schoolId);
    return this.prisma.schoolCalendarEvent.create({
      data: {
        schoolId,
        academicYearId,
        eventType: dto.eventType,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        source: 'MANUAL',
        confirmedBy: userId,
        confirmedAt: new Date(),
      },
    });
  }

  async deleteEvent(schoolId: string, eventId: string) {
    const event = await this.prisma.schoolCalendarEvent.findFirst({
      where: { id: eventId, schoolId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return this.prisma.schoolCalendarEvent.delete({ where: { id: eventId } });
  }

  // Fetch public holidays from Nager.Date and stage them for admin review
  async fetchPublicHolidays(schoolId: string, academicYearId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, schoolId },
    });
    if (!year) throw new NotFoundException('Academic year not found');

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { country: true },
    });

    const apiUrl = this.config.get<string>('PUBLIC_HOLIDAYS_API_URL');
    const calYear = year.startDate ? new Date(year.startDate).getFullYear() : new Date().getFullYear();

    let holidays: NagerHoliday[] = [];
    try {
      const res = await fetch(`${apiUrl}/PublicHolidays/${calYear}/${school!.country}`);
      if (res.ok) holidays = (await res.json()) as NagerHoliday[];
    } catch {
      // API unavailable — return empty, admin can add manually
    }

    const staged = [];
    for (const h of holidays) {
      const date = new Date(h.date);
      if (year.startDate && date < new Date(year.startDate)) continue;
      if (year.endDate && date > new Date(year.endDate)) continue;

      const existing = await this.prisma.schoolCalendarEvent.findFirst({
        where: { schoolId, academicYearId, externalHolidayKey: h.date },
      });
      if (existing) continue;

      // Variable-date holidays (Eid etc.) marked tentative
      const isTentative = !h.fixed;
      const event = await this.prisma.schoolCalendarEvent.create({
        data: {
          schoolId,
          academicYearId,
          eventType: 'HOLIDAY',
          name: h.localName || h.name,
          startDate: date,
          endDate: date,
          source: isTentative ? 'TENTATIVE_PUBLIC_HOLIDAY' : 'PUBLIC_HOLIDAY_API',
          externalHolidayKey: h.date,
        },
      });
      staged.push(event);
    }

    return {
      staged: staged.length,
      holidays: staged,
      message: staged.length
        ? `${staged.length} public holiday(s) staged for review`
        : 'No new public holidays found for this period',
    };
  }

  async confirmHoliday(schoolId: string, eventId: string, userId: string) {
    const event = await this.prisma.schoolCalendarEvent.findFirst({
      where: { id: eventId, schoolId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');

    return this.prisma.schoolCalendarEvent.update({
      where: { id: eventId },
      data: { confirmedBy: userId, confirmedAt: new Date() },
    });
  }

  async dismissHoliday(schoolId: string, eventId: string) {
    return this.deleteEvent(schoolId, eventId);
  }

  // Used by other services to check if a date is a school day
  async isSchoolDay(schoolId: string, date: Date): Promise<boolean> {
    const dateOnly = new Date(date.toDateString());

    // Weekends are never school days.
    const dow = dateOnly.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow === 0 || dow === 6) return false;

    const activeTerm = await this.prisma.term.findFirst({
      where: {
        schoolId,
        isActive: true,
        startDate: { lte: dateOnly },
        endDate: { gte: dateOnly },
      },
    });
    if (!activeTerm) return false;

    const holiday = await this.prisma.schoolCalendarEvent.findFirst({
      where: {
        schoolId,
        eventType: { in: ['HOLIDAY', 'VACATION'] },
        confirmedAt: { not: null },
        startDate: { lte: dateOnly },
        endDate: { gte: dateOnly },
      },
    });

    return !holiday;
  }

  // Classifies every calendar day within [start, end] so callers can render a
  // range while distinguishing school days from non-school ones. Resolved in a
  // single term + holiday lookup. Keys are UTC date strings to line up with how
  // attendance records store their date (UTC midnight). Returns the active term
  // bounds too so callers can offer an "entire term" range without a second call.
  async classifyDaysInRange(
    schoolId: string,
    start: Date,
    end: Date,
  ): Promise<{
    termStart: string | null;
    termEnd: string | null;
    days: { date: string; type: 'school' | 'weekend' | 'holiday' | 'off'; holidayName?: string }[];
  }> {
    const key = (d: Date) => d.toISOString().slice(0, 10);

    const activeTerm = await this.prisma.term.findFirst({
      where: { schoolId, isActive: true },
      select: { startDate: true, endDate: true },
    });
    const termStart = activeTerm?.startDate ? key(activeTerm.startDate) : null;
    const termEnd = activeTerm?.endDate ? key(activeTerm.endDate) : null;

    const holidays = await this.prisma.schoolCalendarEvent.findMany({
      where: {
        schoolId,
        eventType: { in: ['HOLIDAY', 'VACATION'] },
        confirmedAt: { not: null },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { startDate: true, endDate: true, name: true },
    });
    const holidayRanges = holidays
      .filter((h) => h.startDate && h.endDate)
      .map((h) => ({ s: key(h.startDate as Date), e: key(h.endDate as Date), name: h.name }));

    const days: { date: string; type: 'school' | 'weekend' | 'holiday' | 'off'; holidayName?: string }[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (cursor <= last) {
      const k = key(cursor);
      const dow = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
      if (dow === 0 || dow === 6) {
        days.push({ date: k, type: 'weekend' });
      } else if (!termStart || !termEnd || k < termStart || k > termEnd) {
        days.push({ date: k, type: 'off' });
      } else {
        const holiday = holidayRanges.find((r) => k >= r.s && k <= r.e);
        days.push(holiday ? { date: k, type: 'holiday', holidayName: holiday.name } : { date: k, type: 'school' });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { termStart, termEnd, days };
  }

  private async getActiveYearId(schoolId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isActive: true },
    });
    if (!year) throw new NotFoundException('No active academic year found');
    return year.id;
  }
}
