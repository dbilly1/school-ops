const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

const SCHOOL_NAME = 'Redeemer International School';

// ── Subjects by level ─────────────────────────────────────────────────────────
//
// Each entry has:
//   name        — subject name
//   code        — short code
//   levels      — which grade level names to assign to ('nursery', 'kg', 'primary', 'jhs', or 'all')

const SUBJECTS = [
  // Core — all levels
  { name: 'English Language',       code: 'ENG',  levels: ['nursery','kg','primary','jhs'] },
  { name: 'Mathematics',            code: 'MATH', levels: ['nursery','kg','primary','jhs'] },
  { name: 'Religious & Moral Education', code: 'RME', levels: ['kg','primary','jhs'] },
  { name: 'Physical Education',     code: 'PE',   levels: ['kg','primary','jhs'] },
  { name: 'Creative Arts',          code: 'CA',   levels: ['kg','primary','jhs'] },
  { name: 'Ghanaian Language',      code: 'GHL',  levels: ['kg','primary','jhs'] },

  // Primary core
  { name: 'Science',                code: 'SCI',  levels: ['primary'] },
  { name: 'Social Studies',         code: 'SOC',  levels: ['primary','jhs'] },
  { name: 'Computing / ICT',        code: 'ICT',  levels: ['primary','jhs'] },

  // Nursery / KG specific
  { name: 'Literacy & Communication', code: 'LIT', levels: ['nursery','kg'] },
  { name: 'Numeracy',               code: 'NUM',  levels: ['nursery','kg'] },
  { name: 'Our World & Our People', code: 'OWOP', levels: ['nursery','kg'] },

  // JHS specific
  { name: 'Integrated Science',     code: 'ISCI', levels: ['jhs'] },
  { name: 'French',                 code: 'FRE',  levels: ['jhs'] },
  { name: 'History',                code: 'HIST', levels: ['jhs'] },
  { name: 'Geography',              code: 'GEO',  levels: ['jhs'] },
  { name: 'Basic Design & Technology', code: 'BDT', levels: ['jhs'] },
  { name: 'Career Technology',      code: 'CT',   levels: ['jhs'] },
  { name: 'Agricultural Science',   code: 'AGRIC', levels: ['jhs'] },
];

// Map grade level names → category
function getCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('nursery'))          return 'nursery';
  if (n.includes('kg') || n.includes('kindergarten')) return 'kg';
  if (n.includes('jhs') || n.includes('junior'))      return 'jhs';
  if (n.includes('grade') || n.includes('class') || n.includes('primary')) return 'primary';
  return 'primary'; // default
}

async function main() {
  const school = await prisma.school.findFirst({ where: { name: SCHOOL_NAME } });
  if (!school) throw new Error(`School "${SCHOOL_NAME}" not found`);
  console.log(`\n✓ School: ${school.name}\n`);

  const gradeLevels = await prisma.gradeLevel.findMany({
    where: { schoolId: school.id },
    orderBy: { sequence: 'asc' },
  });
  if (gradeLevels.length === 0) throw new Error('No grade levels found');

  // Group grade levels by category
  const byCategory = {};
  for (const gl of gradeLevels) {
    const cat = getCategory(gl.name);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(gl);
  }

  console.log('Grade level mapping:');
  for (const [cat, gls] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${gls.map(g => g.name).join(', ')}`);
  }
  console.log('');

  let created = 0;
  let skipped = 0;

  for (const subjectDef of SUBJECTS) {
    // Check if subject already exists
    const existing = await prisma.subject.findFirst({
      where: { schoolId: school.id, name: subjectDef.name },
    });

    let subject = existing;
    if (!existing) {
      subject = await prisma.subject.create({
        data: {
          schoolId: school.id,
          name: subjectDef.name,
          code: subjectDef.code,
        },
      });
      created++;
      console.log(`  + ${subjectDef.name} (${subjectDef.code})`);
    } else {
      skipped++;
      console.log(`  ~ ${subjectDef.name} already exists`);
    }

    // Assign to grade levels based on levels array
    const targetGrades = subjectDef.levels.flatMap(level => byCategory[level] ?? []);
    const uniqueGrades  = [...new Map(targetGrades.map(g => [g.id, g])).values()];

    for (const gl of uniqueGrades) {
      await prisma.gradeLevelSubject.upsert({
        where: { gradeLevelId_subjectId: { gradeLevelId: gl.id, subjectId: subject.id } },
        update: {},
        create: { gradeLevelId: gl.id, subjectId: subject.id },
      });
    }
  }

  console.log(`\n✅ Done — ${created} subjects created, ${skipped} already existed`);
  console.log(`   Assigned across ${gradeLevels.length} grade levels`);
}

main()
  .catch(e => { console.error('\n❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
