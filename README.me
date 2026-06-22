# Alchemical / Emoji Jutsu Worker

Alchemical is a Cloudflare Worker for deterministic emoji-combo duels, persistent arena matchmaking, player profiles, Telegram bot integration, and optional Cloudflare AI battle chronicles.

Players create a technique by combining 1-5 supported hand-sign emoji and sealing the combo with `🙏🏻`. The Worker turns sealed combos into repeatable jutsu stats, names, classes, outcomes, duel results, and arena history.

## Features

- Deterministic emoji jutsu lookup and analysis.
- Rock-paper-scissors-style force triangle: Kinetic, Barrier, and Mystic.
- Replayable duel and simulation endpoints.
- Persistent arena queue, battle history, leaderboard, and AI Butler state through KV.
- D1-backed player profiles and saved signature jutsu.
- Telegram bot webhook and runtime configuration endpoint.
- Cloudflare AI chronicle generation for stylized battle narration.
- Public help, rules, changelog, training, gesture, and balance simulation endpoints.

## Requirements

- Node.js 20+ recommended for local checks and tests.
- npm.
- Cloudflare Wrangler.
- Cloudflare account resources configured in `wrangler.toml`:
  - D1 database binding: `DB`
  - KV namespace bindings: `KV_BINDING`, `BOT_SESSIONS`, and `ARENA_KV`

## Getting Started

Install dependencies:

```sh
npm install
```

Run syntax checks and tests:

```sh
npm run check
```

Run only the test suite:

```sh
npm test
```

Deploy with Wrangler:

```sh
npm run deploy
```

## Local Development

The Worker entrypoint is `src/worker.js`, and Telegram-specific webhook/configuration logic lives in `src/telegram-bot.js`.

Use Wrangler for local development when you need Cloudflare Worker runtime APIs and bindings:

```sh
npx wrangler dev
```

Set secrets before using protected admin configuration endpoints:

```sh
wrangler secret put ADMIN_TOKEN
wrangler secret put CONFIG_ADMIN_TOKEN
```

## Common API Endpoints

Set a base URL first:

```sh
BASE_URL="https://your-worker.example.workers.dev"
```

Inspect commands:

```sh
curl "$BASE_URL/help"
```

Read combat rules:

```sh
curl "$BASE_URL/rules"
```

List gestures:

```sh
curl "$BASE_URL/gestures"
```

Look up a sealed technique:

```sh
curl "$BASE_URL/lookup?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB"
```

Analyze a sealed technique:

```sh
curl "$BASE_URL/analyze?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB"
```

Run a deterministic duel:

```sh
curl "$BASE_URL/duel?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB&opponent=%E2%9C%8B%F0%9F%8F%BB%F0%9F%A4%9F%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB"
```

Queue an arena battle:

```sh
curl -X POST "$BASE_URL/queue" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"shinobi","combo":"👊🏻🖖🏻🙏🏻","includeButler":true}'
```

View arena state:

```sh
curl "$BASE_URL/arena"
```

## Admin Configuration

Protected endpoints accept the configured admin token as either `X-Admin-Token` or a bearer token.

Configure Telegram:

```sh
curl -X POST "$BASE_URL/telegram/config" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"token":"123456:ABC...","webhookSecret":"secret-value"}'
```

Configure Cloudflare AI chronicles:

```sh
curl -X POST "$BASE_URL/ai/config" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"token":"CF_API_TOKEN","accountId":"CF_ACCOUNT_ID","model":"@cf/meta/llama-3.1-8b-instruct"}'
```

Inspect AI configuration without returning the stored token:

```sh
curl "$BASE_URL/ai/config" -H "X-Admin-Token: $ADMIN_TOKEN"
```

## Project Structure

```text
src/worker.js          Main Cloudflare Worker and game API logic
src/telegram-bot.js    Telegram webhook, callbacks, and bot configuration
test/worker.test.js    Node test coverage for combat and arena behavior
migrations/            D1 schema migrations
wrangler.toml          Cloudflare Worker, D1, and KV binding configuration
CHANGELOG.md           Public product/API change log
```

## Notes

- Every technique must end with `🙏🏻`.
- URL-encode emoji combos when using shell commands.
- Duel simulations are deterministic: the same combos and match ID reproduce the same result.
- `ARENA_KV` is required for durable production arena state; memory fallback is development-only and volatile.
