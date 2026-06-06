import { Module } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SuperAdminModule, AuthModule],
  providers: [SchoolsService],
  controllers: [SchoolsController],
})
export class SchoolsModule {}
