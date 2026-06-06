// Read-only check: confirm the schoolId performance indexes exist.
//   node prisma/verify-perf-indexes.js
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

const expected = fs
  .readFileSync(path.resolve(__dirname, 'add-perf-indexes.sql'), 'utf8')
  .split('\n')
  .map((l) => (l.match(/"([^"]+_idx)"/) || [])[1])
  .filter(Boolean);

(async () => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])`,
    expected,
  );
  const found = new Set(rows.map((r) => r.indexname));
  let ok = 0;
  for (const name of expected) {
    const present = found.has(name);
    if (present) ok++;
    console.log(`  ${present ? '✓' : '✗ MISSING'} ${name}`);
  }
  await prisma.$disconnect();
  console.log(`\n${ok}/${expected.length} indexes present.`);
  if (ok !== expected.length) process.exit(1);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
