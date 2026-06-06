const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const school = await prisma.school.findFirst({ where: { name: 'Redeemer International School' } });
  if (!school) throw new Error('School not found');

  const students = await prisma.student.findMany({ where: { schoolId: school.id }, select: { id: true } });
  const ids = students.map(s => s.id);
  console.log(`Found ${ids.length} students to delete...`);

  await prisma.studentClassAssignment.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.studentPortalCredential.deleteMany({ where: { studentId: { in: ids } } });
  const { count } = await prisma.student.deleteMany({ where: { schoolId: school.id } });

  console.log(`✓ Deleted ${count} students`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
