import { Prisma } from '@prisma/client';

// Words that shouldn't contribute a letter to a school's initials.
const PREFIX_STOPWORDS = new Set(['of', 'the', 'and', 'for', 'at', 'in', 'a', 'an', '&']);

// Width of the zero-padded numeric portion, e.g. 4 → "MIS0042".
export const STUDENT_SEQ_PAD = 4;

/**
 * Derive a default student-ID prefix from a school name.
 *   "Methodist International School" → "MIS"
 *   "St. Mary's Academy"            → "SMA"
 *   "Achimota"                      → "ACH"  (single word → leading letters)
 *
 * Capped at 4 characters. This is only a default — the stored
 * School.studentIdPrefix is the source of truth and can be edited.
 */
export function deriveSchoolPrefix(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !PREFIX_STOPWORDS.has(w.toLowerCase()));

  const initials = words
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase();

  if (initials.length >= 2) return initials.slice(0, 4);

  // One-word (or punctuation-only) names don't yield useful initials —
  // fall back to the leading letters of the name itself.
  const letters = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'STU';
}

/**
 * Atomically allocate the next human-readable student ID for a school,
 * e.g. "MIS0042". MUST run inside a transaction (`tx`).
 *
 * The number comes from an atomic increment of School.studentSeq, so it is
 * monotonic and unaffected by deletions — unlike the old row-count basis,
 * which could collide (and wedge creation) after a student was removed.
 *
 * If the school has no prefix yet, one is derived from its name and persisted,
 * so the value is stable thereafter even if the school is later renamed.
 */
export async function nextStudentId(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<string> {
  const school = await tx.school.update({
    where: { id: schoolId },
    data: { studentSeq: { increment: 1 } },
    select: { studentSeq: true, studentIdPrefix: true, name: true },
  });

  let prefix = school.studentIdPrefix;
  if (!prefix) {
    prefix = deriveSchoolPrefix(school.name);
    await tx.school.update({ where: { id: schoolId }, data: { studentIdPrefix: prefix } });
  }

  return `${prefix}${String(school.studentSeq).padStart(STUDENT_SEQ_PAD, '0')}`;
}
