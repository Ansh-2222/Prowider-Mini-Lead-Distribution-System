import { PrismaClient } from '@/app/generated/prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const base = process.env.DATABASE_URL ?? ''
  // Cap connections per serverless instance to avoid exhausting Render's free-tier
  // connection limit (~97 total) when multiple Vercel instances are warm simultaneously.
  const sep = base.includes('?') ? '&' : '?'
  const url = base.includes('connection_limit')
    ? base
    : `${base}${sep}connection_limit=3&pool_timeout=30`

  return new PrismaClient({
    log: ['error'],
    datasourceUrl: url,
    // Default transaction options applied to every $transaction call.
    // maxWait: how long to wait for a pool connection before the transaction
    // can even start (Prisma default is 2 s — too short for 10 concurrent ops
    // sharing a connection_limit=3 pool).
    // timeout: how long the transaction body may run once started.
    transactionOptions: {
      maxWait: 30_000,
      timeout: 20_000,
    },
  })
}

// Always cache on globalThis — works across hot-reloads (dev) and across
// invocations of the same warm serverless instance (production).
export const prisma = globalThis.__prisma ?? (globalThis.__prisma = createPrismaClient())
