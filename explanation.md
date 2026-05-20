# Prowider Mini — Explanation

## Setup Instructions

### Prerequisites

- Node.js 18+
- A PostgreSQL database (Render free tier works)
- A Vercel account for deployment

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment file and fill in your database URL
cp .env.example .env
# Edit .env — set DATABASE_URL to your PostgreSQL connection string

# 3. Push the schema to the database and seed reference data
npm run db:setup

# 4. Start the dev server
npm run dev
```

`db:setup` runs `prisma db push` (creates all tables) followed by `prisma/seed.ts`
(inserts the 3 services, 8 providers, and 3 allocation cursors).

### Production Deployment (Vercel + Render)

1. Create a PostgreSQL database on Render. Copy the **External Database URL**.
2. In Vercel, add the environment variable `DATABASE_URL` with that URL.
   The application automatically appends `?connection_limit=3&pool_timeout=30`
   if those parameters are not already present, so no manual query-string editing
   is required.
3. Deploy — Vercel runs `prisma generate && next build` automatically via the
   `build` script in `package.json`.
4. After the first deploy, run the seed once from your local machine against the
   production database:
   ```bash
   DATABASE_URL="<your-render-url>" npm run db:seed
   ```

---

## Allocation Algorithm

Each lead is assigned to **exactly 3 providers** according to fixed rules per
service, with a fair round-robin rotation for the non-mandatory slots.

### Rules

| Service | Mandatory (always gets the lead) | Pool (round-robin rotation) |
|---------|----------------------------------|-----------------------------|
| Service 1 | Provider 1 | Providers 2, 3, 4 |
| Service 2 | Provider 5 | Providers 6, 7, 8 |
| Service 3 | Providers 1 & 4 | Providers 2, 3, 5, 6, 7, 8 |

### How It Works

1. **Mandatory providers** are assigned first, up to the 3-slot limit, provided
   they have remaining monthly quota (max 10 leads per provider).
2. **Pool providers** fill the remaining slots via round-robin. A per-service
   cursor stored in the `allocation_cursors` table records where the rotation
   left off. Each successful lead advances the cursor so the next lead picks up
   from the next position in the pool.
3. If fewer than 3 eligible providers exist (quota exhausted), the transaction
   is rolled back and the lead is rejected with a 422 error.

### Example — Service 1, 4 consecutive leads

```
Lead 1 → Provider 1 (mandatory) + Provider 2 (pool pos 0) + Provider 3 (pool pos 1) → cursor = 2
Lead 2 → Provider 1 (mandatory) + Provider 4 (pool pos 2) + Provider 2 (pool pos 0) → cursor = 1
...
```

---

## How Concurrency Was Handled

The concurrency test fires 10 lead-creation requests simultaneously via
`Promise.allSettled`. Several layers work together to keep this correct and
safe.

### 1. Database-level serialisation with `SELECT … FOR UPDATE`

Inside each allocation transaction, the first statement locks the cursor row
for that service:

```sql
SELECT next_position FROM allocation_cursors WHERE service_id = ? FOR UPDATE
```

Two concurrent requests for the **same service** will queue at this lock.
The second request always sees the cursor position the first request left,
so the round-robin advances correctly with no skipped or repeated positions.

### 2. Deadlock prevention — sorted lock acquisition

After locking the cursor, provider rows are locked in **ascending ID order**
regardless of which service is being processed:

```sql
SELECT id, quota_used FROM providers WHERE id IN (…) ORDER BY id FOR UPDATE
```

Acquiring locks in a globally consistent order means two transactions can never
hold lock A while waiting for lock B in opposite order — eliminating deadlocks.

### 3. Prisma connection pool — bounded and patient

`lib/db.ts` sets `connection_limit=3` on the database URL, capping each
serverless instance to 3 simultaneous PostgreSQL connections. This prevents
connection exhaustion on Render's free tier (97-connection limit) across
multiple warm Vercel instances.

Transaction options are set to tolerate the queuing this creates:

```typescript
transactionOptions: {
  maxWait: 30_000,   // wait up to 30 s to get a pool connection (Prisma default: 2 s)
  timeout: 20_000,   // transaction body must finish within 20 s once started
}
```

The default `maxWait` of 2 seconds was the root cause of failures: with 10
concurrent transactions sharing 3 connections, 7 of them timed out before even
starting. Raising it to 30 seconds lets them queue patiently and all succeed.

### 4. PrismaClient singleton

`lib/db.ts` stores the client on `globalThis.__prisma` so a single instance
(and its connection pool) is reused across invocations of the same warm Vercel
function process, rather than opening a fresh pool on every request.

### 5. Duplicate-assignment guard

Even if two concurrent transactions for the same service somehow assigned the
same provider, the database enforces a unique constraint on `(lead_id, provider_id)`
in `lead_assignments`. The INSERT uses `ON CONFLICT DO NOTHING` so a race never
produces duplicate rows.

---

## How Webhook Idempotency Is Ensured

The quota-reset webhook (`POST /api/webhook/reset-quota`) accepts an
`X-Idempotency-Key` header. Callers may safely retry or send the same request
multiple times — only the first call takes effect.

### Mechanism

The `processed_webhooks` table has `idempotency_key` as its primary key
(unique by definition). Processing is wrapped in a single transaction:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.processedWebhook.create({ data: { idempotencyKey: key } })  // INSERT
  await tx.provider.updateMany({ data: { quotaUsed: 0 } })             // reset
})
```

- **First call** — the INSERT succeeds, the quota reset runs, the transaction
  commits.
- **Duplicate call (after the first committed)** — a pre-check
  (`findUnique`) returns the existing record immediately, and the handler
  returns `{ idempotent: true }` without touching the database again.
- **Concurrent duplicate calls** — if two requests arrive simultaneously and
  both pass the pre-check, only one INSERT can succeed because of the primary
  key constraint. The loser gets a `P2002` unique-constraint error, which is
  caught and returned as `{ idempotent: true }`. The quota is never reset twice.

The idempotency test (`/api/test/trigger-webhook`) fires 3 identical calls with
the same key via `Promise.allSettled`. Exactly 1 will show `processed: true`;
the other 2 will show `processed: false` with the reason `"lost race"` or
`"already processed"`.
