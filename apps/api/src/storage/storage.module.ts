import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// Global so both the super-admin curriculum module and the school curriculum
// module can share one storage client.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
