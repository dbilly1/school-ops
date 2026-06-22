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
    { featureKey: 'academics', subFeatureKey: 'lesson_notes', defaultEnabled: true },
    { featureKey: 'academics', subFeatureKey: 'lesson_note_review', defaultEnabled: true },
    { featureKey: 'attendance', subFeatureKey: 'student_attendance', defaultEnabled: true },
    { featureKey: 'attendance', subFeatureKey: 'staff_attendance', defaultEnabled: false },
    { featureKey: 'attendance', subFeatureKey: 'attendance_analytics', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'fee_structures', defaultEnabled: true },
    { featureKey: 'finance', subFeatureKey: 'invoicing', defaultEnabled: true },
    { featureKey: 'finance', subFeatureKey: 'receipts', defaultEnabled: true },
    { featureKey: 'finance', subFeatureKey: 'outstanding_balance_tracking', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'discount_management', defaultEnabled: false },
    { featureKey: 'finance', subFeatureKey: 'expense_management', defaultEnabled: true },
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
    // Expense management — where finance is in the package. The resolver checks
    // package availability BEFORE the owner/admin bypass, so without this the
    // expense routes would deny everyone (same reasoning as fee_collection).
    if (keys.has('finance:')) {
      await ensurePkgFeature(pkg.id, 'finance', 'expense_management');
    }
    // Transport fee collection — where transport is in the package.
    if (keys.has('transport:')) {
      await ensurePkgFeature(pkg.id, 'transport', 'fee_collection');
    }
    // Lesson notes + review — where academics is in the package. (Resolver
    // checks package availability before the owner/admin bypass, so without
    // this the lesson-note routes would deny everyone.)
    if (keys.has('academics:')) {
      await ensurePkgFeature(pkg.id, 'academics', 'lesson_notes');
      await ensurePkgFeature(pkg.id, 'academics', 'lesson_note_review');
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

  // GES curriculum subject catalog (platform-level; super admin can edit later).
  // Schools apply these to grade levels by matching levelType during setup.
  const curriculum: { levelType: 'KG' | 'LOWER_PRIMARY' | 'UPPER_PRIMARY' | 'JHS'; names: string[] }[] = [
    { levelType: 'KG', names: ['Numeracy', 'Language & Literacy', 'Our World Our People', 'Creative Arts'] },
    { levelType: 'LOWER_PRIMARY', names: ['English Language', 'Mathematics', 'Science', 'History', 'Our World Our People', 'Religious & Moral Education', 'Creative Arts', 'Physical Education', 'Ghanaian Language', 'Computing', 'French'] },
    { levelType: 'UPPER_PRIMARY', names: ['English Language', 'Mathematics', 'Science', 'History', 'Our World Our People', 'Religious & Moral Education', 'Creative Arts', 'Physical Education', 'Ghanaian Language', 'Computing', 'French'] },
    { levelType: 'JHS', names: ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies', 'Religious & Moral Education', 'Physical & Health Education', 'Career Technology', 'Computing', 'Creative Arts and Design', 'Ghanaian Language', 'French'] },
  ];
  let curriculumSeeded = 0;
  for (const group of curriculum) {
    for (let i = 0; i < group.names.length; i++) {
      await prisma.curriculumSubject.upsert({
        where: { levelType_name: { levelType: group.levelType, name: group.names[i] } },
        update: {}, // don't clobber super-admin edits to sequence/code
        create: { levelType: group.levelType, name: group.names[i], sequence: i },
      });
      curriculumSeeded++;
    }
  }
  console.log(`✓ ${curriculumSeeded} curriculum subjects ensured`);

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
