# Help Contract Audit

The `/help` registry in `src/worker.js` documents 26 commands. Live execution was blocked by the audit environment's outbound proxy (`curl: (56) CONNECT tunnel failed, response 403`), so this contract audit is based on repository route analysis plus local tests.

| Help command | Route exists | Executes | JSON | Notes |
|---|---:|---:|---:|---|
| `GET /help` | Yes | Yes | Yes | Returns command registry. |
| `GET /changelog` | Yes | Yes | Yes | Static changelog. |
| `GET /about` | Yes | Yes | Yes | Static app metadata. |
| `GET /lookup` | Yes | Yes | Yes | Fixed skin-tone modifier normalization. |
| `GET /analyze` | Yes | Yes | Yes | Shares parser with lookup. |
| `GET /gestures` | Yes | Yes | Yes | Gesture catalog. |
| `GET /rules` | Yes | Yes | Yes | Static rules. |
| `GET /balance/simulate` | Yes | Yes | Yes | Public max length capped. |
| `GET /duel` | Yes | Yes | Yes | Validates opponent. |
| `GET /simulate` | Yes | Yes | Yes | Same simulation core. |
| `GET /replay` | Yes | Yes | Yes | Uses supplied match id. |
| `GET /train` | Yes | Yes | Yes | Static training. |
| `POST /queue` | Yes | Yes | Yes | Requires valid combo; persists to KV when bound. |
| `GET /arena` | Yes | Yes | Yes | Returns volatile memory warning if no KV. |
| `GET /leaderboard` | Yes | Yes | Yes | Ranked and legacy rows. |
| `GET /battle/:id` | Yes | Yes | Yes | Returns 404 until matching history exists. |
| `GET /butler` | Yes | Yes | Yes | Returns adaptive state and next combo. |
| `POST /telegram/config` | Yes | Conditional | Yes | Requires admin token and KV. |
| `GET /telegram/status` | Yes | Conditional | Yes | Requires admin token. |
| `POST /ai/config` | Yes | Conditional | Yes | Requires admin token and KV. |
| `GET /ai/config` | Yes | Conditional | Yes | Requires admin token and KV. |
| `POST /ai/chronicle` | Yes | Conditional | Yes | Requires AI config; rate limited. |
| `POST /player/create` | Yes | Conditional | Yes | Requires D1 `DB`. |
| `GET /player` | Yes | Conditional | Yes | Requires D1 `DB` and `id`. |
| `POST /jutsu/save` | Yes | Conditional | Yes | Requires D1 `DB`, player id, name, combo. |
| `GET /stats` | Yes | Conditional | Yes | Requires D1 `DB` and `id`. |

## Contract flags

- `GET /battle/:id` is correctly documented but naturally returns 404 until a battle exists in arena history.
- Admin/config endpoints are documented publicly but intentionally require credentials.
- Player/stat/jutsu endpoints are public routes but require D1 binding at runtime.
