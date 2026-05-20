import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { assignLead } from '@/lib/allocate'
import { broadcast } from '@/lib/sse'

export const maxDuration = 60

const SERVICES = [1, 2, 3] as const

function randomPhone() {
  return `9${Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000)}`
}

async function createOne(index: number) {
  const serviceId = SERVICES[index % 3]
  const phone = randomPhone()

  let lead: { id: number }
  try {
    lead = await prisma.lead.create({
      data: {
        customerName: `Bulk Test ${index + 1}`,
        phone,
        city: 'Mumbai',
        serviceId,
        description: 'Auto-generated lead for concurrency test',
      },
      select: { id: true },
    })
  } catch (e) {
    if ((e as any)?.code === 'P2002') {
      return { ok: false, reason: 'duplicate phone' }
    }
    throw e
  }

  await assignLead(lead.id, serviceId)

  const assignments = await prisma.leadAssignment.findMany({
    where: { leadId: lead.id },
    select: { providerId: true, provider: { select: { name: true } } },
  })

  broadcast('lead-assigned', {
    leadId: lead.id,
    serviceId,
    providers: assignments.map(a => ({ id: a.providerId, name: a.provider.name })),
  })

  return { ok: true, leadId: lead.id, serviceId }
}

export async function POST() {
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => createOne(i))
  )

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
  const failed = results.length - succeeded
  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => (r as PromiseRejectedResult).reason?.message ?? 'unknown error')

  return NextResponse.json({ total: 10, succeeded, failed, errors })
}
