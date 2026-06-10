import { Global, Module } from '@nestjs/common';
import { TeacherScopeService } from './teacher-scope.service';

// Global so attendance, assessments and staff can enforce the same teacher
// scoping rules without re-importing.
@Global()
@Module({
  providers: [TeacherScopeService],
  exports: [TeacherScopeService],
})
export class TeacherScopeModule {}
