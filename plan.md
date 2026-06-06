## Project Name

SchoolOps SaaS

## Vision

A multi-tenant School Operations Platform that allows schools to register, subscribe to packages, manage staff, students, academics, admissions, finance, transport, communication, and parent engagement from a centralized platform.

---

# Technical Stack

Frontend:

- Next.js 15
- TypeScript
- Tailwind CSS
- ShadCN UI

Backend:

- NestJS
- TypeScript

Database:

- PostgreSQL (Supabase)

ORM:

- Prisma

Authentication:

- JWT
- Refresh Tokens

Storage:

- Supabase Storage

Deployment:

- Vercel (Frontend)
- Railway / Render (Backend)

---

# Multi-Tenancy Strategy

Use Shared Database + Tenant Isolation.

Every business table must contain:

tenant_id

Examples:

schools
users
students
staff
classes
subjects
attendance
assessments
fees
payments
transport_routes

No cross-tenant access is allowed.

---

# User Roles

Platform Roles:

- Super Admin

School Staff Roles (Staff Portal):

- School Owner
- School Admin
- Teacher
- Accountant
- Transport Officer

Student Portal Roles:

- Student
- Parent

School staff and students/parents use separate portals with separate authentication flows. A person who is both a staff member and a parent maintains two separate accounts — one staff account, one portal account.

---

# Multi-Role Users

Staff users can hold multiple roles simultaneously.

Examples:

- A Teacher who is also a Transport Officer (collects transport fees)
- A Class Teacher who is also a Subject Teacher for other classes

When a user holds multiple roles, permissions are resolved as a **union** across all their roles before overrides are applied. If any role grants an action, the user has that action — unless a user-level override explicitly denies it.

The permission resolution algorithm runs once per user session using the union of all role defaults and role overrides applicable to that user.

---

# Data Scoping (Assignment-Based Access)

Permissions control what features and actions a user can perform. Assignments control which records within those features they can see.

This is enforced at the query level, not the permission level.

Rules:

- A Class Teacher sees data only for their assigned class(es).
- A Subject Teacher sees data only for the classes they teach for their assigned subject(s).
- A Teacher assigned as both sees their class fully and other classes only for their subject.
- An Accountant sees all finance records school-wide.
- A Transport Officer sees all transport records school-wide.
- School Owner and School Admin see all records school-wide.

Assignment tables (teacher_class_assignments, teacher_subject_assignments) are the source of truth for scoping. Queries for Teachers must always join against these tables.

---

# Permission System

## Overview

Four layers resolve every permission check. Each layer can expand or restrict the layer above it. The most specific layer wins.

```
Package Features → Role Defaults → Role Overrides → User Overrides
```

Resolution is always scoped to a tenant. No permission state crosses tenant boundaries.

---

## Layer 1 — Package Features

Defines the ceiling of what is possible within a school.

- A feature not in the school's package cannot be accessed regardless of role or override.
- If a school's package changes, access adjusts immediately. Data is never deleted on downgrade.
- Package features are managed by Super Admin only.

---

## Layer 2 — Role Defaults

Defines what each school role can access within the features the package permits.

Staff roles: School Owner, School Admin, Teacher, Accountant, Transport Officer
Portal roles: Student, Parent

School Owner and School Admin have full access to all features within their active package by default. No manual role defaults needed for these two roles.

Each other role has a defined default permission set per feature per action. These defaults ship with the platform and apply unless overridden.

---

## Layer 3 — Role-Level Overrides

School Owner can expand or restrict what an entire role can access within their school.

- Applies to all users holding that role unless a user-level override exists.
- Cannot grant access to features outside the school's package.
- Stored per tenant per role.
- School Owner cannot modify their own role or School Admin role through this layer — both always retain full access.

---

## Layer 4 — User-Level Overrides

School Owner can grant or restrict access for a specific user, independent of their role.

- Most specific layer — always wins over role defaults and role overrides.
- Cannot grant access to features outside the school's package.
- Intended for edge cases: a Teacher collecting transport fees, a senior Teacher with broader academic access.

---

## What "Access" Means

Every permission entry is defined across two dimensions:

Scope: which feature or sub-feature

Actions:

- view — see the screen or data
- create — add new records
- edit — modify existing records
- delete — remove or archive records

A user must have both feature access (from feature flags) and action-level permission to perform any operation.

---

## Who Can Manage Each Layer

| Layer | Managed By |
|---|---|
| Package Features | Super Admin |
| Role Defaults | Platform (built-in, seeded at setup) |
| Role-Level Overrides | School Owner + School Admin (by default) |
| User-Level Overrides | School Owner + School Admin (by default) |

