# Arena Audit

Routes audited: `POST /queue`, `GET /arena`, `GET /leaderboard`, `GET /battle/:id`, `GET /butler`.

## Flow

1. `POST /queue` validates combo with `createQueueEntry` / parser.
2. Accepted entries are persisted to D1 `matchmaking_queue` when `DB` exists.
3. Entries are pushed into arena state loaded from `ARENA_KV`, `KV_BINDING`, or volatile memory.
4. Optional AI Butler entry is created from `aiComboForButler`.
5. `resolveArena` matches compatible queued entries, simulates battle, updates leaderboard/ranked state, updates Butler, records D1 battle, and prepends arena history.
6. `saveArena` writes KV arena state and persists Butler state to D1 when available.

## Findings

- Queue persistence: KV/memory is the route source of truth; D1 queue rows are write-only from route perspective.
- Battle generation: functional when two compatible queue entries exist or `includeButler` is true.
- Leaderboard updates: `recordLeaderboard` and `recordRankedDuel` run during battle resolution.
- Butler evolution: `updateAiButlerAfterBattle` runs when Butler participates.
- Replay history: `/battle/:id` reads from arena history, not D1 `battles`; old battles can become unreachable if KV history is trimmed/reset.
