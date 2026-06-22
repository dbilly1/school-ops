import { IsString, IsOptional, IsDateString, IsObject, IsIn } from 'class-validator';

// The structured GES lesson-note template. Stored as JSON (text-in-DB). The
// frontend enforces the field layout; the API treats it as an opaque object so
// the template can evolve without a migration.
export type LessonNoteContent = {
  strand?: string;
  subStrand?: string;
  contentStandard?: string;
  indicators?: string;
  objectives?: string;
  resources?: string; // teaching-learning resources / core competencies
  references?: string;
  lessons?: Array<{
    day?: string;
    starter?: string; // phase 1 — introduction / starter
    main?: string;     // phase 2 — new learning + assessment
    plenary?: string;  // phase 3 — plenary / reflection
  }>;
};

export class CreateLessonNoteDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  termId!: string;

  @IsDateString()
  weekEnding!: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsObject()
  content!: LessonNoteContent;
}

export class UpdateLessonNoteDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsDateString()
  @IsOptional()
  weekEnding?: string;

  @IsObject()
  @IsOptional()
  content?: LessonNoteContent;
}

export class ReviewLessonNoteDto {
  // A reviewer either approves the note or returns it for revision.
  @IsIn(['APPROVED', 'RETURNED'])
  decision!: 'APPROVED' | 'RETURNED';

  @IsString()
  @IsOptional()
  comments?: string;
}
