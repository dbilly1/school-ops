import { Module } from '@nestjs/common';
import { TransportService } from './transport.service';
import { TransportController } from './transport.controller';
import { TransportFeesService } from './transport-fees.service';
import { TransportFeesController } from './transport-fees.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';

@Module({
  imports: [SchoolSetupModule],
  providers: [TransportService, TransportFeesService],
  controllers: [TransportController, TransportFeesController],
  exports: [TransportService],
})
export class TransportModule {}
