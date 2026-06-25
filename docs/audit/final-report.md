# Final Production Audit Findings

## P0 — Telegram lookup reward loop hides valid failure reasons

- Root cause: Telegram cast/draw paths collapsed every lookup failure into a generic “temporarily unavailable” message.
- Evidence: `handleCastCallback`, `handleDrawCallback`, and lookup preview code previously checked only `ok/name/rank/stats` and rendered a generic fallback.
- Affected files: `src/telegram-bot.js`.
- Recommended fix: completed. Use explicit failure classification for Worker HTTP errors, malformed responses, schema mismatch, and Worker validation errors.
- Estimated effort: completed in this pass.

## P0 — Valid-looking skin-tone hand-sign combos failed lookup parsing

- Root cause: Worker parser matched only base emoji gesture keys and rejected Fitzpatrick skin-tone modifiers as unknown gestures.
- Evidence: README examples include skin-tone encoded hand signs, while `GESTURES` keys are unmodified base emoji.
- Affected files: `src/worker.js`, `src/telegram-bot.js`.
- Recommended fix: completed. Normalize skin-tone modifiers before parsing/sending lookup combos.
- Estimated effort: completed in this pass.

## P1 — Live verification could not be completed from this environment

- Root cause: outbound CONNECT proxy returned 403 for the deployed Worker host.
- Evidence: `curl -sS --retry 3 --retry-delay 2 https://alchemical.lockloke50.workers.dev/help` failed with `curl: (56) CONNECT tunnel failed, response 403`.
- Affected files: audit documents only.
- Recommended fix: rerun `docs/audit/api-verification.md` command set from a network path allowed to reach Cloudflare Workers.
- Estimated effort: 30 minutes.

## P1 — Arena persistence depends on KV binding

- Root cause: if neither `ARENA_KV` nor `KV_BINDING` is bound, arena state is volatile memory.
- Evidence: `getArenaPersistenceMode` returns a production warning/error for missing KV.
- Affected files: `src/worker.js`, `wrangler.toml`.
- Recommended fix: confirm production has `KV_BINDING` or preferably `ARENA_KV` bound.
- Estimated effort: 15 minutes.

## P2 — `matchmaking_queue` D1 rows are written but not read by live queue route

- Root cause: `/queue` persists accepted entries to D1, but `/arena` and `GET /queue` read from KV/memory arena state.
- Evidence: route audit found `persistQueueEntry` writes with no corresponding active read path.
- Affected files: `src/worker.js`, `migrations/0001_mmo_core.sql`.
- Recommended fix: decide whether D1 queue is audit history or source of truth; document it or read pending queue rows during arena load.
- Estimated effort: 1-2 hours.

## P3 — Placeholder text in docs/admin UI

- Root cause: setup examples intentionally contain placeholder URLs/tokens.
- Evidence: README and admin console placeholders.
- Affected files: `README.md`, `src/worker.js`, `wrangler.toml`.
- Recommended fix: no production code change required; keep placeholders out of runtime config.
- Estimated effort: 15 minutes.
