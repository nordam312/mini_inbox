# Mini Inbox

A miniature of Kasbly's core loop: a customer message arrives by webhook, it is
stored against a conversation, an AI agent replies using that tenant's own
system prompt and knowledge base, and a human operator can watch the thread in a
dashboard and take over.

- **api** — NestJS, Prisma, PostgreSQL
- **web** — Next.js (App Router), TypeScript
- **pnpm workspace**, Postgres via Docker Compose

---

## Running it

```bash
pnpm run setup   # writes .env files, starts Postgres, installs, migrates, seeds
pnpm dev         # api on :3001, web on :3000
```

`run` is not optional on the first one: `pnpm setup` is a built-in pnpm command
that configures pnpm itself, and built-ins take precedence over scripts.

Then open <http://localhost:3000> and send a message:

```bash
curl -X POST http://localhost:3001/webhook/alsalam-motors/message \
  -H 'content-type: application/json' \
  -d '{"externalId":"wa_1","from":"+966500000001","text":"Do you have a Camry?"}'
```

Refresh the dashboard and the thread is there with an AI reply.

`pnpm run setup` runs `docker compose up -d --wait`, which blocks until Postgres
passes its healthcheck: migrations run immediately afterwards, and a container
that has merely started is not yet accepting connections.

**On Linux**, if your user is not in the `docker` group, run that one line with
`sudo` first and then `pnpm run setup`:

```bash
sudo docker compose up -d --wait
```

### Seeded tenants

| Tenant id | Persona | Knowledge base |
| --- | --- | --- |
| `alsalam-motors` | Used car dealership in Riyadh, replies in the customer's language | Stock, prices, financing, test drives |
| `bright-smile` | Dental clinic in Dubai, never gives clinical advice | Hours, prices, insurance, emergencies |

Send the same question to both and the answers differ, because the persona and
knowledge base are data, not code.

Switch tenants in the dashboard with the box in the top left, or by URL:
`http://localhost:3000/?tenant=bright-smile`.

---

## The API

There is no authentication, per the brief. The tenant is faked with a request
header, except on the webhook where it is in the path.

| Method | Path | Tenant from | Notes |
| --- | --- | --- | --- |
| `POST` | `/webhook/:tenantId/message` | path | `{ externalId, from, text }`, returns 202 |
| `GET` | `/conversations` | `x-tenant-id` | Newest first, capped at 50 |
| `GET` | `/conversations/:id` | `x-tenant-id` | Last 200 messages |
| `POST` | `/conversations/:id/takeover` | `x-tenant-id` | Disables the AI |
| `POST` | `/conversations/:id/handback` | `x-tenant-id` | Re-enables it |
| `POST` | `/conversations/:id/reply` | `x-tenant-id` | `{ text }`, operator message |
| `GET` | `/health` | — | The only route with no tenant |

`api/requests/*.http` has runnable examples for the REST Client extension.

Handback is not in the brief. Takeover on its own is one-way, which leaves every
handled thread manual forever, so the pair is what an operator actually needs.

---

## Tenant safety

The worst bug this product can have, so it is worth saying exactly where the
prevention lives.

**Every row carries `tenantId`.** Customer, Conversation, Message and
KnowledgeEntry all have the column, so every query scopes with one `WHERE`
rather than by walking a relation up to a parent. Uniqueness that could collide
across tenants is scoped too: `(tenantId, handle)` for customers,
`(tenantId, externalId)` for messages.

**One guard resolves the tenant.** `TenantGuard` is registered globally, reads
the tenant from the `:tenantId` path parameter or the `x-tenant-id` header, and
confirms it exists in the database before any handler runs. Routes opt *out*
with `@PublicRoute()` — only `/health` does. Registering it globally rather than
per-controller means a forgotten decorator is a 401, not an unscoped endpoint.

**Controllers never read a tenant id.** The webhook's `:tenantId` exists for the
guard; the handler cannot use an unverified value because it never sees one.

**Repositories take no tenant argument.** `ConversationsService` reads the
tenant from a request-scoped `TenantContext`. A caller cannot pass the wrong
tenant because it cannot pass one at all.

