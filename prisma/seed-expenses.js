// One-off: register the finance:expense_management sub-feature default and make
// it package-available wherever finance is in a package. Mirrors the additions
// in seed.ts but runnable with plain node (no ts-node/bcrypt needed).
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1) Sub-feature default — enabled, so the tab shows once finance is active.
  await prisma.subFeatureDefault.upsert({
    where: { featureKey_subFeatureKey: { featureKey: 'finance', subFeatureKey: 'expense_management' } },
    update: { defaultEnabled: true },
    create: { featureKey: 'finance', subFeatureKey: 'expense_management', defaultEnabled: true },
  });
  console.log('✓ sub-feature default finance:expense_management = true');

  // 2) Package backfill — the resolver checks package availability BEFORE the
  // owner/admin bypass, so without this even owners are denied.
  const packages = await prisma.package.findMany({ include: { features: true } });
  let added = 0;
  for (const pkg of packages) {
    const hasFinance = pkg.features.some((f) => f.featureKey === 'finance');
    if (!hasFinance) continue;
    const exists = await prisma.packageFeature.findFirst({
      where: { packageId: pkg.id, featureKey: 'finance', subFeatureKey: 'expense_management' },
    });
    if (!exists) {
      await prisma.packageFeature.create({
        data: { packageId: pkg.id, featureKey: 'finance', subFeatureKey: 'expense_management' },
      });
      added++;
    }
  }
  console.log(`✓ package backfill: ${added} package(s) gained finance:expense_management`);
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
