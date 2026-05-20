import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  await prisma.service.createMany({
    data: [
      { id: 1, name: 'Service 1' },
      { id: 2, name: 'Service 2' },
      { id: 3, name: 'Service 3' },
    ],
    skipDuplicates: true,
  })

  console.log('Services seeded')

  await prisma.provider.createMany({
    data: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Provider ${i + 1}`,
      quotaUsed: 0,
    })),
    skipDuplicates: true,
  })

  console.log('Providers seeded')

  await prisma.allocationCursor.createMany({
    data: [
      { serviceId: 1, nextPosition: 0 },
      { serviceId: 2, nextPosition: 0 },
      { serviceId: 3, nextPosition: 0 },
    ],
    skipDuplicates: true,
  })

  console.log('Allocation cursors seeded')
  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })