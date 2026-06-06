import { Global, Module } from '@nestjs/common';
import { PermissionCacheService } from './permission-cache.service';

/**
 * Global so any service on a write path can inject PermissionCacheService to
 * invalidate, and the auth services can inject it to memoize.
 */
@Global()
@Module({
  providers: [PermissionCacheService],
  exports: [PermissionCacheService],
})
export class CacheModule {}
