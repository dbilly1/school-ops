## Project Context

This project is a multi-tenant School Operations SaaS platform.

All code must support:

- Multi-tenancy
- Feature flags
- Role-based permissions
- Package-based access

---

## Architecture Rules

- Use NestJS modules.
- Use Prisma ORM.
- Use PostgreSQL.
- Use UUID primary keys.
- Use soft deletes where appropriate.

---

## Multi-Tenancy Rules

Every business entity must include:

tenant_id

All queries must be tenant-scoped.

Never return cross-tenant data.

---

## Multi-Role Rules

Staff users can hold multiple roles simultaneously.

Permissions resolve as a union across all roles a user holds.

Do not assume a user has a single role. Always query user roles as a collection.

School Owner and School Admin bypass permission checks — always return ALLOW after feature/package checks pass.

---

## Data Scoping Rules

Permission checks determine what a user can do. Assignment tables determine which records they can see.

Always apply assignment-based scoping for Teacher queries:

- Class Teacher: scope to assigned classes via teacher_class_assignments.
- Subject Teacher: scope to assigned subjects and their associated classes via teacher_subject_assignments.
- Teacher with both roles: union of class and subject scopes.

School Owner, School Admin, Accountant, and Transport Officer see all records school-wide — no assignment scoping needed for these roles.

Never return records outside a user's assignment scope, even if their permissions allow the action.

---

## Teacher Rules

Teachers may be:

- Class Teachers
- Subject Teachers
- Both

Do not assume one teacher belongs to one class.

---

## Package Rules

Packages must not be hardcoded.

Packages are database-driven records managed by Super Admin.

A package defines which features and sub-features are available to a school.

---

## Feature Flag Rules

Every feature exists in one of three states per school: UNAVAILABLE, AVAILABLE, ACTIVE.

Sub-features are independently togglable within an ACTIVE feature.

Always check feature state before processing any feature-gated request.

Always check sub-feature state before processing any sub-feature-gated request.

Toggling a feature or sub-feature off must never delete data.

When checking feature availability, check both package membership and school_feature_grants. A feature is available if either condition is true.

Temporary grants have an expiry date. Expired grants do not grant access.

Sub-feature defaults on first activation come from the sub_feature_defaults table, not hardcoded values.

---

## Permission Resolution Rules

Permission checks must follow this order exactly:

1. Check package — is the feature available in the school's package?
2. Check school feature state — is the feature ACTIVE for this school?
3. Check sub-feature state — is the sub-feature enabled (if applicable)?
4. Check user-level override — if one exists, it is the final answer.
5. Check role-level override — if one exists, it is the final answer.
6. Fall back to role defaults.

Never skip steps. Never short-circuit to role defaults before checking overrides.

---

## Override Rules

Role defaults are platform-seeded. Do not modify them in application code.

Only School Owner can write to role_permission_overrides and user_permission_overrides.

Overrides cannot grant access to features outside the school's package.

---

## Authentication

Use:

- JWT Access Token
- Refresh Token

Implement RBAC using Guards.

---

## Configuration Rules

Nothing domain-specific is hardcoded. All configurable values come from the database.

This includes: grade levels, student categories, grading scales, timetable structure, report card layout, sub-feature defaults, fee structures, term dates, academic year structure.

When adding a new configurable domain concept, always ask: should this be a database-driven config or a code constant? Default to database-driven.

---

## Academic Year and Term Rules

Every time-bound record must reference both an academic_year_id and a term_id.

Always default queries to the active academic year and active term unless a historical context is explicitly provided.

Student class assignments are per academic year. Never update a historical class assignment — create a new one for the new year.

---

## School Calendar Rules

Before generating any daily expectation (attendance, feeding fee, transport fee), verify the date is a school day.

A date is a school day if:
- It falls within an active term's start_date and end_date
- AND no school_calendar_event of type holiday or vacation covers that date

Never flag a student for absence or non-payment on a non-school day.

Public holidays are fetched from an external API using the school's country setting. Never hardcode public holiday dates. Always fetch from the API and await admin confirmation before treating a date as a holiday.

Tentative public holidays (variable-date holidays) must remain in tentative state until explicitly confirmed by an admin. Do not apply them to the calendar automatically.

---

## Feeding and Transport Fee Rules

Feeding fee daily rate comes from feeding_configs. Rate mode (flat or per_class) determines which rate applies to a student.

Transport fee daily rate comes from the transport route assigned to the student.

Never hardcode either rate.

Pre-payments are reconciled on the date cash is received (payment_date), not the dates they cover.

feeding_daily_records and transport_daily_records are the source of truth for daily status. Generate them only for school days when the student is enrolled in the respective service.

---

## Audit Log Rules

Every write operation must emit an audit log entry. This includes creates, updates, deletes, and state changes.

Never log read operations.

Permission changes must include before_value and after_value in the audit log.

Audit logs are append-only. Provide no delete or update endpoint for audit_logs.

---

## Grading Rules

Always store raw numeric scores in the database.

Derive display grades (letter, GPA value, custom label) at query time using the school's active grading_scale and grading_scale_bands.

Never store a derived grade label as the source of truth.

---

## Notification Rules

Use notification_event_log as the source of truth for all system events that may trigger delivery.

V1 delivers to the notifications table only (in-platform).

Never couple notification delivery to business logic directly. Emit an event; let a handler process delivery.

---

## Database Rules

Generate Prisma schema first.

Generate migrations before API development.

---

## Development Order

1. Authentication
2. Multi-Tenancy
3. Feature Flags and Package System
4. Academic Year and Term Management
5. School Calendar
6. User Management and Staff Profiles
7. Class and Grade Structure
8. Admissions
9. Student Management
10. Academic Management (Subjects, Grading, Timetables)
11. Attendance
12. Student Portal
13. Finance (Termly Fees)
14. Feeding Fees
15. Transport
16. Transport Fees
17. Report Cards
18. Notifications
19. Reporting
20. Audit Logs (instrumented throughout, formalised here)

Never skip foundational layers.