School Admin can manage role-level and user-level permission overrides by default. This reflects real-world practice where the School Owner is often a proprietor or board-level person who delegates day-to-day administration to the School Admin.

The School Owner can revoke this access via a school-level toggle: "Allow School Admin to manage permissions." When revoked, only the School Owner can modify permission overrides. This toggle is itself Owner-only and is not part of the normal permission override system.

Hard limits that apply regardless of the toggle:
- Only the School Owner can appoint or remove School Admins.
- School Admin cannot modify the School Owner's access in any way.
- School Admin cannot control the permission management toggle.
- Neither School Owner nor School Admin permissions are themselves configurable through the override system — both always retain full operational access.

---

## Permission Resolution Algorithm

For multi-role users, collect the union of all role defaults and role overrides across every role the user holds before evaluating.

```
function canUserPerformAction(user, feature, subFeature, action):

  // Step 1: Check package
  schoolPackage = getSchoolPackage(user.tenantId)
  if feature not in schoolPackage.features:
    return DENY

  if subFeature is not null:
    if subFeature not in schoolPackage.features[feature].subFeatures:
      return DENY

  // Step 2: Check school's active feature state
  schoolFeature = getSchoolFeatureState(user.tenantId, feature)
  if schoolFeature.state != ACTIVE:
    return DENY

  if subFeature is not null:
    schoolSubFeature = getSchoolSubFeatureState(user.tenantId, feature, subFeature)
    if schoolSubFeature.enabled == false:
      return DENY

  // Step 3: School Owner and School Admin bypass remaining checks
  if user has role SCHOOL_OWNER or SCHOOL_ADMIN:
    return ALLOW

  // Step 4: Check user-level override (most specific, checked first)
  userOverride = getUserPermissionOverride(user.id, feature, subFeature, action)
  if userOverride exists:
    return userOverride.granted ? ALLOW : DENY

  // Step 5: Check role-level overrides across all user roles (union)
  for each role in user.roles:
    roleOverride = getRolePermissionOverride(user.tenantId, role, feature, subFeature, action)
    if roleOverride exists and roleOverride.granted:
      return ALLOW

  // Step 6: Check role defaults across all user roles (union)
  for each role in user.roles:
    roleDefault = getRoleDefault(role, feature, subFeature, action)
    if roleDefault.allowed:
      return ALLOW

  return DENY
```

---

# Feature Flag and Sub-Feature System

## Feature States

Every feature within a school exists in one of three states:

UNAVAILABLE — not included in the school's current package. Cannot be enabled. Screens are hidden.

AVAILABLE — included in the package but not yet activated by the school. School Owner can activate it. Screens are hidden until activated.

ACTIVE — included in the package and activated by the school. Users with appropriate permissions can access it.

---

## Sub-Features

Within any ACTIVE feature, sub-features control specific workflows or views. Each sub-feature is independently togglable by the school.

- Sub-features cannot be activated if the parent feature is not ACTIVE.
- Sub-features cannot be activated if the package does not include them.
- Toggling a sub-feature off does not delete data. It hides access and excludes the sub-feature from UI and reporting.

---

## Sub-Feature Definitions by Module

### Admissions

- lead_tracking
- inquiry_stage
- application_stage
- interview_stage
- acceptance_stage

Example: A school using a simple flow enables only `application_stage`. Pipeline becomes Application → Enrolled. As processes evolve, additional stages can be toggled on without schema changes.

---

### Finance

- fee_structures
- invoicing
- receipts
- outstanding_balance_tracking
- discount_management
- feeding_fees
- transport_fees

---

### Attendance

- student_attendance
- staff_attendance
- attendance_analytics

---

### Academics

- assessments
- exams
- grading
- report_cards
- transcripts

---

### Student Portal

- attendance_view
- report_card_view
- academic_progress_view
- notice_view
- transport_view

---

### Transport

- vehicles
- routes
- drivers
- student_assignment
- pickup_points

---

### Communication

- notices
- announcements
- internal_messaging

---

## Sub-Feature Defaults on Activation

When a school activates a feature, sub-features are not all off by default. Each sub-feature has a platform-defined default (on or off) applied when the parent feature is first activated.

Examples of defaults:

- application_stage → on
- student_attendance → on
- fee_structures → on
- invoicing → on
- lead_tracking → off
- interview_stage → off
- discount_management → off
- transcripts → off

Schools can change these during the onboarding wizard or at any time in settings.

---

## Onboarding Wizard

During school setup, the wizard walks through each active feature area and presents its sub-features with their defaults pre-selected. The school can toggle them, or skip the step entirely. Skipping applies platform defaults. Schools can revisit all feature configuration from their settings at any time.

