# Change Log

All notable Emoji Jutsu worker changes are documented here.

## [1.2.0] - 2026-06-25

### Added

- Added CORS OPTIONS preflight support for API clients.
- Added `GET /changelog` and `GET /leaderboard` route handling.
- Added public rate limiting to `GET /balance/simulate`.

### Improved

- Improved Telegram bot gesture caching, lookup preview pruning, cancel handling, typing indicators, and richer arena/profile/jutsu displays.
- Improved AI Butler combo selection with adaptation and recent-loss awareness.

## [1.1.0] - 2026-06-22

### Added

- Added `GET /changelog` so players and operators can inspect recent feature updates as JSON.
- Linked the change log from `/help` and the admin console system shortcuts for easier discovery.

### Documented

- Documented the initial operational features already available in the worker, including the admin console, Telegram setup, Cloudflare AI chronicle generation, arena matchmaking, player profiles, signature jutsu, deterministic duels, and replay helpers.

## [1.0.0] - 2026-06-01

### Added

- Launched deterministic emoji technique lookup, analysis, duel simulation, replay, training, rules, and gesture catalog endpoints.
- Added persistent arena queue, battle history, leaderboard, adaptive AI Butler, D1 player profiles, and signature jutsu storage.
- Added Telegram bot webhook handling plus configurable Cloudflare AI battle chronicles.
