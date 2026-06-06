// One-off backfill: assign a unique slug to every school that has none.
// Run once after `prisma db push` adds School.slug:  node prisma/backfill-slugs.js
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');

// Load DATABASE_URL etc. from the monorepo-root .env (same place the API reads).
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const prisma = new PrismaClient();

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(name) {
  const base = slugify(name) || 'school';
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const existing = await prisma.school.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
}

(async () => {
  const schools = await prisma.school.findMany({ where: { slug: null }, select: { id: true, name: true } });
  console.log(`Backfilling ${schools.length} school(s) without a slug...`);
  for (const s of schools) {
    const slug = await uniqueSlug(s.name);
    await prisma.school.update({ where: { id: s.id }, data: { slug } });
    console.log(`  ${s.name} -> ${slug}`);
  }
  await prisma.$disconnect();
  console.log('Done.');
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
