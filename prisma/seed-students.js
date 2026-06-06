const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const bcrypt = require('../apps/api/node_modules/bcryptjs');

const prisma = new PrismaClient();

const SCHOOL_NAME = 'Redeemer International School';
const STUDENTS_PER_CLASS = 10;

// ── Realistic Ghanaian names ──────────────────────────────────────────────────

const MALE_FIRST = [
  'Kwame','Kofi','Yaw','Kwesi','Kojo','Kwabena','Fiifi','Nana','Ebo','Akwasi',
  'Emmanuel','Samuel','Daniel','Joshua','Michael','David','Benjamin','Joseph','Isaac','Aaron',
  'Bright','Prince','Caleb','Elijah','Nathan','Solomon','Victor','Felix','Patrick','Gerald',
  'Abena','Kweku','Kobina','Kwadwo','Nii','Tetteh','Ofori','Mawuli','Senyo','Dela',
  'Kafui','Edem','Selorm','Kekeli','Makafui','Yayra','Delali','Afi','Seyram','Nutifafa',
  'Opoku','Appiah','Frimpong','Adusei','Bonsu','Barimah','Asiedu','Twumasi','Oduro','Peprah',
  'Asante','Osei','Darko','Adjei','Boateng','Owusu','Antwi','Amoah','Amponsah','Agyemang',
];

const FEMALE_FIRST = [
  'Ama','Abena','Akua','Adwoa','Afia','Adjoa','Efua','Akosua','Maame','Akosua',
  'Grace','Patience','Mercy','Comfort','Gifty','Priscilla','Eunice','Naomi','Ruth','Esther',
  'Sandra','Vivian','Cynthia','Diana','Harriet','Felicia','Beatrice','Lydia','Agnes','Doris',
  'Enyonam','Mawuena','Senam','Elikplim','Dziedzom','Nuku','Afua','Esinam','Yayra','Nana',
  'Abla','Serwaa','Dede','Araba','Nana Ama','Esi','Abiba','Aseye','Elorm','Mawuli',
  'Korkor','Naki','Eyram','Maame Esi','Ohemaa','Enyoma','Gifty','Adwoa','Akua Ama','Fosua',
  'Asantewaa','Serwaa','Abenaa','Oforiwaa','Akuafo','Aboraa','Obaa','Aberewa','Afia','Adoma',
];

const LAST = [
  'Mensah','Asante','Boateng','Owusu','Agyemang','Darko','Osei','Amponsah','Antwi','Amoah',
  'Nkrumah','Acheampong','Adjei','Opoku','Appiah','Kwarteng','Frimpong','Sarkodie','Asamoah',
  'Bonsu','Baidoo','Attah','Quaye','Teye','Laryea','Nartey','Lamptey','Tetteh','Ofori',
  'Agyei','Asiedu','Asumadu','Twumasi','Yeboah','Barimah','Dankwa','Peprah','Adusei','Forson',
  'Oduro','Obeng','Kyei','Ntim','Poku','Bekoe','Asare','Donkor','Yankey','Quartey',
  'Lokko','Sarpong','Wiredu','Ansah','Ankrah','Tagoe','Kotey','Ankoma','Dzisi','Amegashie',
  'Fiagbenu','Agbemava','Kpodo','Dorgbefu','Agbetsi','Nyarko','Akorli','Devor','Gadzekpo','Ahiabor',
  'Adzraku','Afedo','Klutse','Akoto','Amissah','Inkoom','Adutwum','Safo','Dompreh','Kusi',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find school
  const school = await prisma.school.findFirst({ where: { name: SCHOOL_NAME } });
  if (!school) throw new Error(`School "${SCHOOL_NAME}" not found`);
  console.log(`\n✓ School: ${school.name} (${school.id})`);

  // 2. Find classes
  const classes = await prisma.class.findMany({
    where: { schoolId: school.id },
    orderBy: { name: 'asc' },
  });
  if (classes.length === 0) throw new Error('No classes found for this school');
  console.log(`✓ Classes found: ${classes.map(c => c.name).join(', ')}\n`);

  // 3. Find active academic year (for class assignments)
  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId: school.id, isActive: true },
  }) ?? await prisma.academicYear.findFirst({
    where: { schoolId: school.id },
    orderBy: { createdAt: 'desc' },
  });

  // 4. Get existing student count for ID generation
  let studentCount = await prisma.student.count({ where: { schoolId: school.id } });
  const year = new Date().getFullYear();

  // 5. Create students per class
  const TEMP_PASSWORD = 'Student@1234';
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const usedNames = new Set(); // global — no duplicates across any class

  for (const cls of classes) {
    let created = 0;

    console.log(`  → ${cls.name}`);

    for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
      const gender = Math.random() > 0.5 ? 'Male' : 'Female';
      const firstNames = gender === 'Male' ? MALE_FIRST : FEMALE_FIRST;

      // Avoid duplicate full names across all classes
      let firstName, lastName, fullName;
      let attempts = 0;
      do {
        firstName = pick(firstNames);
        lastName  = pick(LAST);
        fullName  = `${firstName} ${lastName}`;
        attempts++;
      } while (usedNames.has(fullName) && attempts < 50);
      usedNames.add(fullName);

      studentCount++;
      const studentId = `${year}${String(studentCount).padStart(4, '0')}`;
      const dob = new Date(
        2005 + Math.floor(Math.random() * 14),
        Math.floor(Math.random() * 12),
        Math.floor(Math.random() * 28) + 1,
      );

      const student = await prisma.student.create({
        data: {
          schoolId:  school.id,
          studentId,
          firstName,
          lastName,
          gender,
          dateOfBirth: dob,
          portalCredential: {
            create: { passwordHash, tempPassword: TEMP_PASSWORD, mustChange: true },
          },
        },
      });

      // Assign to class (with academic year if one exists)
      if (activeYear) {
        await prisma.studentClassAssignment.create({
          data: {
            studentId:     student.id,
            classId:       cls.id,
            academicYearId: activeYear.id,
            schoolId:      school.id,
          },
        });
      }

      created++;
    }

    console.log(`     ✓ ${created} students added`);
  }

  const total = classes.length * STUDENTS_PER_CLASS;
  console.log(`\n✅ Done — ${total} students created across ${classes.length} classes`);
  if (activeYear) {
    console.log(`   Academic year: ${activeYear.name}`);
  } else {
    console.log(`   ⚠  No academic year found — students created but not assigned to a year`);
  }
  console.log(`   Temp portal password for all seeded students: Student@1234`);
}

main()
  .catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
