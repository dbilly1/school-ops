/**
 * One-off backfill: switch every school onto the new student-ID scheme.
 *
 * For each school it:
 *   1. Derives + persists a studentIdPrefix from the school name (e.g. "MIS"),
 *      unless one is already set.
 *   2. Renumbers existing students in admission order (oldest first) to
 *      `PREFIX0001`, `PREFIX0002`, … — done in two phases so the per-school
 *      unique index never trips on a transient duplicate.
 *   3. Sets School.studentSeq to the student count, so the next new student
 *      continues the sequence instead of restarting.
 *
 * Safe to re-run (idempotent). Run with:  npx ts-node prisma/migrate-student-ids.ts
 *
 * NOTE: studentId is the student's portal login username. This renumbering
 * changes those logins, so only run it pre-launch (or notify students after).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEQ_PAD = 4;
const PREFIX_STOPWORDS = new Set(['of', 'the', 'and', 'for', 'at', 'in', 'a', 'an', '&']);

// Keep in sync with apps/api/src/common/student-id.ts → deriveSchoolPrefix.
function deriveSchoolPrefix(name: string): string {
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

  const letters = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'STU';
}

async function main() {
  const schools = await prisma.school.findMany({
    select: { id: true, name: true, studentIdPrefix: true },
  });

  console.log(`Migrating student IDs for ${schools.length} school(s)…\n`);

  for (const school of schools) {
    const prefix = school.studentIdPrefix?.trim() || deriveSchoolPrefix(school.name);

    const students = await prisma.student.findMany({
      where: { schoolId: school.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, studentId: true },
    });

    // Phase 1: park every student on a guaranteed-unique temp value (the cuid),
    // so phase 2's reassignments can't collide with a not-yet-updated row.
    // Phase 2: assign the final PREFIX#### in admission order.
    await prisma.$transaction([
      ...students.map((s) =>
        prisma.student.update({ where: { id: s.id }, data: { studentId: `tmp_${s.id}` } }),
      ),
      ...students.map((s, i) =>
        prisma.student.update({
          where: { id: s.id },
          data: { studentId: `${prefix}${String(i + 1).padStart(SEQ_PAD, '0')}` },
        }),
      ),
      prisma.school.update({
        where: { id: school.id },
        data: { studentIdPrefix: prefix, studentSeq: students.length },
      }),
    ]);

    console.log(
      `✓ ${school.name}: prefix "${prefix}", renumbered ${students.length} student(s), seq → ${students.length}`,
    );
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
