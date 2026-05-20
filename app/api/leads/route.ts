import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { assignLead } from '@/lib/allocate'
import { broadcast } from '@/lib/sse'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, phone, city, serviceId, description } = body

  if (!name || !phone || !city || !serviceId || !description) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  if (![1, 2, 3].includes(Number(serviceId))) {
    return NextResponse.json({ error: 'Invalid service' }, { status: 400 })
  }

  let lead: { id: number }

  try {
    lead = await prisma.lead.create({
      data: {
        customerName: String(name).trim(),
        phone: String(phone).trim(),
        city: String(city).trim(),
        serviceId: Number(serviceId),
        description: String(description).trim(),
      },
      select: { id: true },
    })
  } catch (e) {
    if ((e as any)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A lead for this phone number and service already exists.' },
        { status: 409 }
      )
    }
    throw e
  }

  try {
    await assignLead(lead.id, Number(serviceId))
  } catch (e) {
    // Roll back the lead if we can't assign providers
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => {})
    const msg = e instanceof Error ? e.message : 'Provider assignment failed'
    return NextResponse.json({ error: msg }, { status: 422 })
  }

  const assignments = await prisma.leadAssignment.findMany({
    where: { leadId: lead.id },
    select: { providerId: true, provider: { select: { name: true } } },
  })

  broadcast('lead-assigned', {
    leadId: lead.id,
    serviceId: Number(serviceId),
    providers: assignments.map(a => ({ id: a.providerId, name: a.provider.name })),
  })

  return NextResponse.json({ leadId: lead.id }, { status: 201 })
}
