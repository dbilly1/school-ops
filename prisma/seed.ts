import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  // Super Admin
  const existing = await prisma.superAdmin.findUnique({
    where: { email: 'admin@schoolops.dev' },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin@1234', 10);
    await prisma.superAdmin.create({
      data: {
        email: 'admin@schoolops.dev',
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
      },
    });
    console.log('✓ Super Admin created — admin@schoolops.dev / Admin@1234');
  } else {
    console.log('✓ Super Admin already exists');
  }

  // Sub-feature defaults
  const defaults = [
    { featureKey: 'admissions', subFeatureKey: 'application_stage', defaultEnabled: true },
    { featureKey: 'admissions', subFeatureKey: 'lead_tracking', defaultEnabled: false },
    { featureKey: 'admissions', subFeatureKey: 'inquiry_stage', defaultEnabled: false },
    { featureKey: 'admissions', subFeatureKey: 'interview_stage', defaultEnabled: false },
    { featureKey: 'admissions', subFeatureKey: 'acceptance_stage', defaultEnabled: false },
    { featureKey: 'academics', subFeatureKey: 'assessments', defaultEnabled: true },
    { featureKey: 'academics', subFeatureKey: 'exams', defaultEnabled: true },
    { featureKey: 'academics', subFeatureKey: 'grading', defaultEnabled: true },
    { featureKey: 'academics', subFeatureKey: 'report_cards', defaultEnabled: false },
    { featureKey: 'academics', subFeatureKey: 'transcripts', defaultEnabled: false },
    { featureKey: 'attendance', subFeatureKey: 'student_attendance', defaultEnabled: true },
    { featureKey: 'attendance', subFeatureKey: 'staff_attendance', defaultEnabled: false },
    { featureKey: 'attendance', subFeatureKey: 'attendance_analytics', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'fee_structures', defaultEnabled: true },
    { featureKey: 'finance', subFeatureKey: 'invoicing', defaultEnabled: true },
    { featureKey: 'finance', subFeatureKey: 'receipts', defaultEnabled: true },
    { featureKey: 'finance', subFeatureKey: 'outstanding_balance_tracking', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'discount_management', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'feeding_fees', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'transport_fees', defaultEnabled: false },
    { featureKey: 'student_portal', subFeatureKey: 'attendance_view', defaultEnabled: true },
    { featureKey: 'student_portal', subFeatureKey: 'notice_view', defaultEnabled: true },
    { featureKey: 'student_portal', subFeatureKey: 'report_card_view', defaultEnabled: false },
    { featureKey: 'student_portal', subFeatureKey: 'academic_progress_view', defaultEnabled: false },
    { featureKey: 'student_portal', subFeatureKey: 'transport_view', defaultEnabled: false },
    { featureKey: 'transport', subFeatureKey: 'vehicles', defaultEnabled: true },
    { featureKey: 'transport', subFeatureKey: 'routes', defaultEnabled: true },
    { featureKey: 'transport', subFeatureKey: 'drivers', defaultEnabled: true },
    { featureKey: 'transport', subFeatureKey: 'student_assignment', defaultEnabled: true },
    { featureKey: 'transport', subFeatureKey: 'pickup_points', defaultEnabled: false },
    { featureKey: 'transport', subFeatureKey: 'fee_collection', defaultEnabled: true },
    { featureKey: 'feeding_fees', subFeatureKey: 'fee_collection', defaultEnabled: true },
    { featureKey: 'communication', subFeatureKey: 'notices', defaultEnabled: true },
    { featureKey: 'communication', subFeatureKey: 'announcements', defaultEnabled: true },
    { featureKey: 'communication', subFeatureKey: 'internal_messaging', defaultEnabled: false },
  ];

  for (const d of defaults) {
    await prisma.subFeatureDefault.upsert({
      where: { featureKey_subFeatureKey: { featureKey: d.featureKey, subFeatureKey: d.subFeatureKey } },
      update: { defaultEnabled: d.defaultEnabled },
      create: d,
    });
  }
  console.log(`✓ ${defaults.length} sub-feature defaults seeded`);

  // Backfill: make the new 'fee_collection' sub-features package-available
  // wherever their parent feature is already part of a package. The permission
  // resolver checks package availability BEFORE the owner/admin bypass, so
  // without this a gated fee-collection route would deny everyone.
  const packages = await prisma.package.findMany({ include: { features: true } });
  let backfilled = 0;
  async function ensurePkgFeature(packageId: string, featureKey: string, subFeatureKey: string | null) {
    const exists = await prisma.packageFeature.findFirst({ where: { packageId, featureKey, subFeatureKey } });
    if (!exists) {
      await prisma.packageFeature.create({ data: { packageId, featureKey, subFeatureKey } });
      backfilled++;
    }
  }
  for (const pkg of packages) {
    const keys = new Set(pkg.features.map((f) => `${f.featureKey}:${f.subFeatureKey ?? ''}`));
    // Transport fee collection — where transport is in the package.
    if (keys.has('transport:')) {
      await ensurePkgFeature(pkg.id, 'transport', 'fee_collection');
    }
    // Feeding fee collection — where feeding is in the package (top-level
    // feeding_fees or the legacy finance:feeding_fees sub-feature). Ensure the
    // top-level feeding_fees parent exists too.
    if (keys.has('feeding_fees:') || keys.has('finance:feeding_fees')) {
      await ensurePkgFeature(pkg.id, 'feeding_fees', null);
      await ensurePkgFeature(pkg.id, 'feeding_fees', 'fee_collection');
    }
  }
  console.log(`✓ fee_collection package backfill: ${backfilled} row(s) added`);

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
