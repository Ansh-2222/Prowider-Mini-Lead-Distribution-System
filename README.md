# Prowider Mini

A lead distribution system. Customers submit service requests, and the system automatically assigns each lead to 3 providers based on fixed rules and a fair rotation. Built with Next.js and PostgreSQL.

---

## Setup

**You need:** Node.js and a running PostgreSQL database.

**1. Install packages**

```bash
npm install
```

**2. Set your database URL**

Copy the example file:

```bash
cp .env.example .env
```

Open `.env` and fill in your PostgreSQL connection:

```
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/prowider"
```

**3. Create tables and add seed data**

```bash
npm run db:setup
```

This creates all the tables and inserts the 3 services, 8 providers, and the starting cursor values needed for the allocation to work.

**4. Start the app**

```bash
npm run dev
```

Go to [http://localhost:3000](http://localhost:3000).

---

## Pages

| Page | What it does |
|---|---|
| `/` | Home — overview of how the system works |
| `/request-service` | Customer form to submit a new lead |
| `/dashboard` | Shows every provider's quota and their leads, updates live |
| `/test-tools` | Panel for testing concurrency, webhooks, and quota resets |

---

## How the allocation algorithm works.

When a customer submits a lead, the system needs to pick exactly **3 providers** to assign it to.

It does this in two steps:

**Step 1 — Mandatory providers**

Some providers must receive every lead for a given service, no matter what:

- Service 1 → Provider 1 always gets it
- Service 2 → Provider 5 always gets it
- Service 3 → Provider 1 and Provider 4 both always get it

These are checked first. If a mandatory provider has already hit their monthly limit (10 leads), they get skipped and the next step fills that slot instead.

**Step 2 — Pool providers (round-robin)**

After mandatory slots are filled, the remaining slots come from a rotating pool:

- Service 1 pool: Providers 2, 3, 4
- Service 2 pool: Providers 6, 7, 8
- Service 3 pool: Providers 2, 3, 5, 6, 7, 8

The system keeps track of where it left off using a "cursor" — basically a number stored in the database that remembers which provider in the pool was picked last. Each new lead continues from that position and moves it forward.

For example: if the last lead for Service 1 stopped at Provider 3, the next lead starts from Provider 4, then wraps back to Provider 2, and so on. This way no single provider gets picked more than the others over time.

The cursor is saved in the database, so it survives server restarts.

Providers who have reached their monthly quota of 10 are skipped. If there aren't enough providers with remaining quota to fill all 3 slots, the lead is rejected with an error.

---

## How concurrency is handled

The problem: if two customers submit a lead at the exact same moment, both could try to read the same cursor position and assign to the same providers — leading to unfair distribution or quota miscounts.

The fix: the entire allocation runs inside a **database transaction** with row-level locks.

At the start of each allocation, the system does two things:

1. **Locks the cursor row** for that service — so if two leads come in for Service 1 at the same time, the second one has to wait until the first finishes. They can't both read the cursor at the same time.

2. **Locks the provider rows** it's going to update — so two concurrent leads can't both count the same provider's quota as "available" and then both assign to them.

The locks are always acquired in the same order (sorted by provider ID). This is important — if you don't do this, two transactions can end up waiting for each other forever (a deadlock). By always going in the same order, one always finishes before the other starts.

---

## How webhook idempotency works

The `POST /api/webhook/reset-quota` endpoint resets all provider quotas to 10. It's designed to be called by a payment gateway when a subscription is renewed.

The problem: payment gateways sometimes send the same webhook multiple times (retries, network issues, etc.). If each call reset all quotas, that would be fine — but in a more complex system, double-processing can cause real bugs. So the endpoint is built to be **idempotent**: calling it 5 times with the same key has the exact same result as calling it once.

How it works:

Every call must include a unique `X-Idempotency-Key` header. The system stores that key in a `processed_webhooks` table after it runs.

- If the key is **not** in the table → run the reset, save the key.
- If the key **is** already in the table → do nothing, return success.

If two requests come in with the same key at the exact same time, both try to insert the key. Only one INSERT can win (the key is the primary key, so duplicates are rejected by the database). The losing request catches that error and returns gracefully.

The result: the reset happens exactly once, no matter how many times the webhook fires.

---

## Duplicate lead prevention

A phone number can only submit one lead per service. Trying to submit the same phone + service combination again will return a 409 error.

This is enforced at the **database level** with a unique constraint on `(phone, service_id)` — not just in the application code. So even if something bypasses the API, the database will still reject it.

The same phone number can submit for different services — e.g., Service 1 and Service 2 are treated as separate leads.
