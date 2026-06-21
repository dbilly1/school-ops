// One-off, idempotent migration to bring the live `role_permission_defaults`
// table in line with the updated matrix in seed-permissions.js. The seed uses
// createMany({ skipDuplicates }), so it never UPDATES existing rows — run this
// once against the live DB after deploying the schema/seed changes.
//
//   node prisma/migrate-permissions-2026-06-21.js
//
// Changes:
//   1. Remove TEACHER `reports` defaults  (teachers no longer get aggregate reports)
//   2. Grant ACCOUNTANT `finance/expense_management` VIEW/CREATE/EDIT by default
//      (DELETE stays Owner/Admin-only)

const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1 — drop teacher reports defaults
  const removed = await prisma.rolePermissionDefault.deleteMany({
    where: { role: 'TEACHER', featureKey: 'reports' },
  });

  // 2 — accountant expense_management defaults
  const grants = [
    { action: 'VIEW', allowed: true },
    { action: 'CREATE', allowed: true },
    { action: 'EDIT', allowed: true },
    { action: 'DELETE', allowed: false },
  ];
  for (const g of grants) {
    await prisma.rolePermissionDefault.upsert({
      where: {
        role_featureKey_subFeatureKey_action: {
          role: 'ACCOUNTANT',
          featureKey: 'finance',
          subFeatureKey: 'expense_management',
          action: g.action,
        },
      },
      update: { allowed: g.allowed },
      create: {
        role: 'ACCOUNTANT',
        featureKey: 'finance',
        subFeatureKey: 'expense_management',
        action: g.action,
        allowed: g.allowed,
      },
    });
  }

  console.log(`\n✅ Done — removed ${removed.count} TEACHER/reports defaults; upserted ${grants.length} ACCOUNTANT/expense_management defaults`);
}

main()
  .catch((e) => { console.error('\n❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