---

## Who Can Manage Feature States

| Action | Managed By |
|---|---|
| Add features to a package | Super Admin |
| Grant a-la-carte features to a specific school | Super Admin |
| Set feature state AVAILABLE → ACTIVE | School Owner |
| Toggle sub-features on/off | School Owner |

---

# Package System

## Overview

Packages are fully database-driven. No package configuration is hardcoded. Super Admin creates and manages packages via the platform admin interface.

A package defines:

- Which top-level features are included
- Which sub-features within each feature are available to the school

---

## Package Upgrades

When a school upgrades:

- New features become AVAILABLE immediately.
- New sub-features within existing ACTIVE features become available to toggle.
- No existing data changes.
- School Owner activates new features at their own pace.

---

## Package Downgrades

When a school downgrades:

- Features no longer in the new package move to UNAVAILABLE.
- All associated data is preserved in the database.
- UI access is blocked immediately.
- Re-upgrading restores access to all preserved data.

---

## A-La-Carte Feature Grants

Super Admin can grant individual features or sub-features to a specific school outside of their package.

Grants have two modes:

- Permanent — the feature remains available indefinitely regardless of package changes.
- Temporary — the feature is available until a set expiry date, after which it reverts to package-determined state.

Use cases: referral incentives, trial of premium features to encourage upgrade, one-off accommodations.

Temporary grants are tracked with an expiry date. The system automatically moves the feature to UNAVAILABLE when a temporary grant expires. Data is preserved.

---

## Trial State

Schools on trial receive a package assigned by Super Admin at registration. When trial expires, the school moves to Suspended and all feature access is blocked until a package is confirmed.

---

# Data Model — Permissions and Feature Flags

## packages

- id (UUID, PK)
- name
- description
- is_active (whether new schools can be assigned this package)
- created_at, updated_at

---

## package_features

Defines which features and sub-features a package includes. One row per feature or sub-feature per package.

- id (UUID, PK)
- package_id (FK → packages)
- feature_key (e.g. "admissions", "finance")
- sub_feature_key (string or null — null means the row covers the top-level feature)
- created_at

---

## school_features

Tracks the activation state of each feature for a school.

- id (UUID, PK)
- school_id (FK → schools)
- feature_key
- state (enum: UNAVAILABLE, AVAILABLE, ACTIVE)
- activated_at (nullable)
- updated_at

---

## school_sub_feature_configs

Tracks which sub-features a school has enabled within active features.

- id (UUID, PK)
- school_id (FK → schools)
- feature_key
- sub_feature_key
- enabled (boolean)
- updated_at

A row only exists if the sub-feature is available in the school's package. If no row exists, the platform default for that sub-feature applies (defined in sub_feature_defaults).

---

## sub_feature_defaults

Platform-defined defaults for sub-feature enabled state when a feature is first activated.

- id (UUID, PK)
- feature_key
- sub_feature_key
- default_enabled (boolean)

---

## school_feature_grants

Tracks a-la-carte feature grants made by Super Admin to specific schools outside their package.

- id (UUID, PK)
- school_id (FK → schools)
- feature_key
- sub_feature_key (nullable — null means the entire feature is granted)
- is_permanent (boolean)
- expires_at (timestamp, nullable — only set when is_permanent is false)
- granted_by (FK → users, Super Admin)
- created_at

When checking feature availability, grants are evaluated alongside package membership. A feature is available if it is in the school's package OR if a non-expired grant exists.

---

## role_permission_defaults

Platform-seeded defaults for what each role can do per feature and action.

- id (UUID, PK)
- role (enum of school roles)
- feature_key
- sub_feature_key (nullable)
- action (enum: view, create, edit, delete)
- allowed (boolean)

---

## role_permission_overrides

School Owner overrides for an entire role within their school.

- id (UUID, PK)
- school_id (FK → schools)
- role (enum of school roles)
- feature_key
- sub_feature_key (nullable)
- action (enum: view, create, edit, delete)
- granted (boolean)
- updated_by (FK → users)
- updated_at

Unique constraint on (school_id, role, feature_key, sub_feature_key, action).

---

## user_permission_overrides

School Owner overrides for a specific user. Takes precedence over role-level overrides.

- id (UUID, PK)
- school_id (FK → schools)
- user_id (FK → users)
- feature_key
- sub_feature_key (nullable)
- action (enum: view, create, edit, delete)
- granted (boolean)
- updated_by (FK → users)
- updated_at

Unique constraint on (school_id, user_id, feature_key, sub_feature_key, action).

---

