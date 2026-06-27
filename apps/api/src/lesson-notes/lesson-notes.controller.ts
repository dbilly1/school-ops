import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LessonNoteFormatPolicy, StaffRole } from '@prisma/client';
import { LessonNotesService } from './lesson-notes.service';
import { CreateLessonNoteDto, UpdateLessonNoteDto, ReviewLessonNoteDto } from './dto/lesson-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

class SetLessonNotePolicyDto {
  @IsEnum(LessonNoteFormatPolicy)
  policy!: LessonNoteFormatPolicy;
}

// Two capability groups, both under the `academics` feature:
//   • lesson_notes        — a teacher authoring/submitting their OWN notes
//                           (granted to teachers by default; service scopes to
//                           the author).
//   • lesson_note_review  — reviewing anyone's submitted notes (granted to
//                           Owner/Admin/Headmaster by default; grantable to a
//                           senior teacher).
// Static `/review` and `/mine` segments are declared before the `:id` routes so
// they take precedence.
@ApiTags('Lesson Notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard, StaffRolesGuard)
@Controller('school/lesson-notes')
export class LessonNotesController {
  constructor(private lessonNotes: LessonNotesService) {}

  // ── Format policy (school-wide) ──
  // Read by any author so the editor knows whether rich text is offered;
  // written only by school leadership. Declared before the `:id` routes so the
  // static `policy` segment takes precedence over the PATCH `:id` handler.
  // Readable by any authenticated staff (non-sensitive school config) so the
  // editor and the leadership panel always see the true current value.
  @Get('policy')
  async getPolicy(@CurrentUser() user: any) {
    return { policy: await this.lessonNotes.getPolicy(user.schoolId) };
  }

  @Patch('policy')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  setPolicy(@CurrentUser() user: any, @Body() dto: SetLessonNotePolicyDto) {
    return this.lessonNotes.setPolicy(user.schoolId, dto.policy);
  }

  // ── Review queue (reviewers) ──
  @Get('review/summary')
  @RequirePermission('academics', 'VIEW', 'lesson_note_review')
  reviewSummary(@CurrentUser() user: any) {
    return this.lessonNotes.reviewSummary(user.schoolId);
  }

  @Get('review')
  @RequirePermission('academics', 'VIEW', 'lesson_note_review')
  listForReview(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('classId') classId?: string,
    @Query('termId') termId?: string,
    @Query('authorId') authorId?: string,
  ) {
    return this.lessonNotes.listForReview(user.schoolId, { status, classId, termId, authorId });
  }

  @Get('review/:id')
  @RequirePermission('academics', 'VIEW', 'lesson_note_review')
  getForReview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessonNotes.getForReview(user.schoolId, id);
  }

  @Post(':id/review')
  @RequirePermission('academics', 'EDIT', 'lesson_note_review')
  review(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReviewLessonNoteDto) {
    return this.lessonNotes.review(user.schoolId, user.id, id, dto);
  }

  // ── Authoring (teacher's own) ──
  @Get('mine')
  @RequirePermission('academics', 'VIEW', 'lesson_notes')
  listMine(@CurrentUser() user: any, @Query('termId') termId?: string, @Query('status') status?: string) {
    return this.lessonNotes.listMine(user.schoolId, user.id, termId, status);
  }

  @Get('mine/:id')
  @RequirePermission('academics', 'VIEW', 'lesson_notes')
  getMine(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessonNotes.getMine(user.schoolId, user.id, id);
  }

  @Post()
  @RequirePermission('academics', 'CREATE', 'lesson_notes')
  create(@CurrentUser() user: any, @Body() dto: CreateLessonNoteDto) {
    return this.lessonNotes.create(user.schoolId, user.id, user.roles, dto);
  }

  @Patch(':id')
  @RequirePermission('academics', 'EDIT', 'lesson_notes')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateLessonNoteDto) {
    return this.lessonNotes.update(user.schoolId, user.id, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('academics', 'EDIT', 'lesson_notes')
  submit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessonNotes.submit(user.schoolId, user.id, id);
  }

  @Post(':id/withdraw')
  @RequirePermission('academics', 'EDIT', 'lesson_notes')
  withdraw(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessonNotes.withdraw(user.schoolId, user.id, id);
  }

  @Delete(':id')
  @RequirePermission('academics', 'DELETE', 'lesson_notes')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessonNotes.remove(user.schoolId, user.id, id);
  }
}
