import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tenantStorage } from '../tenant/tenant.context';

/**
 * Defense-in-depth tenant isolation (security review C4).
 *
 * Auto-applies the current request's `schoolId` to every Prisma operation on a
 * model that owns a `schoolId` column, so a query that forgets to scope by
 * tenant can no longer leak across schools. It is a safety net layered *under*
 * the explicit `schoolId` filters the services already write — not a
 * replacement for them.
 *
 * No-ops entirely when there is no tenant context (super-admin and auth flows
 * carry no `schoolId`, so platform-wide queries are untouched).
 *
 * NOTE: uses `$use` middleware, deprecated in Prisma 6. Migrate to a client
 * `$extends` query extension when upgrading.
 */

// Models with a `schoolId` scalar — derived from the datamodel so the set stays
// correct as the schema evolves. Models scoped only through a parent relation
// (e.g. AssessmentScore, GuardianRelationship) are intentionally excluded.
const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'schoolId' && f.kind === 'scalar'))
    .map((m) => m.name),
);

// Operations whose `where` accepts arbitrary filters — we merge `schoolId` in.
// (`update`/`delete`/`upsert` accept an extra scalar filter alongside the unique
// key in Prisma 5, so a cross-tenant target simply matches nothing.)
const WHERE_INJECT_ACTIONS: ReadonlySet<Prisma.PrismaAction> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
  'update',
  'delete',
  'upsert',
]);

// Only warn for read operations where a missing filter implies a potential
// leak. Mutations by unique id legitimately omit a top-level schoolId.
const WARN_ACTIONS: ReadonlySet<Prisma.PrismaAction> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const isDev = process.env.NODE_ENV !== 'production';

function warn(model: string, action: string) {
  // eslint-disable-next-line no-console
  console.warn(
    `[tenant-scope] auto-applied schoolId to ${model}.${action} — query had no explicit schoolId filter`,
  );
}

export function createTenantScopeMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const store = tenantStorage.getStore();
    if (!store || !params.model || !TENANT_MODELS.has(params.model)) {
      return next(params);
    }

    const { schoolId } = store;
    const action = params.action;
    params.args = params.args ?? {};

    if (WHERE_INJECT_ACTIONS.has(action)) {
      const where = params.args.where ?? {};
      if (isDev && WARN_ACTIONS.has(action) && where.schoolId === undefined) {
        warn(params.model, action);
      }
      params.args.where = { ...where, schoolId };
      if (action === 'upsert') {
        params.args.create = { ...(params.args.create ?? {}), schoolId };
      }
    } else if (action === 'create') {
      params.args.data = { ...(params.args.data ?? {}), schoolId };
    } else if (action === 'createMany') {
      const data = params.args.data;
      params.args.data = Array.isArray(data)
        ? data.map((row: Record<string, unknown>) => ({ ...row, schoolId }))
        : { ...(data ?? {}), schoolId };
    } else if (action === 'findUnique' || action === 'findUniqueOrThrow') {
      // `findUnique` where accepts only unique fields, so schoolId can't be
      // injected (and rewriting to findFirst would break compound-unique keys
      // like studentId_academicYearId). Post-filter the result instead.
      const result = await next(params);
      if (result && result.schoolId !== schoolId) {
        if (action === 'findUniqueOrThrow') {
          throw new NotFoundException(`${params.model} not found`);
        }
        return null;
      }
      return result;
    }

    return next(params);
  };
}
