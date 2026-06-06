import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { SuperAdminAuthService } from './auth/super-admin-auth.service';
import { SuperAdminAuthController } from './auth/super-admin-auth.controller';
import { JwtSuperAdminStrategy } from './auth/strategies/jwt-super-admin.strategy';
import { PackagesService } from './packages/packages.service';
import { PackagesController } from './packages/packages.controller';
import { SuperAdminSchoolsService } from './schools/super-admin-schools.service';
import { SuperAdminSchoolsController } from './schools/super-admin-schools.controller';
import { PlatformAnalyticsService } from './analytics/platform-analytics.service';
import { PlatformAnalyticsController } from './analytics/platform-analytics.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    SuperAdminAuthService,
    JwtSuperAdminStrategy,
    PackagesService,
    SuperAdminSchoolsService,
    PlatformAnalyticsService,
  ],
  controllers: [
    SuperAdminAuthController,
    PackagesController,
    SuperAdminSchoolsController,
    PlatformAnalyticsController,
  ],
  exports: [PackagesService],
})
export class SuperAdminModule {}
