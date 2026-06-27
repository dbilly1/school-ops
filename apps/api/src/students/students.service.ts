import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Prisma, StaffRole, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { TeacherScopeService } from '../staff/teacher-scope.service';
import { retryOnUniqueViolation } from '../common/retry-unique';
import { nextStudentId } from '../common/student-id';
import { generateTempPassword } from '../common/password.util';
import { parseImportDate } from '../common/parse-date';
import { CreateStudentDto, UpdateStudentDto, AddGuardianDto, AssignClassDto, BulkAssignCategoryDto } from './dto/student.dto';
import { ImportStudentRowDto } from './dto/import-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
    private teacherScope: TeacherScopeService,
  ) {}

  // ── Create directly (bypass admissions) ──────────────────

  async create(schoolId: string, dto: CreateStudentDto) {
    if (dto.studentCategoryId) await this.assertCategoryInSchool(schoolId, dto.studentCategoryId);

    return this.createStudentRecord(schoolId, {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      gender: dto.gender ?? null,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      studentCategoryId: dto.studentCategoryId || null,
      classId: dto.classId || null,
    });
  }

  /**
   * Create a single student row + portal credential, optionally assigning a
   * class (active year) and a primary guardian. Shared by the single-add path
   * and the bulk importer so ID allocation, credentials and class wiring stay
   * identical. Each call is its own retried transaction, so in a batch one bad
   * row never rolls back the others.
   */
  private async createStudentRecord(
    schoolId: string,
    input: {
      firstName: string;
      lastName: string;
      gender?: string | null;
      dateOfBirth?: Date | null;
      phone?: string | null;
      address?: string | null;
      studentCategoryId?: string | null;
      classId?: string | null;
      guardian?: { name: string; relationship: string; phone?: string | null } | null;
    },
  ) {
    // Generate portal credentials
    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Allocate the human-readable student ID inside a retried transaction. The
    // sequence is an atomic counter on the school, so this is collision-free;
    // the retry only guards the rare case of a manually-edited prefix clashing.
    return retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
      const studentId = await nextStudentId(tx, schoolId);

      const student = await tx.student.create({
        data: {
          schoolId,
          studentId,
          firstName: input.firstName,
          lastName: input.lastName,
          gender: input.gender ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          studentCategoryId: input.studentCategoryId || null,
          portalCredential: {
            create: { passwordHash, tempPassword, mustChange: true },
          },
        },
      });

      // Assign to class if provided
      if (input.classId) {
        const cls = await tx.class.findFirst({
          where: { id: input.classId, schoolId },
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

      // Attach a primary guardian if one was supplied
      if (input.guardian?.name) {
        await tx.guardianRelationship.create({
          data: {
            studentId: student.id,
            name: input.guardian.name,
            relationship: input.guardian.relationship || 'Guardian',
            phone: input.guardian.phone || null,
            isPrimary: true,
          },
        });
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

  async findAll(
    schoolId: string,
    userId: string,
    roles: StaffRole[],
    classId?: string,
    academicYearId?: string,
    studentCategoryId?: string,
    status?: string,
  ) {
    // Restricted teachers only see students in classes they teach (null = unrestricted).
    const scope = await this.teacherScope.studentScopeFilter(userId, roles);
    const base: Prisma.StudentWhereInput = {
      schoolId,
      // Default view is active students only; 'archived' / 'all' opt in explicitly.
      ...(status === 'all'
        ? {}
        : status === 'archived'
          ? { status: 'ARCHIVED' }
          : { status: 'ACTIVE' }),
      // 'none' = students with no category assigned; any other value filters to it
      ...(studentCategoryId === 'none'
        ? { studentCategoryId: null }
        : studentCategoryId
          ? { studentCategoryId }
          : {}),
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
    };
    return this.prisma.student.findMany({
      where: scope ? { AND: [base, scope] } : base,
      select: {
        id: true, studentId: true, firstName: true, lastName: true,
        gender: true, enrolledAt: true, dateOfBirth: true, address: true,
        status: true, archivedAt: true,
        studentCategory: { select: { id: true, name: true } },
        classAssignments: {
          include: { class: { include: { gradeLevel: { select: { id: true, name: true } } } } },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
        guardians: {
          where: { isPrimary: true },
          select: { name: true, phone: true },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(schoolId: string, id: string, userId: string, roles: StaffRole[]) {
    const scope = await this.teacherScope.studentScopeFilter(userId, roles);
    const student = await this.prisma.student.findFirst({
      where: scope ? { AND: [{ id, schoolId }, scope] } : { id, schoolId },
      include: {
        guardians: true,
        studentCategory: { select: { id: true, name: true } },
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

    // studentCategoryId: undefined = leave as-is, '' = clear, value = set (validated)
    let studentCategoryId: string | null | undefined = undefined;
    if (dto.studentCategoryId !== undefined) {
      studentCategoryId = dto.studentCategoryId || null;
      if (studentCategoryId) await this.assertCategoryInSchool(schoolId, studentCategoryId);
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        ...dto,
        studentCategoryId,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });
  }

  async bulkAssignCategory(schoolId: string, dto: BulkAssignCategoryDto) {
    const categoryId = dto.studentCategoryId || null;
    if (categoryId) await this.assertCategoryInSchool(schoolId, categoryId);

    // schoolId in the where clause keeps the update tenant-scoped — ids from
    // another school are silently ignored rather than updated.
    const { count } = await this.prisma.student.updateMany({
      where: { id: { in: dto.studentIds }, schoolId },
      data: { studentCategoryId: categoryId },
    });
    return { updated: count };
  }

  // ── Archive / restore (soft delete) ──────────────────────

  /** Set ACTIVE/ARCHIVED for many students at once. schoolId scopes the update. */
  async bulkSetStatus(schoolId: string, studentIds: string[], status: StudentStatus) {
    const { count } = await this.prisma.student.updateMany({
      where: { id: { in: studentIds }, schoolId },
      data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null },
    });
    return { updated: count };
  }

  // ── Bulk assign class ────────────────────────────────────

  /** Assign many students to one class for the active (or given) year. */
  async bulkAssignClass(schoolId: string, studentIds: string[], classId: string, academicYearId?: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } });
    if (!cls) throw new NotFoundException('Class not found');

    const yearId = academicYearId ?? (await this.getActiveYearId(schoolId));

    // Only operate on students that belong to this school (tenant-scoped).
    const owned = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true },
    });

    // One assignment per student+year — upsert so re-assigning just moves the class.
    let updated = 0;
    for (const { id } of owned) {
      await this.prisma.studentClassAssignment.upsert({
        where: { studentId_academicYearId: { studentId: id, academicYearId: yearId } },
        update: { classId },
        create: { studentId: id, classId, academicYearId: yearId, schoolId },
      });
      updated++;
    }
    return { updated };
  }

  // ── Bulk reset portal passwords ──────────────────────────

  /**
   * Regenerate portal passwords for many students and RETURN the new temp
   * passwords (for a printable sheet). Unlike the single reset, this does not
   * email guardians — the caller hands out the downloaded list.
   */
  async bulkResetPassword(schoolId: string, studentIds: string[]) {
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, studentId: true, firstName: true, lastName: true },
    });

    const results: { studentId: string; firstName: string; lastName: string; tempPassword: string }[] = [];
    for (const s of students) {
      const tempPassword = this.generatePassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await this.prisma.studentPortalCredential.upsert({
        where: { studentId: s.id },
        update: { passwordHash, tempPassword, mustChange: true },
        create: { studentId: s.id, passwordHash, tempPassword, mustChange: true },
      });
      results.push({ studentId: s.studentId, firstName: s.firstName, lastName: s.lastName, tempPassword });
    }
    return { reset: results.length, credentials: results };
  }

  // ── Permanent delete (guarded) ───────────────────────────

  /**
   * Hard-delete students that have NO financial or academic history. Anything
   * with history (payments, grades, attendance, report cards, …) is skipped and
   * must be archived instead — we never destroy those records. Incidental rows
   * (credentials, guardians, class assignments, enrolments) are cleaned up.
   */
  async bulkDelete(schoolId: string, studentIds: string[]) {
    const owned = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, firstName: true, lastName: true, studentId: true },
    });
    const ownedIds = owned.map(s => s.id);
    if (ownedIds.length === 0) return { deleted: 0, skipped: [] as { studentId: string; name: string; reason: string }[] };

    // Find which students carry history we refuse to delete. One distinct query
    // per table keeps this O(tables), not O(students).
    const dirty = new Set<string>();
    const collect = async (rows: { studentId: string }[]) => rows.forEach(r => dirty.add(r.studentId));
    await Promise.all([
      this.prisma.assessmentScore.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.invoice.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.reportCard.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.studentAttendanceRecord.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.feedingPayment.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.transportPayment.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.feedingDailyRecord.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
      this.prisma.transportDailyRecord.findMany({ where: { studentId: { in: ownedIds } }, select: { studentId: true }, distinct: ['studentId'] }).then(collect),
    ]);

    const deletableIds = ownedIds.filter(id => !dirty.has(id));
    const skipped = owned
      .filter(s => dirty.has(s.id))
      .map(s => ({ studentId: s.studentId, name: `${s.firstName} ${s.lastName}`, reason: 'Has academic or financial records — archive instead' }));

    if (deletableIds.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        // Remove incidental children first (none of these cascade except refresh tokens).
        await tx.studentRefreshToken.deleteMany({ where: { studentId: { in: deletableIds } } });
        await tx.guardianRelationship.deleteMany({ where: { studentId: { in: deletableIds } } });
        await tx.studentClassAssignment.deleteMany({ where: { studentId: { in: deletableIds } } });
        await tx.feedingEnrollment.deleteMany({ where: { studentId: { in: deletableIds } } });
        await tx.studentTransportAssignment.deleteMany({ where: { studentId: { in: deletableIds } } });
        await tx.studentPortalCredential.deleteMany({ where: { studentId: { in: deletableIds } } });
        await tx.student.deleteMany({ where: { id: { in: deletableIds }, schoolId } });
      });
    }

    return { deleted: deletableIds.length, skipped };
  }

  // ── Bulk import from spreadsheet ─────────────────────────
  // Two-phase: validate (dry-run, writes nothing) then import (creates the
  // rows the client kept). Both re-resolve class/category names server-side so
  // the import never trusts client-supplied IDs.

  /** Dry run: per-row status + resolved fields, nothing written. */
  async validateImport(schoolId: string, rows: ImportStudentRowDto[]) {
    const results = await this.analyzeImport(schoolId, rows);
    return { rows: results, summary: this.summariseImport(results) };
  }

  /** Create every submitted row that isn't a hard error. */
  async importStudents(schoolId: string, rows: ImportStudentRowDto[]) {
    const results = await this.analyzeImport(schoolId, rows);

    const created: {
      rowIndex: number; studentId: string; firstName: string; lastName: string;
      className: string | null; tempPassword: string;
    }[] = [];
    const skipped: { rowIndex: number; reason: string }[] = [];

    for (const r of results) {
      if (r.status === 'error') {
        skipped.push({ rowIndex: r.rowIndex, reason: r.errors.join('; ') });
        continue;
      }
      try {
        const rec = await this.createStudentRecord(schoolId, {
          firstName: r.resolved.firstName,
          lastName: r.resolved.lastName,
          gender: r.resolved.gender,
          dateOfBirth: r.resolved.dateOfBirth ? new Date(r.resolved.dateOfBirth) : null,
          address: r.resolved.address,
          studentCategoryId: r.resolved.studentCategoryId,
          classId: r.resolved.classId,
          guardian: r.resolved.guardian,
        });
        created.push({
          rowIndex: r.rowIndex,
          studentId: rec.studentId,
          firstName: rec.firstName,
          lastName: rec.lastName,
          className: r.resolved.className,
          tempPassword: rec.tempPassword,
        });
      } catch {
        skipped.push({ rowIndex: r.rowIndex, reason: 'Could not be created — please retry.' });
      }
    }

    return { created, skipped, summary: { created: created.length, skipped: skipped.length } };
  }

  /** Resolve + validate every row against the school's classes/categories/roster. */
  private async analyzeImport(schoolId: string, rows: ImportStudentRowDto[]) {
    const [classes, categories, existing] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      this.prisma.studentCategory.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      this.prisma.student.findMany({
        where: { schoolId },
        select: { firstName: true, lastName: true, dateOfBirth: true },
      }),
    ]);

    const classByName = new Map(classes.map(c => [c.name.trim().toLowerCase(), c]));
    const categoryByName = new Map(categories.map(c => [c.name.trim().toLowerCase(), c]));
    const existingKeys = new Set(existing.map(s => dupKey(s.firstName, s.lastName, s.dateOfBirth)));
    const seenInBatch = new Set<string>();

    return rows.map((row, rowIndex) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const firstName = (row.firstName ?? '').trim();
      const lastName = (row.lastName ?? '').trim();
      if (!firstName) errors.push('First name is required');
      if (!lastName) errors.push('Last name is required');

      // Date of birth
      let dobIso: string | null = null;
      const dob = parseImportDate(row.dateOfBirth);
      if (dob === 'invalid') {
        errors.push(`Date of birth "${row.dateOfBirth?.trim()}" isn't a valid date`);
      } else if (dob) {
        dobIso = dob.toISOString().slice(0, 10);
      }

      // Class (optional) — must resolve by name when given
      let classId: string | null = null;
      let className: string | null = null;
      const classRaw = (row.className ?? '').trim();
      if (classRaw) {
        const match = classByName.get(classRaw.toLowerCase());
        if (match) { classId = match.id; className = match.name; }
        else errors.push(`Class "${classRaw}" doesn't exist`);
      }

      // Fee category (optional)
      let studentCategoryId: string | null = null;
      let categoryName: string | null = null;
      const catRaw = (row.categoryName ?? '').trim();
      if (catRaw) {
        const match = categoryByName.get(catRaw.toLowerCase());
        if (match) { studentCategoryId = match.id; categoryName = match.name; }
        else errors.push(`Fee category "${catRaw}" doesn't exist`);
      }

      // Guardian (optional) — only attached when a name is present
      const guardianName = (row.guardianName ?? '').trim();
      const guardian = guardianName
        ? {
            name: guardianName,
            relationship: (row.guardianRelationship ?? '').trim() || 'Guardian',
            phone: (row.guardianPhone ?? '').trim() || null,
          }
        : null;

      // Duplicate detection (warning only — never blocks)
      if (firstName && lastName) {
        const key = dupKey(firstName, lastName, dob && dob !== 'invalid' ? dob : null);
        if (existingKeys.has(key)) {
          warnings.push('A student with this name and date of birth already exists');
        }
        if (seenInBatch.has(key)) {
          warnings.push('Duplicate of an earlier row in this file');
        }
        seenInBatch.add(key);
      }

      const status: 'ok' | 'warning' | 'error' =
        errors.length ? 'error' : warnings.length ? 'warning' : 'ok';

      return {
        rowIndex,
        status,
        errors,
        warnings,
        resolved: {
          firstName,
          lastName,
          gender: normaliseGender(row.gender),
          dateOfBirth: dobIso,
          address: (row.address ?? '').trim() || null,
          classId,
          className,
          studentCategoryId,
          categoryName,
          guardian,
        },
      };
    });
  }

  private summariseImport(results: { status: 'ok' | 'warning' | 'error' }[]) {
    return {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      warning: results.filter(r => r.status === 'warning').length,
      error: results.filter(r => r.status === 'error').length,
    };
  }

  private async assertCategoryInSchool(schoolId: string, categoryId: string) {
    const category = await this.prisma.studentCategory.findFirst({
      where: { id: categoryId, schoolId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Student category not found');
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
  async getPerformanceHistory(schoolId: string, id: string, userId: string, roles: StaffRole[]) {
    const scope = await this.teacherScope.studentScopeFilter(userId, roles);
    const student = await this.prisma.student.findFirst({
      where: scope ? { AND: [{ id, schoolId }, scope] } : { id, schoolId },
    });
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
    return generateTempPassword(8);
  }
}

// ── Import helpers (module-level — no instance state) ──────

/** Stable key for duplicate detection: name (case-folded) + DOB (or none). */
function dupKey(firstName: string, lastName: string, dob: Date | null): string {
  const day = dob ? dob.toISOString().slice(0, 10) : '';
  return `${firstName.trim().toLowerCase()} ${lastName.trim().toLowerCase()} ${day}`;
}

/** Map common spreadsheet gender spellings to the stored Male/Female; pass others through. */
function normaliseGender(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'm' || lower === 'male' || lower === 'boy') return 'Male';
  if (lower === 'f' || lower === 'female' || lower === 'girl') return 'Female';
  return s;
}