# Phase 1 Modules

## Tenant Management

### Self-Registration

Schools register themselves directly on the platform. No Super Admin action is required to create an account.

Registration flow:

1. School Owner visits the platform's public signup page
2. Fills in school name, country, contact person name, and email address
3. Verifies email address
4. Selects a package (or starts on a default trial)
5. Is redirected into the onboarding wizard to configure their school

On successful registration:
- A school record is created with subscription state: Trial
- The selected package (or default trial package) is assigned automatically
- All features from the package are set to AVAILABLE
- Super Admin receives a notification of the new registration

> **Development/Testing (Temporary):** During development, all newly registered schools are automatically assigned an all-features package so every module can be tested end to end. This will be replaced with proper package selection before launch.

Super Admin does not approve the initial signup. They manage upgrades, downgrades, a-la-carte grants, and suspension.

### Features

- Public-facing signup page (school name, country, contact person, email)
- Email verification
- Auto-assignment of trial or selected package on signup
- School Setup Wizard (walks through feature activation, sub-feature toggles, grading config, timetable config, report card layout, fee categories, feeding fee config, custom profile fields)
- School Branding
- Package Selection and Upgrade Requests
- Subscription Status

---

## Academic Year and Term Management

Schools operate on configurable academic years. Each year contains a configurable number of terms (default: 3 for Ghana).

Features:

- Create and name academic years (e.g. "2024/2025")
- Define term start and end dates per year
- Mark the active academic year
- Configure whether overlapping active years are allowed (default: off)

When a new academic year is created, the system auto-scaffolds the configured number of terms with blank date ranges. The school fills in the dates before the year begins.

Promotion of students happens at the end of the academic year, after the final term.

All time-bound records (attendance, assessments, fees, class assignments) are linked to an academic year and term. Queries default to the active year and term unless a historical view is requested.

Data model additions:

academic_years:
- id (UUID, PK)
- school_id (FK → schools)
- name
- start_date, end_date
- is_active (boolean)
- allow_overlap (boolean, default false)
- created_at

terms:
- id (UUID, PK)
- academic_year_id (FK → academic_years)
- school_id (FK → schools)
- name (e.g. "Term 1")
- start_date, end_date
- is_active (boolean)
- sequence (integer — ordering within the year)
- created_at

---

## User Management

Features:

- Invite Staff Users
- Assign One or More Roles Per User
- Activate/Deactivate Users
- Password Reset
- Role-Level Permission Overrides (School Owner + School Admin by default; Owner can restrict to Owner-only)
- User-Level Permission Overrides (School Owner + School Admin by default; Owner can restrict to Owner-only)
- School Admin Appointment (School Owner only)
- Permission Management Toggle — allow/disallow School Admin from managing permission overrides (School Owner only)

Notes:

- A user can hold multiple staff roles simultaneously.
- Permissions resolve as a union across all assigned roles.
- School Owner and School Admin always have full operational access — their permissions are not configurable through the override system.
- School Admin manages permission overrides by default. The School Owner can revoke this via the permission management toggle.
- School Admin can never appoint other admins, remove admins, modify the Owner's access, or control the permission management toggle.

---

## Admissions CRM

Pipeline stages (each independently togglable via sub-features):

Lead → Inquiry → Application → Interview → Accepted → Enrolled

At minimum, Application must be enabled. All other stages are optional.

Features:

- Lead Tracking
- Follow-up History
- Conversion Reporting
- Configurable Admission Form Fields

On Enrollment:

A student profile is created automatically when a record reaches Enrolled status. Data collected during admissions is carried over into the student profile. Schools configure which fields appear on the admission form and which fields carry over to the student profile during their setup wizard. Additional student profile fields can be added at any time.

---

## Student Management

Features:

- Student Profiles
- Medical Records
- Parent/Guardian Relationships
- Academic History
- Class Assignment

Student Profile Fields:

A standard set of fields is provided out of the box covering what most schools need (name, date of birth, gender, photo, contact details, emergency contacts, medical notes, class, enrollment date). Schools can extend profiles with custom fields. Custom field data is stored as JSONB alongside standard columns.

Schools configure during onboarding which standard fields are required, optional, or hidden on both the admission form and the student profile. Custom fields can be added at any time.

Student Portal Access:

When a student profile is created, portal credentials are generated automatically:

- Login: student ID
- Password: system-generated, must be changed on first login

Parents linked to the student use the same portal with the same credentials unless the school or parent changes them. The portal is separate from the staff system entirely.

---

## Class and Grade Structure

A grade level (e.g. Grade 1, JHS 2, SHS 3) is the unit of academic progression. A class is a section within a grade level (e.g. Grade 1A, Grade 1B, Grade 1C).