**Ownership is part of the write.** `appendMessage` runs the tenant-scoped
conversation update *first* and requires it to match a row before inserting the
message. Ownership is enforced by the write itself, not by each caller
remembering to check.

**Another tenant's data is 404, never 403** — on reads and writes alike, so the
API never confirms that an id exists but belongs to someone else. Missing and
unknown tenants share one 401 message for the same reason.

Verified by hand against the running database: the same phone number under two
tenants gets two separate conversations, cross-tenant reads, takeovers, and
replies all 404, and no row exists whose `tenantId` disagrees with its parent's.

---

## When things go wrong

The happy path is the boring one. These are decisions, not accidents.

**The provider redelivers.** Channel providers retry when your response is slow
or lost. Inbound messages are idempotent on `(tenantId, externalId)`: a
redelivery returns the original message id, stores nothing, and does not make
the AI answer the same question twice.

**Two deliveries race.** If the same message arrives twice at once, the loser of
the unique-constraint race re-reads and reports the winner's id. If two
*different* messages from one brand-new customer race to create the customer or
conversation row, the loser retries once against rows that now exist. Both were
tested with concurrent requests.

**The AI provider fails.** The customer's message is committed before the model
is called, so an outage costs the reply and never the question. The thread is
left with the customer's message last, which is exactly what an operator needs
to see. No apology is stored — a fake reply from an AI that never read the
question is worse than silence, and it hides the failure.

**The reply must not fail the webhook.** `replyIfEnabled` never throws. If it
did, the webhook would return 500 and the provider would redeliver a message we
already stored.

**Configuration is wrong.** An unknown `LLM_PROVIDER`, or `anthropic` with no
API key, throws at boot. The app refuses to start rather than failing on the
first customer message that matters.

**Input is messy.** DTOs are validated and length-capped, unknown properties are
rejected, and values are trimmed so a padded `from` does not become a second
customer.

**The API is down.** The dashboard renders a panel naming the likely cause
instead of a 500. Failed takeovers, handbacks and replies redirect back with an
error code — a code, not a message, so a crafted URL cannot put arbitrary text
on the page.

---

## Tests

```bash
pnpm test
```

They need the database from `pnpm run setup` to be running, for the reason below.

Four tests, on the parts most likely to be wrong and most expensive to get
wrong:

1. A redelivered message is stored once.
2. One sender keeps one thread, and the same phone number under a different
   tenant gets a separate one.
3. A tenant cannot read another tenant's conversation, take it over, or write to
   it - and no message leaks onto it.
4. After takeover the AI stays silent, handing back does not answer the message
   already waiting, and the AI resumes on the next inbound message.

They run against the real database rather than a mocked Prisma, because what is
worth testing here is made of unique constraints and `WHERE` clauses; a mock
would assert that the code calls the functions it calls. Test tenants are
prefixed `test-` and deleted afterwards.

Checked by sabotage: removing the tenant filter from one read makes test 3 fail,
which is the only evidence that a passing test is worth anything.

---

## The LLM

The model call sits behind a small interface, `LlmProvider`, with two
implementations selected by `LLM_PROVIDER`:

- `stub` (default) — a canned reply. The whole flow runs with no API key and no
  spend, and the reply is visibly a stub so it is never mistaken for a real one.
- `anthropic` — set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in
  `api/.env`.

Only `anthropic.llm.ts` imports the SDK. Prompt assembly — persona plus
knowledge base plus the last 20 turns — is domain logic and lives in
`AutoReplyService`, so a second provider would never reimplement it. Retries and
timeout are configured on the SDK client rather than hand-written, and the
retry budget is one, because the call runs inside the webhook request.

There is no third implementation. Adding Gemini would be one file and one
`case`; building it before it is needed would be an abstraction for a case that
does not exist.

---

## What I deliberately cut

- **Auth** — faked with a header, as instructed.
- **Real channel integrations** — the webhook stands in for WhatsApp.
- **Live updates** — a refresh button, as the brief allows. No websockets, no
  polling.
- **A queue.** The model call happens inline in the webhook request. Correct at
  this size, wrong at volume — see below.
