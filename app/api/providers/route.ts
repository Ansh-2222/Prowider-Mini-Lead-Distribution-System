import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const providers = await prisma.provider.findMany({
    orderBy: { id: 'asc' },
    include: {
      assignments: {
        orderBy: { assignedAt: 'desc' },
        include: {
          lead: {
            include: { service: true },
          },
        },
      },
    },
  })

  const payload = providers.map(p => ({
    id: p.id,
    name: p.name,
    quotaUsed: p.quotaUsed,
    quotaRemaining: 10 - p.quotaUsed,
    leads: p.assignments.map(a => ({
      leadId: a.leadId,
      customerName: a.lead.customerName,
      phone: a.lead.phone,
      city: a.lead.city,
      service: a.lead.service.name,
      assignedAt: a.assignedAt,
    })),
  }))

  return NextResponse.json(payload)
}
