import { Prisma } from '@/app/generated/prisma/client'
import { prisma } from './db'

const QUOTA_LIMIT = 10
const SLOTS_PER_LEAD = 3

// Mandatory providers that must receive every lead for a given service (if they have quota)
const MANDATORY: Record<number, number[]> = {
  1: [1],
  2: [5],
  3: [1, 4],
}

// Provider pools for fair round-robin allocation (after mandatory slots are filled)
const POOL: Record<number, number[]> = {
  1: [2, 3, 4],
  2: [6, 7, 8],
  3: [2, 3, 5, 6, 7, 8],
}

type ProviderRow = { id: number; quota_used: number }
type CursorRow = { next_position: number }

export async function assignLead(leadId: number, serviceId: number) {
  const mandatory = MANDATORY[serviceId] ?? []
  const pool = POOL[serviceId] ?? []

  // Sort IDs ascending — consistent lock acquisition order prevents deadlocks
  const allIds = [...new Set([...mandatory, ...pool])].sort((a, b) => a - b)

  await prisma.$transaction(
    async (tx) => {
      // Lock the cursor row for this service. Two concurrent leads for the same
      // service will queue here — the second one sees the cursor the first left.
      const cursors = await tx.$queryRaw<CursorRow[]>`
        SELECT next_position
        FROM allocation_cursors
        WHERE service_id = ${serviceId}
        FOR UPDATE
      `

      const cursor = cursors[0]
      if (!cursor) throw new Error(`No allocation cursor for service ${serviceId}`)

      // Lock provider rows in sorted order to prevent cross-service deadlocks.
      const providers = await tx.$queryRaw<ProviderRow[]>(
        Prisma.sql`
          SELECT id, quota_used
          FROM providers
          WHERE id IN (${Prisma.join(allIds)})
          ORDER BY id
          FOR UPDATE
        `
      )

      const byId = new Map(providers.map(p => [p.id, p]))

      // Collect mandatory assignments — skip any that have hit quota
      const assigned: number[] = []
      for (const id of mandatory) {
        const p = byId.get(id)
        if (p && p.quota_used < QUOTA_LIMIT) assigned.push(id)
      }

      // Fill remaining slots with round-robin from pool
      const need = SLOTS_PER_LEAD - assigned.length
      let pos = cursor.next_position
      let tries = 0
      const fromPool: number[] = []

      while (fromPool.length < need && tries < pool.length) {
        const id = pool[pos % pool.length]
        const p = byId.get(id)
        if (p && p.quota_used < QUOTA_LIMIT && !assigned.includes(id)) {
          fromPool.push(id)
        }
        pos = (pos + 1) % pool.length
        tries++
      }

      if (fromPool.length < need) {
        throw new Error(
          `Not enough providers with remaining quota to fill lead #${leadId} (need ${need}, got ${fromPool.length})`
        )
      }

      const final = [...assigned, ...fromPool]

      // Persist the new cursor position so the next lead continues from here
      await tx.$executeRaw`
        UPDATE allocation_cursors
        SET next_position = ${pos}
        WHERE service_id = ${serviceId}
      `

      for (const id of final) {
        await tx.$executeRaw`
          UPDATE providers SET quota_used = quota_used + 1 WHERE id = ${id}
        `
        await tx.$executeRaw`
          INSERT INTO lead_assignments (lead_id, provider_id)
          VALUES (${leadId}, ${id})
          ON CONFLICT (lead_id, provider_id) DO NOTHING
        `
      }
    },
    { timeout: 15_000 }
  )
}