Schools configure their own grade levels — nothing is hardcoded. A school using the Ghanaian basic education structure defines their own level names in sequence.

Features:

- Create and name grade levels in progression order
- Create one or more class sections per grade level
- Assign class teachers to classes
- Assign subject teachers to classes per subject

Data model additions:

grade_levels:
- id (UUID, PK)
- school_id (FK → schools)
- name (e.g. "Grade 1", "JHS 1")
- sequence (integer — defines promotion order)
- created_at

classes:
- id (UUID, PK)
- school_id (FK → schools)
- grade_level_id (FK → grade_levels)
- name (e.g. "Grade 1A")
- academic_year_id (FK → academic_years)
- created_at

---

## Student Progression

At the end of each academic year, School Admin or School Owner initiates promotion.

Process:

1. System presents all students in each class grouped by their current class.
2. Default action is to promote all students to the corresponding class in the next grade level.
3. Admin reviews and can individually mark students as: Promoted (default), Repeated (stays in same grade level), or Skipped (advanced two levels — rare).
4. Admin confirms. The system creates new class assignments for the new academic year.
5. Previous class assignments are retained permanently as historical records.

A student's full progression history (every class, every year) is always accessible from their profile.

Performance Tracking:

A longitudinal performance view is available per student showing grades, attendance rate, and academic standing across every term they have been enrolled. This view spans multiple academic years and is designed to surface early patterns of decline so the school can intervene proactively.

---

## Academic Management

Features:

- Subjects (configurable per school, assigned to grade levels)
- Class Assignments (teacher_class_assignments, teacher_subject_assignments)
- Timetables
- Assessments
- Exams
- Grading
- Report Cards
- Academic Transcripts

Teacher Scenarios:

1. Class Teacher
2. Subject Teacher
3. Both

Must support all scenarios.

---

## Timetable Management

Each class has its own timetable. Schools configure timetables per class per term.

Configuration:

- School defines the number of periods per day
- School defines the duration of each period (e.g. 40 minutes)
- School defines break periods and their positions in the day (e.g. Break after period 3)
- School defines which days the timetable covers

Timetable entry:

- Admin selects a class, then assigns a subject and teacher to each period slot (day × period)
- A slot can be marked as a break or free period
- Only teachers assigned to teach that subject at that grade level appear as options for a slot

Clash detection:

- The system flags if a teacher is assigned to two different classes in the same period
- The system flags if a class has the same subject assigned in back-to-back slots beyond a configured threshold (optional)
- Clashes are shown as warnings at entry time and summarised in a clash report

Output:

- Timetable view per class (for staff portal)
- Timetable view per student (for student portal — shows their class timetable)
- Timetable view per teacher (shows all slots across all classes they teach)

Data model additions:

timetable_configs:
- id (UUID, PK)
- school_id (FK → schools)
- academic_year_id (FK → academic_years)
- term_id (FK → terms)
- periods_per_day (integer)
- period_duration_minutes (integer)
- school_days (array of day names)
- created_at

timetable_breaks:
- id (UUID, PK)
- timetable_config_id (FK → timetable_configs)
- after_period (integer — break occurs after this period number)
- duration_minutes (integer)

timetable_slots:
- id (UUID, PK)
- school_id (FK → schools)
- class_id (FK → classes)
- timetable_config_id (FK → timetable_configs)
- day (enum: monday–friday or configured days)
- period_number (integer)
- subject_id (FK → subjects, nullable)
- teacher_id (FK → users, nullable)
- slot_type (enum: lesson, break, free)

---

## Grading System

Schools configure which grading scale they use. All scale types are available.

Supported scale types:

- Percentage (0–100, pass mark configurable)
- Letter grades (A, B, C, D, F — boundaries configurable)
- GPA (scale configurable, e.g. 4.0 or 5.0)
- Custom (school defines grade labels and score ranges)

A school selects one scale type during setup and configures its parameters. The scale can be updated but changing it after assessments have been recorded triggers a confirmation warning.

Grades stored in the database are always the raw score. The display grade (letter, GPA value, custom label) is derived at query time from the school's configured scale.

Data model additions:

grading_scales:
- id (UUID, PK)
- school_id (FK → schools)
- scale_type (enum: percentage, letter, gpa, custom)
- pass_mark (decimal, nullable — for percentage type)
- gpa_max (decimal, nullable — for GPA type)
- is_active (boolean)
- created_at

