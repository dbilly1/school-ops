# SchoolOps — Build Roadmap

Each phase represents a shippable milestone. Within every phase, the build order is always: Prisma schema → migrations → NestJS module → Next.js UI.

Status markers: `[ ]` Pending · `[~]` In Progress · `[x]` Done

---

## Current Status (2026-06-04)

**Backend API: Phases 0–8 complete.** All NestJS modules build, type-check, and boot cleanly against Supabase. ~31 modules, full route surface mapped. Verified by clean `node dist/main.js` startup.

**Not yet started:** Frontend (Next.js UI) for all phases — the `apps/web` app is scaffolded but no SchoolOps screens are built. Frontend is the remaining major body of work.

**Known follow-ups before launch:**
- Replace temporary "all-features package on signup" with real package selection
- Wire email delivery for invites, password resets, and student portal credentials (currently returned in API responses for dev)
- Switch `prisma db push` to proper migrations for production (PgBouncer advisory-lock workaround in use)
- Optional: persist generated report card PDFs to Supabase Storage (currently generated on-demand and streamed)

**Done:**
- ✅ Report card PDF rendering — pdfkit, respects report card config flags, streamed via `GET /school/report-cards/student/:studentId/pdf` and `GET /portal/report-cards/:termId/pdf`
- ✅ Transport daily fee collection — `/school/transport-fees/*` (per-route daily collection, mark-paid, pre-payment with rate from route, reconciliation)

---

## Phase 0 — Foundation

Core infrastructure. Nothing visible to end users yet. Everything else depends on this phase being solid.

- [ ] Project scaffolding (NestJS monorepo + Next.js app)
- [ ] PostgreSQL + Prisma setup
- [ ] Base Prisma schema (schools, users, initial tables)
- [ ] Multi-tenancy middleware (tenant_id injection, query scoping)
- [ ] Staff authentication (JWT access token + refresh token)
- [ ] Student portal authentication (student ID + password, separate auth flow)
- [ ] RBAC guard (multi-role aware, union resolution)
- [ ] Feature flag resolution engine (package → grant → school state check)
- [ ] Permission resolution engine (full 5-step algorithm)
- [ ] Audit log infrastructure (interceptor that captures all write operations)
- [ ] Notification event infrastructure (event emitter + notifications table, in-platform only)
- [ ] Global error handling and validation pipes
- [ ] Tenant-scoped base repository pattern

---

## Phase 1 — Platform Administration

Super Admin can manage packages and schools. Platform is operational at the top level.

### Package Management
- [ ] Schema: packages, package_features, sub_feature_defaults
- [ ] API: CRUD packages, assign features and sub-features to packages
- [ ] UI: Super Admin — package builder

### Public Signup and Self-Registration
- [ ] UI: public-facing signup page (school name, country, contact person, email)
- [ ] API: school self-registration, email verification, auto-assign trial/selected package
- [ ] API: trigger Super Admin notification on new school signup

> **Temporary (testing):** Auto-assign all-features package on signup. Replace with real package selection before launch.

### School Management (Super Admin)
- [ ] Schema: schools (with country field), school_features, school_feature_grants
- [ ] UI: Super Admin — school list, school detail, feature grant management (permanent + temporary)

### Subscription Management
- [ ] Schema: subscription states on schools table
- [ ] API: update subscription state, approve upgrade/downgrade requests
- [ ] UI: Super Admin — subscription management panel

### Platform Reports (basic)
- [ ] API: total schools, active schools, package distribution, student count, user count
- [ ] UI: Super Admin — platform overview dashboard

---

## Phase 2 — School Setup and Configuration

A school can fully configure itself through the onboarding wizard and settings. By the end of this phase a school is ready to receive staff and students.

### Onboarding Wizard
- [ ] UI: multi-step wizard (feature activation, sub-feature toggles, grading, report card layout, feeding config, student categories, calendar)
- [ ] API: wizard state persistence, apply defaults on skip

### School Profile
- [ ] Schema: school branding fields, country
- [ ] API: update school profile and branding
- [ ] UI: school settings — profile and branding

