import { PrismaClient } from '@prisma/client';
import { ResolveAccessContextUseCase } from '../application/use-cases/ResolveAccessContextUseCase';
import { PrismaAccessRepository } from './PrismaAccessRepository';
import { InMemoryAccessCache } from './InMemoryAccessCache';

/**
 * A real, Prisma-backed `ResolveAccessContextUseCase` bound to `prisma`. Each
 * `create*Router` factory takes an optional `resolveAccessContext` (wired by
 * `createApp`, which builds one shared instance so its cache is actually
 * shared across routers) and falls back to this when the router is
 * constructed directly, as several integration test files do.
 */
export function defaultResolveAccessContext(prisma: PrismaClient): ResolveAccessContextUseCase {
  return new ResolveAccessContextUseCase(new PrismaAccessRepository(prisma), new InMemoryAccessCache());
}
