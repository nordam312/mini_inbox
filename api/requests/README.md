# Request files

Runnable examples for the [REST Client][rc] VS Code extension
(`humao.rest-client`). Open a file and click **Send Request** above any block.

[rc]: https://marketplace.visualstudio.com/items?itemName=humao.rest-client

Start the stack first (`pnpm run setup`, then `pnpm dev`) and run the files in
order. Each file is self-contained: `@baseUrl` and the tenant are defined at the
top, and files that need a conversation create one themselves rather than asking
you to paste an id.

| File | Shows |
| --- | --- |
| `00-health.http` | The only route with no tenant |
| `01-inbound-webhook.http` | Storing a message, idempotent redelivery, one thread per sender |
| `02-conversations.http` | The dashboard's API: list, thread, takeover, operator reply, handback |
| `03-tenant-safety.http` | Cross-tenant reads and writes refused, missing and unknown tenants |
| `04-validation.http` | Rejected input, and whitespace trimmed rather than rejected |

Ids are chained with REST Client's named-request syntax
(`{{opened.response.body.conversationId}}`), so a file works top to bottom
without editing anything.

The tenant ids come from the seed script: `alsalam-motors` and `bright-smile`.

Re-running a file a second time replays the same `externalId` values, so the
webhook correctly reports `"duplicate": true` and stores nothing new. That is
the idempotency working, not a failure. For a clean run, change the
`externalId` values or reset the database:

```bash
docker compose down -v && pnpm run setup
```
