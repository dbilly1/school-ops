import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { createTenantScopeMiddleware } from './tenant-scope.middleware';

// Set PRISMA_LOG_QUERIES=1 to log every SQL query with its duration — diagnostic
// for slowness (shows which queries are slow and how many run per request).
const LOG_QUERIES = process.env.PRISMA_LOG_QUERIES === '1';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaQuery');

  constructor() {
    super(
      LOG_QUERIES
        ? { log: [{ emit: 'event', level: 'query' }] }
        : {},
    );
  }

  async onModuleInit() {
    if (LOG_QUERIES) {
      // @ts-expect-error — 'query' event typing is conditional on the log config above
      this.$on('query', (e: Prisma.QueryEvent) => {
        this.logger.log(`${e.duration}ms  ${e.query}`);
      });
    }

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
