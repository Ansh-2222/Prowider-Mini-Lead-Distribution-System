import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcast } from '@/lib/sse'

// Runs the reset-quota logic 3 times concurrently with the same key.
// The unique constraint on processed_webhooks ensures exactly one succeeds.
async function attemptReset(key: string) {
  const existing = await prisma.processedWebhook.findUnique({
    where: { idempotencyKey: key },
  })

  if (existing) {
    return { processed: false, reason: 'already processed' }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.processedWebhook.create({ data: { idempotencyKey: key } })
      await tx.provider.updateMany({ data: { quotaUsed: 0 } })
    })
    broadcast('quota-reset', { message: 'Quotas reset via idempotency test' })
    return { processed: true }
  } catch (e) {
    if ((e as any)?.code === 'P2002') {
      return { processed: false, reason: 'lost race — another call processed first' }
    }
    throw e
  }
}

export async function POST() {
  const key = `idempotency-test-${Date.now()}`

  const results = await Promise.allSettled([
    attemptReset(key),
    attemptReset(key),
    attemptReset(key),
  ])

  const outcome = results.map(r =>
    r.status === 'fulfilled' ? r.value : { processed: false, reason: 'exception' }
  )

  const processedCount = outcome.filter(r => r.processed).length

  return NextResponse.json({
    key,
    note: 'Exactly 1 of 3 calls should show processed: true',
    processedCount,
    results: outcome,
  })
}
