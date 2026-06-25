# Persistence Audit

## KV usage

- `BOT_SESSIONS`: Telegram configuration, chat session state, AI config, and rate-limit counters.
- `ARENA_KV` or fallback `KV_BINDING`: persistent arena state under `ARENA_STATE_V1`.

## D1 usage

Tables from migrations:

- `players`: written by `/player/create`, read by `/player`, `/jutsu/save`, `/stats`.
- `jutsu`: written by `/jutsu/save`, read by `/stats`.
- `battles`: written by direct duel persistence and arena battle persistence, read by `/stats`.
- `matchmaking_queue`: written when `/queue` accepts entries; no active read path was found. Severity P2 because queue truth comes from KV arena state, making D1 queue rows audit-only/orphan-prone.
- `ai_butlers`: read by arena load and written by arena save / Butler evolution.

## Findings

| Item | Finding | Severity |
|---|---|---|
| `matchmaking_queue` | Writes accepted queue entries but route reads live queue from KV/memory, not D1. | P2 |
| Arena history | Stored in KV/memory; D1 `battles` also receives records for stats. Dual write is intentional but can diverge if one write fails. | P2 |
| AI Butler migration | `0002_ai_butler_history.sql` adds history fields used by code. | Pass |
| No KV arena binding | Code permits volatile in-memory arena state and logs a production error object. Production should bind `ARENA_KV` or `KV_BINDING`. | P1 if true in production |
