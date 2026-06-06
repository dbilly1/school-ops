import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuditViewerService } from './audit-viewer.service';
import { SchoolAuditViewerController, PlatformAuditViewerController } from './audit-viewer.controller';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [PassportModule, SuperAdminModule],
  providers: [AuditViewerService],
  controllers: [SchoolAuditViewerController, PlatformAuditViewerController],
})
export class AuditViewerModule {}
