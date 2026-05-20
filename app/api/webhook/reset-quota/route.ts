import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcast } from '@/lib/sse'

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-idempotency-key')

  if (!key) {
    return NextResponse.json(
      { error: 'X-Idempotency-Key header is required' },
      { status: 400 }
    )
  }

  // Check before attempting — avoids hitting the unique constraint in the happy path
  const existing = await prisma.processedWebhook.findUnique({
    where: { idempotencyKey: key },
  })

  if (existing) {
    return NextResponse.json({
      message: 'Already processed',
      idempotent: true,
      processedAt: existing.processedAt,
    })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Record the webhook first — if this INSERT succeeds, we own this key
      await tx.processedWebhook.create({ data: { idempotencyKey: key } })
      await tx.provider.updateMany({ data: { quotaUsed: 0 } })
    })
  } catch (e) {
    if ((e as any)?.code === 'P2002') {
      return NextResponse.json({ message: 'Already processed', idempotent: true })
    }
    throw e
  }

  broadcast('quota-reset', { message: 'All provider quotas have been reset to 10' })

  return NextResponse.json({ message: 'Quotas reset successfully' })
}
