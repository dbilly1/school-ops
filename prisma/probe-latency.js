// Read-only: measure round-trip latency to the DB.  node prisma/probe-latency.js
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

async function probe(label, url) {
  if (!url) { console.log(`${label}: (not set)`); return; }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // warm up the connection (TCP + TLS + auth handshake)
    const t0 = Date.now();
    await prisma.$queryRawUnsafe('SELECT 1');
    const connectMs = Date.now() - t0;

    // then measure steady-state per-query RTT
    const times = [];
    for (let i = 0; i < 5; i++) {
      const s = Date.now();
      await prisma.$queryRawUnsafe('SELECT 1');
      times.push(Date.now() - s);
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    console.log(`${label}: first(connect+query)=${connectMs}ms  steady-state avg=${avg}ms  [${times.join(', ')}]`);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  await probe('DIRECT_URL  (5432, session)', process.env.DIRECT_URL);
  await probe('DATABASE_URL(6543, pooler) ', process.env.DATABASE_URL);
})().catch(e => { console.error(e); process.exit(1); });
