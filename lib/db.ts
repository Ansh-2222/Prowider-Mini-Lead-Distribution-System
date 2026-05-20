import { PrismaClient } from '@/app/generated/prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function buildDatasourceUrl(): string {
  const raw = process.env.DATABASE_URL ?? ''
  try {
    const u = new URL(raw)
    // pgbouncer=true is only correct when an actual PgBouncer proxy sits in
    // front of PostgreSQL. Render's free PostgreSQL has no PgBouncer — this
    // flag disables prepared statements and breaks transaction semantics.
    u.searchParams.delete('pgbouncer')
    // Always enforce our pool settings so no DATABASE_URL value set in Vercel
    // (or anywhere else) can accidentally bottleneck concurrent requests.
    // connection_limit=5: 2 rounds of 5 handle 10 concurrent leads comfortably.
    // At ≤20 warm Vercel instances: 20×5 = 100 connections, within Render's
    // 97-connection free-tier limit with a reasonable safety margin.
    u.searchParams.set('connection_limit', '5')
    // pool_timeout: seconds a regular query waits for a pool slot (distinct
    // from the per-transaction maxWait set in transactionOptions below).
    u.searchParams.set('pool_timeout', '30')
    return u.toString()
  } catch {
    // Fallback: return raw if URL is unparseable (should not happen in practice).
    return raw
  }
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: ['error'],
    datasourceUrl: buildDatasourceUrl(),
    // maxWait: how long $transaction waits for a pool connection before it can
    // even start. Prisma default is 2 s — far too short for 10 concurrent ops
    // sharing a pool of 5. timeout: budget for the transaction body itself.
    transactionOptions: {
      maxWait: 30_000,
      timeout: 20_000,
    },
  })
}

// Always cache on globalThis — works across hot-reloads (dev) and across
// invocations of the same warm serverless instance (production).
export const prisma = globalThis.__prisma ?? (globalThis.__prisma = createPrismaClient())
