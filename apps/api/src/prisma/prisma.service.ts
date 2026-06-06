import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTenantScopeMiddleware } from './tenant-scope.middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Defense-in-depth tenant isolation (C4): auto-scope every schoolId-owning
    // model by the current request's tenant. Registered before $connect so it
    // covers all queries.
    this.$use(createTenantScopeMiddleware());
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
