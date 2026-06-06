import { Module } from '@nestjs/common';
import { FeaturesService } from './features/features.service';
import { FeaturesController } from './features/features.controller';
import { ProfileService } from './profile/profile.service';
import { ProfileController } from './profile/profile.controller';
import { AcademicYearsService } from './academic-years/academic-years.service';
import { AcademicYearsController } from './academic-years/academic-years.controller';
import { CalendarService } from './calendar/calendar.service';
import { CalendarController } from './calendar/calendar.controller';
import { GradeStructureService } from './grade-structure/grade-structure.service';
import { GradeStructureController } from './grade-structure/grade-structure.controller';
import { GradingService } from './grading/grading.service';
import { GradingController } from './grading/grading.controller';
import { StudentCategoriesService } from './student-categories/student-categories.service';
import { StudentCategoriesController } from './student-categories/student-categories.controller';
import { FeedingConfigService } from './feeding-config/feeding-config.service';
import { FeedingConfigController } from './feeding-config/feeding-config.controller';
import { ReportCardConfigService } from './report-card-config/report-card-config.service';
import { ReportCardConfigController } from './report-card-config/report-card-config.controller';

@Module({
  providers: [
    FeaturesService,
    ProfileService,
    AcademicYearsService,
    CalendarService,
    GradeStructureService,
    GradingService,
    StudentCategoriesService,
    FeedingConfigService,
    ReportCardConfigService,
  ],
  controllers: [
    FeaturesController,
    ProfileController,
    AcademicYearsController,
    CalendarController,
    GradeStructureController,
    GradingController,
    StudentCategoriesController,
    FeedingConfigController,
    ReportCardConfigController,
  ],
  exports: [
    CalendarService,
    GradeStructureService,
    GradingService,
    FeedingConfigService,
  ],
})
export class SchoolSetupModule {}
