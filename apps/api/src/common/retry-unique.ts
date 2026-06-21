import { Prisma } from '@prisma/client';

/**
 * Retries `fn` when it fails with a Prisma unique-constraint violation (P2002).
 *
 * Used for sequence-style human IDs (e.g. staffId `STF-####`) derived from a
 * row count. Under concurrent inserts two requests can read the same count and
 * generate the same ID; the unique index makes the loser throw P2002.
 * Recomputing the sequence inside a fresh attempt resolves the race.
 * (Student IDs now use an atomic School.studentSeq counter — see student-id.ts —
 * so they no longer rely on this for correctness, only as a cheap safety net.)
 *
 * `fn` MUST recompute the colliding value on each call (i.e. do the count and
 * the insert inside `fn`), otherwise the retry just repeats the same conflict.
 */
export async function retryOnUniqueViolation<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isUniqueViolation && attempt < attempts) continue;
      throw err;
    }
  }
}
