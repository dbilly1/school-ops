import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { retryOnUniqueViolation } from '../common/retry-unique';
import { CreateStudentDto, UpdateStudentDto, AddGuardianDto, AssignClassDto } from './dto/student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  // ── Create directly (bypass admissions) ──────────────────

  async create(schoolId: string, dto: CreateStudentDto) {
    const year = new Date().getFullYear();

    // Generate portal credentials
    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Generate the YYYY#### student ID inside a retried transaction so a unique
    // collision under concurrent inserts recomputes instead of failing.
    return retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
      const count = await tx.student.count({ where: { schoolId } });
      const studentId = `${year}${String(count + 1).padStart(4, '0')}`;

      const student = await tx.student.create({
        data: {
          schoolId,
          studentId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          gender: dto.gender ?? null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
          portalCredential: {
            create: { passwordHash, tempPassword, mustChange: true },
          },
        },
      });

      // Assign to class if provided
      if (dto.classId) {
        const cls = await tx.class.findFirst({
          where: { id: dto.classId, schoolId },
          select: { id: true },
        });
        if (cls) {
          const activeYear = await tx.academicYear.findFirst({
            where: { schoolId, isActive: true },
            select: { id: true },
          });
          if (activeYear) {
            await tx.studentClassAssignment.create({
              data: {
                studentId: student.id,
                classId: cls.id,
                academicYearId: activeYear.id,
                schoolId,
              },
            });
          }
        }
      }

      return {
        id: student.id,
        studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        tempPassword,
      };
      }),
    );
  }

  async findAll(schoolId: string, classId?: string, academicYearId?: string) {
    return this.prisma.student.findMany({
      where: {
        schoolId,
        ...(classId || academicYearId
          ? {
              classAssignments: {
                some: {
                  ...(classId ? { classId } : {}),
                  ...(academicYearId ? { academicYearId } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        id: true, studentId: true, firstName: true, lastName: true,
        gender: true, enrolledAt: true,
        classAssignments: {
          include: { class: { include: { gradeLevel: { select: { id: true, name: true } } } } },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(schoolId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId },
      include: {
        guardians: true,
        classAssignments: {
          include: {
            class: { include: { gradeLevel: { select: { id: true, name: true } } } },
            academicYear: { select: { id: true, name: true } },
          },
          orderBy: { assignedAt: 'desc' },
        },
        portalCredential: { select: { mustChange: true, tempPassword: true, updatedAt: true } },
        transportAssignment: {
          include: { transportRoute: { select: { id: true, name: true, dailyRate: true } } },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async update(schoolId: string, id: string, dto: UpdateStudentDto) {
    const student = await this.prisma.student.findFirst({ where: { id, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    return this.prisma.student.update({
      where: { id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });
  }

  async addGuardian(schoolId: string, studentId: string, dto: AddGuardianDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.guardianRelationship.updateMany({
          where: { studentId },
          data: { isPrimary: false },
        });
      }
      return tx.guardianRelationship.create({
        data: { studentId, ...dto },
      });
    });
  }

  async removeGuardian(schoolId: string, studentId: string, guardianId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    // Scope the delete to this student so a guardian id from another student
    // (GuardianRelationship has no schoolId, so the tenant guard can't cover it)
    // can't be deleted.
    const { count } = await this.prisma.guardianRelationship.deleteMany({
      where: { id: guardianId, studentId },
    });
    if (count === 0) throw new NotFoundException('Guardian not found');
    return { id: guardianId };
  }

  async assignClass(schoolId: string, studentId: string, dto: AssignClassDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    const academicYearId = dto.academicYearId ?? await this.getActiveYearId(schoolId);

    return this.prisma.studentClassAssignment.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId } },
      update: { classId: dto.classId },
      create: { studentId, classId: dto.classId, academicYearId, schoolId },
      include: {
        class: { include: { gradeLevel: { select: { id: true, name: true } } } },
        academicYear: { select: { id: true, name: true } },
      },
    });
  }

  async resetPortalPassword(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        portalCredential: true,
        guardians: true,
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.studentPortalCredential.upsert({
      where: { studentId },
      update: { passwordHash, tempPassword, mustChange: true },
      create: { studentId, passwordHash, tempPassword, mustChange: true },
    });

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    const studentName = `${student.firstName} ${student.lastName}`;
    const portalUrl   = `${this.config.get('APP_URL') ?? 'http://localhost:3000'}/portal/login`;

    // Send to all guardian emails linked to this student
    const guardianEmails = student.guardians
      .map(g => g.email)
      .filter((e): e is string => !!e);

    for (const email of guardianEmails) {
      await this.mail.sendPortalCredentials({
        to: email,
        studentName,
        schoolName: school?.name ?? 'your school',
        studentId: student.studentId,
        tempPassword,
        portalUrl,
      });
    }

    return { message: 'Portal credentials sent to guardian email(s).' };
  }

  // Performance tracking — all years
  async getPerformanceHistory(schoolId: string, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { studentId: id },
      include: {
        class: { include: { gradeLevel: { select: { id: true, name: true } } } },
        academicYear: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });

    const scores = await this.prisma.assessmentScore.findMany({
      where: { studentId: id },
      include: {
        assessment: {
          select: {
            title: true, totalScore: true, assessmentDate: true,
            term: { select: { name: true, academicYear: { select: { name: true } } } },
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { assessment: { assessmentDate: 'asc' } },
    });

    return { student: { id, studentId: student.studentId, firstName: student.firstName, lastName: student.lastName }, assignments, scores };
  }

  private async getActiveYearId(schoolId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isActive: true } });
    if (!year) throw new NotFoundException('No active academic year found');
    return year.id;
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}
