import { Module } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { AssessmentResultsPdfService } from './assessment-results-pdf.service';
import { AssessmentsController } from './assessments.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';

@Module({
  imports: [SchoolSetupModule],
  providers: [AssessmentsService, AssessmentResultsPdfService],
  controllers: [AssessmentsController],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
