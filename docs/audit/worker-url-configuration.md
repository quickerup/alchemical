# Worker URL Configuration Audit

Search terms: `WORKER_URL`, `BASE_URL`, `API_URL`, `workers.dev`.

## Findings

- No runtime `WORKER_URL` or `API_URL` variable is used by Telegram.
- Telegram internal Worker calls use `new URL(request.url).origin`, meaning they call the same deployment that received `/telegram/webhook`.
- Admin UI lets an operator supply a Worker base URL when setting the Telegram webhook.
- README uses placeholder `BASE_URL="https://your-worker.example.workers.dev"` for curl examples.
- Production deployment supplied by the audit request: `https://alchemical.lockloke50.workers.dev`.

## URL inventory

| Type | Value | Source |
|---|---|---|
| Development URL | local Wrangler/dev origin when running locally | inferred from code; no fixed variable |
| Production URL | `https://alchemical.lockloke50.workers.dev` | audit request |
| Configured Telegram URL | Stored in Telegram webhook, set via `/telegram/config` or admin UI | requires admin token / live Telegram status to confirm |
| Actual runtime URL for internal lookup | `request.url` origin of incoming webhook | `workerUrl(request, path)` |

## Conclusion

If Telegram is currently hitting the production Worker webhook, lookup calls are made to the same production deployment. If Telegram webhook is configured to any older Worker URL, the bot will also call that older deployment for `/lookup`. Confirm with authenticated `GET /telegram/status` from an unrestricted network.
