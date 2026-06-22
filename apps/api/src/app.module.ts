import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { SchoolsModule } from './schools/schools.module';
import { SchoolSetupModule } from './school-setup/school-setup.module';
import { UsersModule } from './users/users.module';
import { StaffModule } from './staff/staff.module';
import { TeacherScopeModule } from './staff/teacher-scope.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { StudentsModule } from './students/students.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TimetablesModule } from './timetables/timetables.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ProgressionModule } from './progression/progression.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TransportModule } from './transport/transport.module';
import { FeedingModule } from './feeding/feeding.module';
import { FinanceModule } from './finance/finance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CommunicationModule } from './communication/communication.module';
import { ReportCardsModule } from './report-cards/report-cards.module';
import { PortalModule } from './portal/portal.module';
import { ReportsModule } from './reports/reports.module';
import { AuditViewerModule } from './audit-viewer/audit-viewer.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PlannerModule } from './planner/planner.module';
import { LessonNotesModule } from './lesson-notes/lesson-notes.module';
import { StorageModule } from './storage/storage.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Look for .env at the monorepo root first, fall back to a local .env for production deploys
      envFilePath: ['../../.env', '.env'],
    }),
    MailModule,
    CacheModule,
    PrismaModule,
    TenantModule,
    AuthModule,
    FeatureFlagsModule,
    PermissionsModule,
    TeacherScopeModule,
    AuditModule,
    SuperAdminModule,
    SchoolsModule,
    SchoolSetupModule,
    UsersModule,
    StaffModule,
    AdmissionsModule,
    StudentsModule,
    SubjectsModule,
    TimetablesModule,
    AssessmentsModule,
    ProgressionModule,
    AttendanceModule,
    TransportModule,
    FeedingModule,
    FinanceModule,
    NotificationsModule,
    CommunicationModule,
    ReportCardsModule,
    PortalModule,
    ReportsModule,
    AuditViewerModule,
    DashboardModule,
    PlannerModule,
    LessonNotesModule,
    StorageModule,
    CurriculumModule,
  ],
})
export class AppModule {}