### Academic Year and Term Management
- [ ] Schema: academic_years, terms
- [ ] API: create academic year (auto-scaffold terms), set active year/term, configure term dates
- [ ] UI: academic year management, term configuration

### School Calendar and Public Holidays
- [ ] Schema: school_calendar_events (with source, external_holiday_key, confirmed_by)
- [ ] Integration: public holidays API (Nager.Date or equivalent)
- [ ] API: fetch and stage public holidays on year/term creation, confirm or dismiss holidays, manual calendar events
- [ ] UI: calendar view (month + term), holiday review and confirmation screen

### Grading Scale Configuration
- [ ] Schema: grading_scales, grading_scale_bands
- [ ] API: CRUD grading scales and bands
- [ ] UI: grading scale setup

### Report Card Configuration
- [ ] Schema: report_card_configs, report_card_custom_sections
- [ ] API: CRUD report card config
- [ ] UI: report card layout builder

### Student Categories
- [ ] Schema: student_categories on schools
- [ ] API: CRUD student categories
- [ ] UI: student category management

### Feeding Fee Configuration
- [ ] Schema: feeding_configs, feeding_class_rates
- [ ] API: configure rate mode (flat/per class), set rates per grade level
- [ ] UI: feeding fee configuration screen

### Class and Grade Structure
- [ ] Schema: grade_levels, classes
- [ ] API: CRUD grade levels (with sequence), CRUD class sections per grade level
- [ ] UI: grade and class management

---

## Phase 3 — People

The school can add and manage all users. Staff are configured with profiles and assignments. Students are enrolled.

### User Management
- [ ] Schema: users, user_roles (junction table for multi-role)
- [ ] API: invite staff, assign roles, activate/deactivate, password reset
- [ ] API: role-level permission overrides, user-level permission overrides (School Owner + School Admin by default)
- [ ] API: School Admin appointment (School Owner only)
- [ ] API: permission management toggle — allow/disallow School Admin from managing overrides (School Owner only)
- [ ] UI: staff list, invite flow, role assignment, permission override management
- [ ] UI: permission management toggle (visible to School Owner only)

### Staff Profiles
- [ ] Schema: staff_profiles, staff_qualifications, teacher_class_assignments, teacher_subject_assignments
- [ ] API: create/edit staff profile, manage assignments
- [ ] UI: staff profile form (created during staff invite flow), assignment management

### Admissions CRM
- [ ] Schema: admission_records, admission_form_field_configs
- [ ] API: configurable pipeline (stage toggling), lead/inquiry/application/interview/acceptance management, follow-up history
- [ ] API: custom admission form field configuration
- [ ] API: convert enrolled record to student profile (auto-trigger)
- [ ] UI: admissions pipeline board, admission form builder, conversion flow

### Student Management
- [ ] Schema: students, student_custom_fields (JSONB), student_portal_credentials, guardian_relationships
- [ ] API: create/edit student profiles (standard + custom fields), manage guardian relationships
- [ ] API: auto-generate portal credentials on profile creation
- [ ] UI: student list, student profile, custom field management, guardian management

---

## Phase 4 — Academics

The school can define its curriculum, assign teachers, build timetables, and record assessments.

### Subjects
- [ ] Schema: subjects (per school, per grade level)
- [ ] API: CRUD subjects, assign subjects to grade levels
- [ ] UI: subject management

### Timetable Management
- [ ] Schema: timetable_configs, timetable_breaks, timetable_slots
- [ ] API: configure periods and breaks per term, assign subject + teacher to slots, clash detection
- [ ] UI: timetable builder (grid view per class), clash report, teacher timetable view

### Assessments and Exams
- [ ] Schema: assessments, exam_records, assessment_scores
- [ ] API: create assessments and exams, record scores per student
- [ ] UI: assessment management, score entry

### Grading
- [ ] API: derive display grade from raw score using school's active grading scale
- [ ] UI: grade book view per class per subject

### Student Progression
- [ ] API: initiate end-of-year promotion, bulk promote with individual exceptions (promote / repeat / skip)
- [ ] UI: progression management screen, exception handling

