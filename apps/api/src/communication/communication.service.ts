import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateNoticeDto, CreateAnnouncementDto } from './dto/communication.dto';

@Injectable()
export class CommunicationService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Notices ───────────────────────────────────────────────

  async findNotices(schoolId: string, publishedOnly = false) {
    return this.prisma.notice.findMany({
      where: { schoolId, ...(publishedOnly ? { publishedAt: { not: null } } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNotice(schoolId: string, dto: CreateNoticeDto, createdBy: string) {
    return this.prisma.notice.create({
      data: { schoolId, title: dto.title, body: dto.body, createdBy },
    });
  }

  async publishNotice(schoolId: string, id: string) {
    const notice = await this.prisma.notice.findFirst({ where: { id, schoolId } });
    if (!notice) throw new NotFoundException('Notice not found');

    const published = await this.prisma.notice.update({
      where: { id },
      data: { publishedAt: new Date() },
    });

    // Notify all active staff
    await this.notifications.emitToSchool(schoolId, {
      eventType: 'notice.published',
      title: 'New Notice',
      body: notice.title,
    });

    return published;
  }

  async deleteNotice(schoolId: string, id: string) {
    const notice = await this.prisma.notice.findFirst({ where: { id, schoolId } });
    if (!notice) throw new NotFoundException('Notice not found');
    return this.prisma.notice.delete({ where: { id } });
  }

  // ── Announcements ─────────────────────────────────────────

  async findAnnouncements(schoolId: string, publishedOnly = false) {
    return this.prisma.announcement.findMany({
      where: { schoolId, ...(publishedOnly ? { publishedAt: { not: null } } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnnouncement(schoolId: string, dto: CreateAnnouncementDto, createdBy: string) {
    return this.prisma.announcement.create({
      data: { schoolId, title: dto.title, body: dto.body, createdBy },
    });
  }

  async publishAnnouncement(schoolId: string, id: string) {
    const announcement = await this.prisma.announcement.findFirst({ where: { id, schoolId } });
    if (!announcement) throw new NotFoundException('Announcement not found');

    const published = await this.prisma.announcement.update({
      where: { id },
      data: { publishedAt: new Date() },
    });

    await this.notifications.emitToSchool(schoolId, {
      eventType: 'announcement.published',
      title: 'New Announcement',
      body: announcement.title,
    });

    return published;
  }

  async deleteAnnouncement(schoolId: string, id: string) {
    const announcement = await this.prisma.announcement.findFirst({ where: { id, schoolId } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return this.prisma.announcement.delete({ where: { id } });
  }
}
