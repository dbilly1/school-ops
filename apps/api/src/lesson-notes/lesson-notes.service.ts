import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, LessonNoteStatus, LessonNoteFormatPolicy, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TeacherScopeService } from '../staff/teacher-scope.service';
import { CreateLessonNoteDto, UpdateLessonNoteDto, ReviewLessonNoteDto } from './dto/lesson-note.dto';
import { prepareLessonNoteContent } from './lesson-note-content';

// Lesson notes are a submit → review → approve/return workflow. Authoring is
// scoped to the author (a teacher manages only their own); review endpoints are
// permission-gated (academics:lesson_note_review) at the controller, so any
// caller reaching the review methods is already an authorized reviewer.
@Injectable()
export class LessonNotesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private teacherScope: TeacherScopeService,
  ) {}

  private dayUtc(dateStr: string): Date {
    const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new BadRequestException('Invalid date');
    return d;
  }

  private readonly listInclude = {
    author: { select: { id: true, firstName: true, lastName: true } },
    reviewer: { select: { id: true, firstName: true, lastName: true } },
    class: { select: { id: true, name: true } },
    subject: { select: { id: true, name: true } },
    term: { select: { id: true, name: true } },
  };

  // ── Authoring (the teacher's own notes) ───────────────────────────────────

  async listMine(schoolId: string, userId: string, termId?: string, status?: string) {
    return this.prisma.lessonNote.findMany({
      where: {
        schoolId,
        authorId: userId,
        ...(termId ? { termId } : {}),
        ...(status ? { status: status as LessonNoteStatus } : {}),
      },
      orderBy: [{ weekEnding: 'desc' }, { updatedAt: 'desc' }],
      include: this.listInclude,
    });
  }

  async getMine(schoolId: string, userId: string, id: string) {
    const note = await this.prisma.lessonNote.findFirst({
      where: { id, schoolId, authorId: userId },
      include: this.listInclude,
    });
    if (!note) throw new NotFoundException('Lesson note not found');
    return note;
  }

  async create(schoolId: string, userId: string, roles: StaffRole[], dto: CreateLessonNoteDto) {
    await this.assertRefs(schoolId, dto.classId, dto.subjectId, dto.termId);
    // Class-teacher latitude: a restricted teacher may only author for a subject
    // they teach in that class (or, as class teacher, any subject of their class).
    await this.teacherScope.assertCanAuthorLessonNote(userId, roles, dto.subjectId, dto.classId);
    const policy = await this.getPolicy(schoolId);
    const content = prepareLessonNoteContent(dto.content, policy);
    try {
      return await this.prisma.lessonNote.create({
        data: {
          schoolId,
          authorId: userId,
          classId: dto.classId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          weekEnding: this.dayUtc(dto.weekEnding),
          title: dto.title?.trim() || null,
          content,
          status: 'DRAFT',
        },
        include: this.listInclude,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('You already have a lesson note for this class, subject and week.');
      }
      throw e;
    }
  }

  async update(schoolId: string, userId: string, id: string, dto: UpdateLessonNoteDto) {
    const note = await this.prisma.lessonNote.findFirst({ where: { id, schoolId, authorId: userId } });
    if (!note) throw new NotFoundException('Lesson note not found');
    // Editable only while it's the teacher's to edit (draft or sent back).
    if (note.status === 'SUBMITTED' || note.status === 'APPROVED') {
      throw new BadRequestException('This note is locked while under review. Withdraw or wait for it to be returned.');
    }

    const data: Prisma.LessonNoteUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim() || null;
    if (dto.weekEnding !== undefined) data.weekEnding = this.dayUtc(dto.weekEnding);
    if (dto.content !== undefined) {
      const policy = await this.getPolicy(schoolId);
      data.content = prepareLessonNoteContent(dto.content, policy);
    }

    return this.prisma.lessonNote.update({ where: { id }, data, include: this.listInclude });
  }

  async submit(schoolId: string, userId: string, id: string) {
    const note = await this.prisma.lessonNote.findFirst({ where: { id, schoolId, authorId: userId } });
    if (!note) throw new NotFoundException('Lesson note not found');
    if (note.status === 'SUBMITTED') throw new BadRequestException('This note is already submitted.');
    if (note.status === 'APPROVED') throw new BadRequestException('This note has already been approved.');

    return this.prisma.lessonNote.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
      include: this.listInclude,
    });
  }

  // Withdraw a submitted-but-not-yet-reviewed note back to draft so it can be edited.
  async withdraw(schoolId: string, userId: string, id: string) {
    const note = await this.prisma.lessonNote.findFirst({ where: { id, schoolId, authorId: userId } });
    if (!note) throw new NotFoundException('Lesson note not found');
    if (note.status !== 'SUBMITTED') throw new BadRequestException('Only a submitted note can be withdrawn.');

    return this.prisma.lessonNote.update({
      where: { id },
      data: { status: 'DRAFT', submittedAt: null },
      include: this.listInclude,
    });
  }

  async remove(schoolId: string, userId: string, id: string) {
    const note = await this.prisma.lessonNote.findFirst({ where: { id, schoolId, authorId: userId } });
    if (!note) throw new NotFoundException('Lesson note not found');
    if (note.status === 'APPROVED') throw new BadRequestException('Approved notes cannot be deleted.');
    await this.prisma.lessonNote.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Review (reviewer authorization enforced at the controller) ────────────

  async listForReview(
    schoolId: string,
    filters: { status?: string; classId?: string; termId?: string; authorId?: string },
  ) {
    return this.prisma.lessonNote.findMany({
      where: {
        schoolId,
        // Default the queue to what needs action; allow viewing any status.
        status: (filters.status as LessonNoteStatus) ?? 'SUBMITTED',
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.authorId ? { authorId: filters.authorId } : {}),
      },
      orderBy: [{ submittedAt: 'asc' }, { weekEnding: 'desc' }],
      include: this.listInclude,
    });
  }

  async getForReview(schoolId: string, id: string) {
    const note = await this.prisma.lessonNote.findFirst({ where: { id, schoolId }, include: this.listInclude });
    if (!note) throw new NotFoundException('Lesson note not found');
    return note;
  }

  async reviewSummary(schoolId: string) {
    const pending = await this.prisma.lessonNote.count({ where: { schoolId, status: 'SUBMITTED' } });
    return { pending };
  }

  async review(schoolId: string, reviewerId: string, id: string, dto: ReviewLessonNoteDto) {
    const note = await this.prisma.lessonNote.findFirst({ where: { id, schoolId } });
    if (!note) throw new NotFoundException('Lesson note not found');
    if (note.status !== 'SUBMITTED') {
      throw new BadRequestException('Only a submitted note can be reviewed.');
    }
    if (note.authorId === reviewerId) {
      throw new ForbiddenException('You cannot review your own lesson note.');
    }

    const updated = await this.prisma.lessonNote.update({
      where: { id },
      data: {
        status: dto.decision,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComments: dto.comments?.trim() || null,
      },
      include: this.listInclude,
    });

    // Best-effort in-app notification to the author.
    try {
      await this.notifications.emitToUser(schoolId, note.authorId, {
        eventType: dto.decision === 'APPROVED' ? 'lesson_note.approved' : 'lesson_note.returned',
        title: dto.decision === 'APPROVED' ? 'Lesson note approved' : 'Lesson note returned',
        body: `Your lesson note (${updated.subject.name}, ${updated.class.name}) was ${dto.decision === 'APPROVED' ? 'approved' : 'returned for revision'}.`,
      });
    } catch {
      /* notifications are non-critical */
    }

    return updated;
  }

  // ── School-wide format policy ─────────────────────────────────────────────

  // The school's lesson-note authoring policy. Any author needs this to know
  // whether the rich-text option is available; defaults to STRUCTURED_ONLY.
  async getPolicy(schoolId: string): Promise<LessonNoteFormatPolicy> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { lessonNoteFormatPolicy: true },
    });
    return school?.lessonNoteFormatPolicy ?? LessonNoteFormatPolicy.STRUCTURED_ONLY;
  }

  async setPolicy(schoolId: string, policy: LessonNoteFormatPolicy) {
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { lessonNoteFormatPolicy: policy },
    });
    return { policy };
  }

  // Class / subject / term must all belong to the school.
  private async assertRefs(schoolId: string, classId: string, subjectId: string, termId: string) {
    const [cls, subj, term] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }),
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
    ]);
    if (!cls) throw new BadRequestException('Class not found');
    if (!subj) throw new BadRequestException('Subject not found');
    if (!term) throw new BadRequestException('Term not found');
  }
}