- **A repository layer.** All tenant-owned queries live in one service. A second
  layer of indirection would buy nothing at seven endpoints, and one file to
  audit for scoping is worth more than a tidy diagram.
- **Docker images for the apps.** The brief asks for Compose for Postgres; a
  full stack image is unrequested scope.
- **Pagination, search, message delivery status, per-tenant rate limits,
  structured logging, i18n in the dashboard.**
- **A real test suite** — a handful on the riskiest logic, as instructed.

## With another week

- **Move the AI reply onto a queue** (BullMQ), so the webhook returns as soon as
  the message is stored, with retries and a dead-letter queue for replies that
  never succeed.
- **Retrieve knowledge instead of pasting it.** The whole knowledge base goes
  into every prompt today. That stops working the moment a tenant has a hundred
  entries; it wants embeddings and top-k retrieval.
- **Cursor pagination and search** in the conversation list, plus unread and
  needs-attention filters — a 50-row cap is a demo, not an inbox.
- **Cache the tenant lookup.** The guard hits the database on every request.
- **Structured logging** with tenant, conversation and request ids, so a single
  customer complaint is traceable.
- **Outbound delivery.** Replies are stored but never sent anywhere; a real
  channel adapter needs delivery status and failure handling.
- **Server-sent events** so operators stop pressing refresh.
- **More tests**, particularly around the concurrency paths, with a throwaway
  database per run.

## Where this breaks at 10,000 messages a day

10,000 a day averages about seven a minute, which is nothing. The problems are
not throughput, they are shape:

1. **The inline model call is the first thing to break.** Every webhook request
   is held open for the length of a model call. Traffic is bursty, so a promotion
   or a broadcast means many concurrent requests each occupying a connection for
   seconds. The provider gives up, redelivers, and the idempotency check saves
   correctness while the queue of open requests grows. This is the change I would
   make first, and it is why the retry budget is one rather than two.
2. **The connection pool is next.** Each inbound message runs an idempotency
   read, a four-statement transaction, and then the reply write. Concurrency is
   bounded by the pool long before Postgres notices the load.
3. **The knowledge base in every prompt** makes token cost grow with the tenant's
   documentation rather than with the conversation, and latency with it.
4. **The dashboard stops being usable** well before the database does. Fifty
   conversations with no pagination, no search and no unread state is fine for a
   demo and useless for an operator with a real queue.
5. **`Message` grows by ~3.6M rows a year.** The indexes are right for the
   queries, but conversation reads eventually want archiving or partitioning.
6. **Request-scoped providers** mean a new service instance per request. Cheap,
   but it is a cost that only appears under load.

What does *not* break: tenant scoping (one `WHERE` on an indexed column),
idempotency (a unique index, not application logic), and thread ordering
(`lastMessageAt` is denormalised, so the list never touches `Message`).

---

## Notes on the stack

- **Prisma 7** keeps the connection URL in `prisma.config.ts`, not the schema,
  and does not auto-load `.env` — hence the explicit dotenv import. The client
  is built with the `pg` driver adapter.
- **TypeScript is pinned to 6.x.** The Nest CLI needs the programmatic compiler
  API that TypeScript 7.0 does not ship.
- **`pnpm run setup` writes the `.env` files before installing**, because the api's
  postinstall runs `prisma generate`, which refuses to load its config without
  `DATABASE_URL`. A bare `pnpm install` on a fresh clone fails for that reason.
- **Workspace filters are paths** (`--filter ./api`), not names. A filter that
  matches no package prints a warning and exits 0, which silently does nothing.

## Environment

`api/.env` and `web/.env` are created from the `.env.example` files by
`pnpm run setup`. Both are gitignored; no key is ever committed.

| Variable | Where | Default |
| --- | --- | --- |
| `DATABASE_URL` | api | matches docker-compose |
| `PORT` | api | 3001 |
| `LLM_PROVIDER` | api | `stub` |
| `ANTHROPIC_API_KEY` | api | empty |
| `ANTHROPIC_MODEL` | api | `claude-sonnet-5` |
| `API_URL` | web | `http://localhost:3001` |
| `DEFAULT_TENANT_ID` | web | `alsalam-motors` |
