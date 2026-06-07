// One-off: apply the schoolId performance indexes from add-perf-indexes.sql.
//   node prisma/apply-perf-indexes.js
//
// Uses DIRECT_URL (port 5432, session mode) because CREATE INDEX CONCURRENTLY
// cannot run over the pgbouncer transaction pooler. Idempotent (IF NOT EXISTS),
// so it is safe to re-run.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');

// Load env vars from the monorepo-root .env (same place the API reads).
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

const url = process.env.DIRECT_URL;
if (!url) { console.error('DIRECT_URL not found in environment/.env'); process.exit(1); }

// Force the direct (session-mode) connection so CONCURRENTLY is allowed.
const prisma = new PrismaClient({ datasources: { db: { url } } });

// Parse statements from the .sql file: drop comment lines, split on ';'.
const sql = fs.readFileSync(path.resolve(__dirname, 'add-perf-indexes.sql'), 'utf8');
const statements = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

(async () => {
  console.log(`Applying ${statements.length} index statement(s) via DIRECT_URL...`);
  let created = 0;
  for (const stmt of statements) {
    const name = (stmt.match(/"([^"]+_idx)"/) || [])[1] || stmt.slice(0, 60);
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log(`  ✓ ${name}`);
      created++;
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
      throw e;
    }
  }
  await prisma.$disconnect();
  console.log(`Done. ${created}/${statements.length} applied (IF NOT EXISTS — existing ones are no-ops).`);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
