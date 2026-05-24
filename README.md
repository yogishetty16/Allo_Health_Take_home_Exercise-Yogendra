# Inventory Reservation System

A production-style take-home assignment built with Next.js App Router, TypeScript, Prisma, PostgreSQL, TailwindCSS, and shadcn/ui-style components.

The core behavior is race-condition-safe reservation creation: if two requests try to reserve the last available unit at the same time, exactly one request succeeds and the other receives `HTTP 409 Conflict`.

## Stack

- Next.js App Router route handlers and server components
- TypeScript
- Prisma ORM
- PostgreSQL
- TailwindCSS
- shadcn/ui-style local components
- Zod request validation

## Data Model

Products and warehouses are connected through `Inventory`.

`availableUnits = totalUnits - reservedUnits`

Reservations are created as `PENDING`, can become `CONFIRMED`, and can be `RELEASED` when cancelled or expired.

The Prisma schema also includes `IdempotencyRecord` for optional `Idempotency-Key` support on reservation creation.

## Concurrency Strategy

The reservation endpoint does not perform a naive application-side stock check.

Reservation creation runs inside a PostgreSQL transaction and uses a single atomic conditional update:

```sql
UPDATE inventory
SET reserved_units = reserved_units + $quantity
WHERE product_id = $productId
  AND warehouse_id = $warehouseId
  AND (total_units - reserved_units) >= $quantity
RETURNING id;
```

If the update returns no rows, the API returns `409 Conflict`.

This is safe under concurrent requests because PostgreSQL serializes conflicting updates to the same row. When two transactions race for the final unit, one transaction updates `reserved_units` first. The other transaction then rechecks the `WHERE` predicate against the updated row and fails because the available quantity is no longer sufficient.

No in-memory locks, mutexes, timeouts, or Node.js process-local state are used.

## Expiry Strategy

Reservations expire after 10 minutes.

Lazy cleanup is implemented in `releaseExpiredReservations`:

- `GET /api/products` releases expired pending reservations before returning inventory.
- `POST /api/reservations` releases expired reservations for that product and warehouse before attempting the atomic stock update.
- `GET /api/reservations/:id` releases that reservation if it is expired and still pending.
- `POST /api/reservations/:id/confirm` returns `410 Gone` if the reservation expired, and releases the stock in the same transaction.

There is also a reusable `POST /api/cron/expire` route that can be wired to Vercel Cron. Set `CRON_SECRET` to require `Authorization: Bearer <secret>`.

## API

### `GET /api/products`

Returns products with warehouse inventory and available stock.

### `GET /api/warehouses`

Returns all warehouses.

### `POST /api/reservations`

Request:

```json
{
  "productId": "uuid",
  "warehouseId": "uuid",
  "quantity": 1
}
```

Returns:

- `201 Created` with the reservation
- `409 Conflict` when stock is not available
- `400 Bad Request` for validation errors

Optional header:

```http
Idempotency-Key: unique-client-generated-key
```

Retries with the same key and same request body replay the stored result.

### `POST /api/reservations/:id/confirm`

Confirms a pending reservation if it has not expired.

Returns:

- `200 OK`
- `410 Gone` if expired, after releasing stock
- `409 Conflict` if already released

### `POST /api/reservations/:id/release`

Releases a pending reservation early and decrements `reservedUnits`.

## Frontend

The home page shows a product and warehouse inventory table with:

- total units
- reserved units
- available units
- quantity input
- reserve action
- visible `409` handling
- automatic refresh after actions

The reservation checkout page shows:

- reservation details
- live countdown timer
- confirm action
- cancel action
- visible `410` handling
- automatic state refresh after actions

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Copy env values:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

4. Create the database schema:

```bash
npm run db:migrate
```

5. Seed data:

```bash
npm run db:seed
```

6. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Concurrency Check

The seed includes `Concurrency Demo Unit` with exactly one available unit.

Run:

```bash
npm run test:concurrency
```

Expected result: one attempt returns `201`, and one attempt returns `409`.

## Deployment Notes

- Use a managed PostgreSQL database.
- Set `DATABASE_URL` in the deployment environment.
- Run `npm run db:deploy` during deployment.
- Run `prisma generate` during install or build.
- Configure Vercel Cron to call `POST /api/cron/expire` if proactive cleanup is desired.
- Keep lazy expiration enabled because it protects correctness even if cron is delayed.

## Key Files

- `prisma/schema.prisma` - database schema
- `src/lib/reservations.ts` - transactional reservation service
- `src/lib/expiry.ts` - lazy expiration cleanup
- `src/app/api/reservations/route.ts` - reservation creation route
- `src/app/api/reservations/[id]/confirm/route.ts` - confirm route
- `src/app/api/reservations/[id]/release/route.ts` - release route
- `src/components/inventory-dashboard.tsx` - product listing UI
- `src/components/reservation-checkout.tsx` - checkout and countdown UI
