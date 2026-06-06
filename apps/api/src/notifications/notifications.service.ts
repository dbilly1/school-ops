import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface EmitPayload {
  eventType: string;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getForUser(userId: string, schoolId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId, schoolId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string, schoolId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: userId, schoolId, isRead: false },
    });
  }

  async markRead(userId: string, schoolId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, recipientId: userId, schoolId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string, schoolId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientId: userId, schoolId, isRead: false },
      data: { isRead: true },
    });
  }

  // Emit a notification to a specific user
  async emitToUser(schoolId: string, recipientId: string, payload: EmitPayload) {
    await this.prisma.notificationEventLog.create({
      data: { schoolId, eventType: payload.eventType, payload: payload as object },
    });

    return this.prisma.notification.create({
      data: {
        schoolId,
        recipientId,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body,
      },
    });
  }

  // Emit a notification to all active staff in a school
  async emitToSchool(schoolId: string, payload: EmitPayload) {
    const users = await this.prisma.user.findMany({
      where: { schoolId, isActive: true },
      select: { id: true },
    });

    await this.prisma.notificationEventLog.create({
      data: { schoolId, eventType: payload.eventType, payload: payload as object },
    });

    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        schoolId,
        recipientId: u.id,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body,
      })),
    });

    return { sent: users.length };
  }

  // Emit to portal users (students linked to a student record)
  async emitToPortalUser(schoolId: string, studentId: string, payload: EmitPayload) {
    await this.prisma.notificationEventLog.create({
      data: { schoolId, eventType: payload.eventType, payload: payload as object },
    });

    return this.prisma.notification.create({
      data: {
        schoolId,
        recipientId: studentId,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body,
      },
    });
  }
}
