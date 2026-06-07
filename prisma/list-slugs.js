// Read-only: list every school with its slug.  node prisma/list-slugs.js
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');

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

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

(async () => {
  const schools = await prisma.school.findMany({
    select: { name: true, slug: true, _count: { select: { users: true, students: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!schools.length) { console.log('No schools found.'); }
  for (const s of schools) {
    console.log(`  slug="${s.slug ?? '(none)'}"  | ${s.name}  | users:${s._count.users} students:${s._count.students}`);
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