grading_scale_bands:
- id (UUID, PK)
- grading_scale_id (FK → grading_scales)
- label (e.g. "A", "Excellent", "4.0")
- min_score (decimal)
- max_score (decimal)
- gpa_value (decimal, nullable)
- remark (e.g. "Distinction", "Pass", "Fail", nullable)

---

## Report Card Configuration

Schools configure the layout and content of their report cards. All options are available.

Configurable elements:

- School branding (logo, colours, header text)
- Sections to include: academic grades, attendance summary, behaviour/conduct scores, teacher comments, principal/head teacher comments, next term information
- Grading display format (show raw score, letter grade, both)
- Custom sections (free text blocks the school can label and position)
- Signature lines (configurable labels)
- Footer text

Report cards are generated as PDFs per student per term. Once generated they are stored and accessible from the student's profile and the student portal.

Data model additions:

report_card_configs:
- id (UUID, PK)
- school_id (FK → schools)
- show_raw_score (boolean)
- show_grade_label (boolean)
- show_attendance_summary (boolean)
- show_behaviour_scores (boolean)
- show_teacher_comments (boolean)
- show_principal_comments (boolean)
- show_next_term_info (boolean)
- footer_text (text, nullable)
- updated_at

report_card_custom_sections:
- id (UUID, PK)
- report_card_config_id (FK → report_card_configs)
- label (text)
- position (integer — display order)
- created_at

---

## Attendance

Features:

- Student Attendance
- Staff Attendance
- Attendance Analytics

---

## Student Portal

Shared by students and parents. Separate from the staff portal — different URL, different authentication flow.

Authentication:

- Login identifier: student ID
- Password: generated on profile creation, changeable at any time
- Parents linked to a student use the same credentials

A parent with multiple children at the same school has one account per child. Cross-child access from a single login is not supported in V1.

Features:

- Attendance View
- Report Cards
- Academic Progress
- Notices
- Transport Information

---

## School Calendar

The school calendar is a foundational system-wide concept. It defines which days are school days and which are not. Every daily-dependent operation — attendance, feeding fees, transport fees — checks the calendar before expecting any action or flagging any absence.

Features:

- Define the standard school week (e.g. Monday to Friday)
- Mark holidays (single days)
- Mark vacation periods (date ranges)
- Mark exam periods (optional label, still school days)
- View calendar by month or term

Non-school days suppress all daily operations. No attendance is expected, no feeding or transport payments are due, and no flags are generated.

The calendar is configured per academic year. Schools can copy the previous year's calendar as a starting point.

---

## Public Holiday Detection

When a new academic year or term is created, the system automatically fetches public holidays for the school's country from a public holidays API (e.g. Nager.Date). It raises a notification to the School Admin listing all public holidays that fall within the term:

> "X public holidays fall within this term. Review and confirm which will be observed."

The admin reviews each holiday and marks it as:

- Observed — automatically added to the school calendar as a holiday
- Not observed — dismissed, school is in session that day

Confirmed holidays behave identically to manually created calendar entries.

Tentative holidays:

Public holidays with variable dates (e.g. Eid al-Fitr, Eid al-Adha) are flagged as tentative. The system adds a reminder notification closer to the estimated date prompting the admin to verify and confirm the actual date.

The school's country is set on the school profile during registration and used for all holiday lookups.

Data model additions:

school_calendar_events:
- id (UUID, PK)
- school_id (FK → schools)
- academic_year_id (FK → academic_years)
- event_type (enum: holiday, vacation, exam_period, event)
- name (e.g. "Independence Day", "Mid-term Break")
- start_date
- end_date
- source (enum: manual, public_holiday_api, tentative_public_holiday)
- external_holiday_key (string, nullable — API identifier for deduplication)
- confirmed_by (FK → users, nullable)
- confirmed_at (timestamp, nullable)
- created_at

A day is a school day if it falls within an active term's date range AND no calendar event of type holiday or vacation covers that date.

---

## Staff Profiles

When a staff member is added to the system, a profile is created as part of the same flow.

Profile fields:

- Personal details (name, date of birth, gender, photo, contact details)
- Employment details (staff ID, designation, date joined, employment type)
- Qualifications (configurable — school can define what they track)
- Subjects qualified to teach (for Teacher role — used to filter teacher options during timetable and subject assignment)
- Emergency contact

Assignments are made during profile creation and can be edited at any time:

- Class assignments (for Class Teachers)
- Subject assignments per class (for Subject Teachers)

Custom fields follow the same pattern as student profiles — standard fields plus JSONB for school-specific additions.

---

## Finance

Features:

- Fee Structures
- Student Categories
- Invoices
- Manual Payment Recording
- Receipts
- Outstanding Balances

Fee Structure Configuration:

