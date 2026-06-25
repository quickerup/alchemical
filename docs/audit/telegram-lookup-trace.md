# Telegram Lookup Failure Trace

## Execution path

1. Telegram callback `cast:seal` enters `handleCastCallback`.
2. The bot builds `sealed = combo.join("") + "🙏"`.
3. It calls the same Worker origin as the webhook request with `GET /lookup?combo=<encoded sealed combo>`.
4. `callWorkerJson` parses the Worker response as JSON and returns `{ ok, status, data }`.
5. The old cast path treated lookup as successful only when `lookup.ok && technique.name && technique.rank && technique.stats`.
6. On failure, the old rendered Telegram message was the generic fallback: `Technique lookup is temporarily unavailable`.

## Request payload

For the documented combo, Telegram sends:

```http
GET /lookup?combo=%F0%9F%91%8A%F0%9F%96%96%F0%9F%99%8F
Accept: application/json
```

When a user pasted skin-tone variants from older README examples, the effective request was:

```http
GET /lookup?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB
```

## Response payload

Expected successful Worker payload:

```json
{
  "status": "success",
  "id": "JUTSU-...",
  "name": "...",
  "technique": "👊🖖🙏",
  "outcome": "...",
  "rank": "C|B|A|S",
  "stats": { "atk": 0, "def": 0, "spc": 0, "class": "Kinetic|Barrier|Mystic", "power": 0, "cost": 0, "risk": 0 }
}
```

Observed by code path for unsupported skin-tone input before this repair:

```json
{
  "error": "Unknown gesture detected"
}
```

## Failing condition

The fallback message was shown whenever any of these were true:

- Worker HTTP status was non-2xx.
- Worker JSON was malformed or non-object.
- Worker response did not include `name`, `rank`, or `stats`.

## Root cause

The Worker gesture parser only recognized base hand-sign emoji keys from `GESTURES`. Older public examples and some keyboards can include Fitzpatrick skin-tone modifiers. Those modifiers made otherwise valid combos fail parser matching as `Unknown gesture detected`, and the Telegram cast path hid that precise reason behind `Technique lookup is temporarily unavailable`.

## Repair

- Worker lookup parsing now strips emoji skin-tone modifiers before gesture parsing.
- Telegram combo normalization now strips skin-tone modifiers before saving/sending lookup previews.
- Telegram lookup rendering now reports the exact failure class: invalid combo, Worker HTTP failure, malformed response, or schema mismatch.
