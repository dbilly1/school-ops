const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

// ── Default permission matrix ─────────────────────────────────────────────────
// Format: [role, featureKey, subFeatureKey|null, action, allowed]

const DEFAULTS = [
  // ── TEACHER ──────────────────────────────────────────────────────────────────
  // Academics
  ['TEACHER', 'academics',  null,              'VIEW',   true ],
  ['TEACHER', 'academics',  null,              'CREATE', false],
  ['TEACHER', 'academics',  null,              'EDIT',   false],
  ['TEACHER', 'academics',  null,              'DELETE', false],
  ['TEACHER', 'academics',  'assessments',     'VIEW',   true ],
  ['TEACHER', 'academics',  'assessments',     'CREATE', true ],
  ['TEACHER', 'academics',  'assessments',     'EDIT',   true ],
  ['TEACHER', 'academics',  'assessments',     'DELETE', false],
  ['TEACHER', 'academics',  'exams',           'VIEW',   true ],
  ['TEACHER', 'academics',  'exams',           'CREATE', false],
  ['TEACHER', 'academics',  'exams',           'EDIT',   false],
  ['TEACHER', 'academics',  'exams',           'DELETE', false],
  ['TEACHER', 'academics',  'grading',         'VIEW',   true ],
  ['TEACHER', 'academics',  'grading',         'CREATE', true ],
  ['TEACHER', 'academics',  'grading',         'EDIT',   true ],
  ['TEACHER', 'academics',  'grading',         'DELETE', false],
  ['TEACHER', 'academics',  'report_cards',    'VIEW',   true ],
  ['TEACHER', 'academics',  'report_cards',    'CREATE', false],
  ['TEACHER', 'academics',  'report_cards',    'EDIT',   false],
  ['TEACHER', 'academics',  'report_cards',    'DELETE', false],
  ['TEACHER', 'academics',  'transcripts',     'VIEW',   true ],
  ['TEACHER', 'academics',  'transcripts',     'CREATE', false],
  ['TEACHER', 'academics',  'transcripts',     'EDIT',   false],
  ['TEACHER', 'academics',  'transcripts',     'DELETE', false],
  // Attendance
  ['TEACHER', 'attendance', null,                    'VIEW',   true ],
  ['TEACHER', 'attendance', null,                    'CREATE', true ],
  ['TEACHER', 'attendance', null,                    'EDIT',   true ],
  ['TEACHER', 'attendance', null,                    'DELETE', false],
  ['TEACHER', 'attendance', 'student_attendance',    'VIEW',   true ],
  ['TEACHER', 'attendance', 'student_attendance',    'CREATE', true ],
  ['TEACHER', 'attendance', 'student_attendance',    'EDIT',   true ],
  ['TEACHER', 'attendance', 'student_attendance',    'DELETE', false],
  ['TEACHER', 'attendance', 'staff_attendance',      'VIEW',   false],
  ['TEACHER', 'attendance', 'staff_attendance',      'CREATE', false],
  ['TEACHER', 'attendance', 'staff_attendance',      'EDIT',   false],
  ['TEACHER', 'attendance', 'staff_attendance',      'DELETE', false],
  ['TEACHER', 'attendance', 'attendance_analytics',  'VIEW',   true ],
  ['TEACHER', 'attendance', 'attendance_analytics',  'CREATE', false],
  ['TEACHER', 'attendance', 'attendance_analytics',  'EDIT',   false],
  ['TEACHER', 'attendance', 'attendance_analytics',  'DELETE', false],
  // Students
  ['TEACHER', 'students',   null, 'VIEW',   true ],
  ['TEACHER', 'students',   null, 'CREATE', false],
  ['TEACHER', 'students',   null, 'EDIT',   false],
  ['TEACHER', 'students',   null, 'DELETE', false],
  // Reports
  ['TEACHER', 'reports',    null, 'VIEW',   true ],
  ['TEACHER', 'reports',    null, 'CREATE', false],
  ['TEACHER', 'reports',    null, 'EDIT',   false],
  ['TEACHER', 'reports',    null, 'DELETE', false],
  // Communication
  ['TEACHER', 'communication', null,               'VIEW',   true ],
  ['TEACHER', 'communication', null,               'CREATE', false],
  ['TEACHER', 'communication', null,               'EDIT',   false],
  ['TEACHER', 'communication', null,               'DELETE', false],
  ['TEACHER', 'communication', 'notices',          'VIEW',   true ],
  ['TEACHER', 'communication', 'notices',          'CREATE', false],
  ['TEACHER', 'communication', 'notices',          'EDIT',   false],
  ['TEACHER', 'communication', 'notices',          'DELETE', false],
  ['TEACHER', 'communication', 'announcements',    'VIEW',   true ],
  ['TEACHER', 'communication', 'announcements',    'CREATE', false],
  ['TEACHER', 'communication', 'announcements',    'EDIT',   false],
  ['TEACHER', 'communication', 'announcements',    'DELETE', false],
  ['TEACHER', 'communication', 'internal_messaging','VIEW',  true ],
  ['TEACHER', 'communication', 'internal_messaging','CREATE',true ],
  ['TEACHER', 'communication', 'internal_messaging','EDIT',  false],
  ['TEACHER', 'communication', 'internal_messaging','DELETE',false],

  // ── ACCOUNTANT ───────────────────────────────────────────────────────────────
  // Finance
  ['ACCOUNTANT', 'finance', null,                          'VIEW',   true ],
  ['ACCOUNTANT', 'finance', null,                          'CREATE', true ],
  ['ACCOUNTANT', 'finance', null,                          'EDIT',   true ],
  ['ACCOUNTANT', 'finance', null,                          'DELETE', false],
  ['ACCOUNTANT', 'finance', 'fee_structures',              'VIEW',   true ],
  ['ACCOUNTANT', 'finance', 'fee_structures',              'CREATE', true ],
  ['ACCOUNTANT', 'finance', 'fee_structures',              'EDIT',   true ],
  ['ACCOUNTANT', 'finance', 'fee_structures',              'DELETE', false],
  ['ACCOUNTANT', 'finance', 'invoicing',                   'VIEW',   true ],
  ['ACCOUNTANT', 'finance', 'invoicing',                   'CREATE', true ],
  ['ACCOUNTANT', 'finance', 'invoicing',                   'EDIT',   true ],
  ['ACCOUNTANT', 'finance', 'invoicing',                   'DELETE', false],
  ['ACCOUNTANT', 'finance', 'receipts',                    'VIEW',   true ],
  ['ACCOUNTANT', 'finance', 'receipts',                    'CREATE', true ],
  ['ACCOUNTANT', 'finance', 'receipts',                    'EDIT',   false],
  ['ACCOUNTANT', 'finance', 'receipts',                    'DELETE', false],
  ['ACCOUNTANT', 'finance', 'outstanding_balance_tracking','VIEW',   true ],
  ['ACCOUNTANT', 'finance', 'outstanding_balance_tracking','CREATE', false],
  ['ACCOUNTANT', 'finance', 'outstanding_balance_tracking','EDIT',   false],
  ['ACCOUNTANT', 'finance', 'outstanding_balance_tracking','DELETE', false],
  ['ACCOUNTANT', 'finance', 'discount_management',         'VIEW',   true ],
  ['ACCOUNTANT', 'finance', 'discount_management',         'CREATE', true ],
  ['ACCOUNTANT', 'finance', 'discount_management',         'EDIT',   true ],
  ['ACCOUNTANT', 'finance', 'discount_management',         'DELETE', false],
  // Expense management — denied by default; School Owner grants per role/user.
  ['ACCOUNTANT', 'finance', 'expense_management',          'VIEW',   false],
  ['ACCOUNTANT', 'finance', 'expense_management',          'CREATE', false],
  ['ACCOUNTANT', 'finance', 'expense_management',          'EDIT',   false],
  ['ACCOUNTANT', 'finance', 'expense_management',          'DELETE', false],
  // Feeding fees
  ['ACCOUNTANT', 'feeding_fees', null, 'VIEW',   true ],
  ['ACCOUNTANT', 'feeding_fees', null, 'CREATE', true ],
  ['ACCOUNTANT', 'feeding_fees', null, 'EDIT',   true ],
  ['ACCOUNTANT', 'feeding_fees', null, 'DELETE', false],
  // Students (view only — needed for billing)
  ['ACCOUNTANT', 'students', null, 'VIEW',   true ],
  ['ACCOUNTANT', 'students', null, 'CREATE', false],
  ['ACCOUNTANT', 'students', null, 'EDIT',   false],
  ['ACCOUNTANT', 'students', null, 'DELETE', false],
  // Reports
  ['ACCOUNTANT', 'reports',  null, 'VIEW',   true ],
  ['ACCOUNTANT', 'reports',  null, 'CREATE', false],
  ['ACCOUNTANT', 'reports',  null, 'EDIT',   false],
  ['ACCOUNTANT', 'reports',  null, 'DELETE', false],
  // Communication (read-only)
  ['ACCOUNTANT', 'communication', null,            'VIEW',   true ],
  ['ACCOUNTANT', 'communication', null,            'CREATE', false],
  ['ACCOUNTANT', 'communication', null,            'EDIT',   false],
  ['ACCOUNTANT', 'communication', null,            'DELETE', false],
  ['ACCOUNTANT', 'communication', 'notices',       'VIEW',   true ],
  ['ACCOUNTANT', 'communication', 'announcements', 'VIEW',   true ],

  // ── TRANSPORT_OFFICER ────────────────────────────────────────────────────────
  // Transport (full access except delete)
  ['TRANSPORT_OFFICER', 'transport', null,               'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'transport', null,               'CREATE', true ],
  ['TRANSPORT_OFFICER', 'transport', null,               'EDIT',   true ],
  ['TRANSPORT_OFFICER', 'transport', null,               'DELETE', false],
  ['TRANSPORT_OFFICER', 'transport', 'vehicles',         'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'vehicles',         'CREATE', true ],
  ['TRANSPORT_OFFICER', 'transport', 'vehicles',         'EDIT',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'vehicles',         'DELETE', false],
  ['TRANSPORT_OFFICER', 'transport', 'routes',           'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'routes',           'CREATE', true ],
  ['TRANSPORT_OFFICER', 'transport', 'routes',           'EDIT',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'routes',           'DELETE', false],
  ['TRANSPORT_OFFICER', 'transport', 'drivers',          'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'drivers',          'CREATE', true ],
  ['TRANSPORT_OFFICER', 'transport', 'drivers',          'EDIT',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'drivers',          'DELETE', false],
  ['TRANSPORT_OFFICER', 'transport', 'student_assignment','VIEW',  true ],
  ['TRANSPORT_OFFICER', 'transport', 'student_assignment','CREATE',true ],
  ['TRANSPORT_OFFICER', 'transport', 'student_assignment','EDIT',  true ],
  ['TRANSPORT_OFFICER', 'transport', 'student_assignment','DELETE',false],
  ['TRANSPORT_OFFICER', 'transport', 'pickup_points',    'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'pickup_points',    'CREATE', true ],
  ['TRANSPORT_OFFICER', 'transport', 'pickup_points',    'EDIT',   true ],
  ['TRANSPORT_OFFICER', 'transport', 'pickup_points',    'DELETE', false],
  // Students (view only — needed for assignments)
  ['TRANSPORT_OFFICER', 'students', null, 'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'students', null, 'CREATE', false],
  ['TRANSPORT_OFFICER', 'students', null, 'EDIT',   false],
  ['TRANSPORT_OFFICER', 'students', null, 'DELETE', false],
  // Communication (read-only)
  ['TRANSPORT_OFFICER', 'communication', null,            'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'communication', null,            'CREATE', false],
  ['TRANSPORT_OFFICER', 'communication', null,            'EDIT',   false],
  ['TRANSPORT_OFFICER', 'communication', null,            'DELETE', false],
  ['TRANSPORT_OFFICER', 'communication', 'notices',       'VIEW',   true ],
  ['TRANSPORT_OFFICER', 'communication', 'announcements', 'VIEW',   true ],
];

async function main() {
  const data = DEFAULTS.map(([role, featureKey, subFeatureKey, action, allowed]) => ({
    role,
    featureKey,
    subFeatureKey: subFeatureKey ?? null,
    action,
    allowed,
  }));

  const result = await prisma.rolePermissionDefault.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(`\n✅ Done — ${result.count} permission defaults inserted (${DEFAULTS.length - result.count} already existed)`);
  console.log(`   Roles covered: TEACHER, ACCOUNTANT, TRANSPORT_OFFICER`);
}

main()
  .catch(e => { console.error('\n❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