Schools define their own student categories (e.g. Day, Boarding, International, New Entrant, Returning). Nothing is hardcoded.

Fee structures are set per grade level per student category per term. A school can set different amounts for different combinations.

Examples:
- Grade 1 / Day student / Term 1 = GHS 500
- Grade 1 / Boarding student / Term 1 = GHS 1,200
- JHS 1 / Day student / Term 1 = GHS 800

When a student is assigned to a class and a category, the system looks up the applicable fee structure and generates their invoice for the term.

No payment gateway integration in V1.

---

## Feeding Fees

Daily feeding fee collection, tracking, and reconciliation. Operates independently from termly fee structures.

Configuration:

Schools configure one of two modes:
- Flat rate — same daily amount for all students
- Per class — daily amount varies by grade level (e.g. lower classes pay less than upper classes)

This is set during onboarding and can be changed at any time. Changing the rate takes effect from the next school day.

Daily collection workflow:

Each school day, the designated collector opens the feeding collection screen. It shows all students enrolled in feeding for their assigned class(es). For each student the screen shows:

- Attendance status (absent students are greyed out — no payment due)
- Payment status: Paid today / Pre-covered / Unpaid
- Current pre-payment balance (remaining days covered)

The collector marks students as paid as money is received. Pre-covered students are already settled — no action needed.

At the end of the day the collector submits the daily reconciliation. The system generates a summary: number of students who paid, total cash collected, number of pre-covered students (cash already received on a prior day), number of unpaid/flagged students.

Pre-payment:

When a parent pays ahead, the collector records the payment on the day the cash is received. The amount is reflected in that day's reconciliation. The system calculates how many days the payment covers and pre-marks those future school days as covered for that student.

On pre-covered days the student shows as settled. Their amount does not appear in the day's cash collection since the money was already accounted for when it was received.

Flagging:

A student is flagged for non-payment only if:
- It is a school day (per the school calendar)
- The student was marked present
- No payment was made and no pre-payment credit covers the day

Flags are visible to the collector, the Accountant, and the School Admin/Owner. Parents can see their child's feeding payment status and balance on the student portal.

Who can collect:

Configurable per school. Options: class teacher collects for their own class, or a designated staff member collects for all classes. Access to the feeding collection screen is permission-controlled.

Data model additions:

feeding_configs:
- id (UUID, PK)
- school_id (FK → schools)
- rate_mode (enum: flat, per_class)
- flat_rate (decimal, nullable — used when rate_mode is flat)
- effective_from (date)
- created_at

feeding_class_rates:
- id (UUID, PK)
- school_id (FK → schools)
- feeding_config_id (FK → feeding_configs)
- grade_level_id (FK → grade_levels)
- daily_rate (decimal)

feeding_enrollments:
- id (UUID, PK)
- school_id (FK → schools)
- student_id (FK → students)
- academic_year_id (FK → academic_years)
- is_active (boolean)
- created_at

feeding_payments:
- id (UUID, PK)
- school_id (FK → schools)
- student_id (FK → students)
- amount_paid (decimal)
- payment_date (date — the date cash was physically received)
- days_covered (integer — how many school days this payment covers)
- recorded_by (FK → users)
- created_at

feeding_daily_records:
- id (UUID, PK)
- school_id (FK → schools)
- student_id (FK → students)
- record_date (date)
- status (enum: paid, pre_covered, absent, unpaid)
- feeding_payment_id (FK → feeding_payments, nullable — links pre-covered days to the payment that covers them)
- created_at

Unique constraint on (school_id, student_id, record_date).

---

## Transport Fees

Transport fees follow the same daily collection and reconciliation model as feeding fees. The daily rate per student is determined by their assigned transport route, which is already configured in the Transport module.

No separate rate configuration is needed — rate lives on the route record.

Collection, pre-payment, flagging, and reconciliation work identically to feeding fees. The collection screen filters to students assigned to a transport route.

A student absent from school is not flagged for transport non-payment.

Data model additions:

transport_daily_records:
- id (UUID, PK)
- school_id (FK → schools)
- student_id (FK → students)
- record_date (date)
- status (enum: paid, pre_covered, absent, unpaid)
- transport_payment_id (FK → transport_payments, nullable)
- created_at

transport_payments:
- id (UUID, PK)
- school_id (FK → schools)
- student_id (FK → students)
- amount_paid (decimal)
- payment_date (date)
- days_covered (integer)
- recorded_by (FK → users)
- created_at

Unique constraint on (school_id, student_id, record_date).

---

## Transport

Features:

- Vehicles
- Routes
- Drivers
- Student Assignment
- Pickup Points

