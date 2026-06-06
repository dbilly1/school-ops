import { PrismaService } from '../prisma/prisma.service';

/** Turn a school name into a URL/subdomain-safe slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-') // non-alnum -> hyphen
    .replace(/-{2,}/g, '-') // collapse runs
    .replace(/^-+|-+$/g, ''); // trim hyphens
}

/**
 * Return a unique slug for `name`, appending `-2`, `-3`, ... until free.
 * `excludeId` lets a school keep its own slug when re-checking on update.
 * Falls back to a `school` base if the name has no slug-able characters.
 */
export async function uniqueSlug(
  prisma: PrismaService,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || 'school';
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const existing = await prisma.school.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
  }
}
