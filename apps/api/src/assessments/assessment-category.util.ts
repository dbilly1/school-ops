import { AssessmentCategory } from '@prisma/client';

// The end-of-term exam is the only "exam bucket" category. Everything else is
// continuous assessment and rolls up into the class score (SBA) bucket.
export function isExamCategory(category: AssessmentCategory): boolean {
  return category === AssessmentCategory.END_OF_TERM_EXAM;
}

export const SBA_CATEGORIES: AssessmentCategory[] = [
  AssessmentCategory.CLASS_EXERCISE,
  AssessmentCategory.CLASS_TEST,
  AssessmentCategory.GROUP_WORK,
  AssessmentCategory.PROJECT,
  AssessmentCategory.HOMEWORK,
  AssessmentCategory.MID_TERM,
];

export const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  CLASS_EXERCISE: 'Class Exercise',
  CLASS_TEST: 'Class Test',
  GROUP_WORK: 'Group Work',
  PROJECT: 'Project Work',
  HOMEWORK: 'Homework',
  MID_TERM: 'Mid-Term',
  END_OF_TERM_EXAM: 'End-of-Term Exam',
};