---

## Phase 5 — Daily Operations

Day-to-day tracking of attendance, feeding, and transport.

### Student Attendance
- [ ] Schema: student_attendance_records
- [ ] API: mark daily attendance per class, calendar-aware (no records on non-school days)
- [ ] UI: daily attendance marking screen, attendance summary

### Staff Attendance
- [ ] Schema: staff_attendance_records
- [ ] API: mark daily staff attendance
- [ ] UI: staff attendance screen

### Transport
- [ ] Schema: vehicles, transport_routes (with daily rate), drivers, student_transport_assignments, pickup_points
- [ ] API: CRUD vehicles, routes, drivers, assign students to routes
- [ ] UI: transport management, student assignment

### Feeding Fee Daily Collection
- [ ] Schema: feeding_enrollments, feeding_payments, feeding_daily_records
- [ ] API: enrol students in feeding, daily collection (mark paid, auto-handle pre-covered, flag unpaid), pre-payment recording, daily reconciliation report
- [ ] UI: daily collection screen (attendance-aware), pre-payment entry, reconciliation summary

### Transport Fee Daily Collection
- [ ] Schema: transport_payments, transport_daily_records
- [ ] API: daily collection, pre-payment recording, reconciliation report (same model as feeding)
- [ ] UI: daily transport collection screen, reconciliation summary

---

## Phase 6 — Finance

Termly fee management and financial records.

### Fee Structures
- [ ] Schema: fee_structures (per grade level × student category × term)
- [ ] API: CRUD fee structures
- [ ] UI: fee structure configuration

### Invoicing and Payments
- [ ] Schema: invoices, payments, receipts
- [ ] API: auto-generate invoices on term start, manual payment recording, receipts, outstanding balance queries
- [ ] UI: invoice management, payment recording, receipt generation, outstanding balances view

---

## Phase 7 — Communication and Portals

Staff communicate with stakeholders. Students and parents access their portal.

### Communication Center
- [ ] Schema: notices, announcements, messages
- [ ] API: create and publish notices/announcements, internal messaging
- [ ] UI: communication center (staff), notice composer

### Student Portal
- [ ] UI: portal authentication (student ID + password)
- [ ] UI: attendance view
- [ ] UI: timetable view
- [ ] UI: academic progress and grades view
- [ ] UI: report card view and download
- [ ] UI: notices view
- [ ] UI: transport information view
- [ ] UI: feeding balance view

### Report Card Generation
- [ ] API: compile report card data per student per term, apply configured layout, generate PDF
- [ ] API: publish report cards (triggers notification)
- [ ] UI: report card generation screen, preview, publish action

### In-Platform Notifications
- [ ] API: notification delivery to notifications table on configured events
- [ ] UI: notification bell and list (staff portal + student portal)

---

## Phase 8 — Reporting and Analytics

Visibility across the whole system for school leadership and Super Admin.

### School Reports
- [ ] API + UI: enrollment report
- [ ] API + UI: attendance report (by class, by student, by date range)
- [ ] API + UI: academic performance report
- [ ] API + UI: fee balances report
- [ ] API + UI: transport report
- [ ] API + UI: feeding collection report

### Student Performance Tracking
- [ ] API + UI: longitudinal performance view per student (grades + attendance across all years)
- [ ] UI: early decline detection indicators

### Audit Log Viewer
- [ ] API: query audit logs (filterable by actor, action type, date range)
- [ ] UI: audit log viewer (School Owner + School Admin within tenant, Super Admin across all tenants)

### Platform Reports (extended)
- [ ] API + UI: enhanced Super Admin analytics dashboard

---

## Deferred (Phase 2 Candidates)

Items intentionally excluded from Phase 1. Revisit after launch.

- Homework and assignments
- Disciplinary records
- Online public admissions form (public-facing link)
- Direct parent-teacher messaging
- Extracurricular activities
- Staff leave management
- Library management
- Email and SMS notification delivery
- Payment gateway integration
- Alumni management
