// Read-only: report which perf indexes from add-perf-indexes.sql exist on the DB.
//   node prisma/check-perf-indexes.js
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

// Expected index names parsed from add-perf-indexes.sql
const sql = fs.readFileSync(path.resolve(__dirname, 'add-perf-indexes.sql'), 'utf8');
const expected = [...sql.matchAll(/IF NOT EXISTS "([^"]+)"/g)].map(m => m[1]);

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

(async () => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const present = new Set(rows.map(r => r.indexname));
  const missing = expected.filter(n => !present.has(n));

  console.log(`Expected perf indexes: ${expected.length}`);
  console.log(`Present:               ${expected.length - missing.length}`);
  console.log(`Missing:               ${missing.length}`);
  if (missing.length) {
    console.log('\nMISSING indexes (these tables are doing seq scans on schoolId):');
    for (const n of missing) console.log('  - ' + n);
  } else {
    console.log('\nAll perf indexes are present.');
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
