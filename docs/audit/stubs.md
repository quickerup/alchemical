# Hidden Stubs and Placeholder Audit

Search terms: `TODO`, `FIXME`, `TEMP`, `temporarily unavailable`, `not implemented`, `stub`, `placeholder`, `coming soon`.

| File | Line | Description | Severity |
|---|---:|---|---|
| `wrangler.toml` | 6 | Placeholder deployment values comment. | P3 cleanup |
| `README.md` | 76 | Placeholder `BASE_URL` example. | P3 cleanup |
| `src/telegram-bot.js` | cast/draw save paths | “My Jutsu save is temporarily unavailable” appears only when D1 save fails after successful lookup. | P2 degraded functionality |
| `src/worker.js` | admin HTML | Placeholder input text for Worker base URL and tokens. | P3 expected UI placeholder |

The critical generic lookup message has been replaced with specific failure reasons.