Parent Access:

- Assigned Vehicle
- Driver Information
- Pickup Details

---

## Communication Center

Features:

- Notices
- Internal Messaging
- Announcements

External integrations later.

---

# Subscription Management

No actual payments in V1.

States:

- Trial
- Active
- Suspended
- Expired

Schools can:

- Select Package
- Request Upgrade
- Request Downgrade

Super Admin approves manually.

---

# Reporting

School Reports:

- Enrollment
- Attendance
- Academic Performance
- Fee Balances
- Transport

Platform Reports:

- Total Schools
- Active Schools
- Package Distribution
- Student Count
- User Count

---

# Notifications

V1: In-platform notifications only. A notification abstraction layer is built from the start so email and SMS providers can be added later without restructuring.

A notifications table stores all system-generated events. The frontend polls or subscribes for unread notifications per user. No external delivery in V1.

Notification event types (V1):

- Report card published
- New notice or announcement
- Attendance marked (for student portal)

Notification event types (future):

- Fee due reminder
- Outstanding balance alert
- Timetable change
- Any event above delivered via email and/or SMS

Data model:

notifications:
- id (UUID, PK)
- school_id (FK → schools)
- recipient_id (FK → users — staff or portal user)
- event_type (string)
- title
- body
- is_read (boolean)
- created_at

notification_event_log:
- id (UUID, PK)
- school_id (FK → schools)
- event_type (string)
- payload (JSONB — event data for delivery rendering)
- created_at

When email/SMS is added, the notification_event_log is the source consumed by the delivery workers.

---

# Security

- JWT Authentication
- RBAC with assignment-based data scoping
- Tenant Isolation
- Audit Logs
- Password Policies

## Audit Logs

All write operations across the system are logged. Reads are not logged.

Logged events include:

- Record creates, updates, deletes (all modules)
- Permission changes (role overrides, user overrides) — logged with before and after values
- Role assignments and removals
- Feature and sub-feature toggles
- Student progression actions
- Login and logout events
- Academic year and term activations
- A-la-carte feature grants by Super Admin

Audit logs are viewable by School Owner and School Admin within their tenant. Super Admin can view logs across all tenants.

Logs are append-only. They cannot be edited or deleted through the application.

Data model:

audit_logs:
- id (UUID, PK)
- school_id (FK → schools, nullable — null for platform-level events)
- actor_id (FK → users — who performed the action)
- action (string — e.g. "student.create", "permission.override.update")
- entity_type (string — e.g. "student", "role_permission_override")
- entity_id (UUID — the affected record)
- before_value (JSONB, nullable — previous state for updates)
- after_value (JSONB, nullable — new state for updates)
- ip_address (string, nullable)
- created_at

---

# Success Criteria

A school should be able to:

1. Register.
2. Select a package.
3. Add staff.
4. Create classes.
5. Assign teachers.
6. Admit students.
7. Record attendance.
8. Manage academics.
9. Generate report cards.
10. Provide parent access.
11. Manage transport.
12. Run without payment integration.

---

# Frontend Color System

## Neutral Base (fixed — never themed)

The canvas is intentionally brand-neutral so any school's accent color sits on top cleanly.

- App background: `#F8FAFC` (slate-50)
- Card surface: `#FFFFFF`
- Borders: `#E2E8F0` (slate-200)
- Muted text: `#64748B` (slate-500)
- Body text: `#1E293B` (slate-800)
- Sidebar background: `#0F172A` (slate-900)
- Sidebar text: `#F1F5F9` (slate-100)

## Accent (themeable at runtime)

A single accent variable drives buttons, active nav states, highlights, and links.

Default accent — Emerald. Used on:
- Marketing / public-facing pages
- Login and registration screens
- Super Admin portal
- Any school workspace where no brand color has been set

Shades:
- Primary: `#065F46` (emerald-800)
- Hover / active: `#047857` (emerald-700)
- Light tint (backgrounds): `#D1FAE5` (emerald-100)
- Dark (text on tinted bg): `#022C22` (emerald-950)

Per-school override — once a school sets `primaryColor` in their branding settings, the workspace re-themes to that color at runtime via a CSS custom property (`--accent`) set at the workspace root. A school with a blue brand looks blue; a maroon school looks maroon. Emerald is the fallback for any school that has not configured branding.

## Status Colors (fixed — never themed)

Status colors carry fixed semantic meaning. They never change between schools so that danger always means danger.

- Danger / overdue: `#EF4444` (red-500)
- Warning / pending: `#F59E0B` (amber-500)
- Info: `#3B82F6` (blue-500)
- Success: `#22C55E` (green-500)
