# Lookup Pipeline Audit

Target: `/lookup?combo=👊🖖🙏`.

## Request entry

- Worker fetch handler stores request metadata for response help.
- `/lookup` is admitted by the gameplay command allow-list.
- Query param `combo` is read from `url.searchParams.get("combo")`.

## Parsing and validation

1. `parseTechnique(input)` checks that `combo` exists.
2. It decodes URL encoding and now strips Fitzpatrick skin-tone modifiers.
3. It requires the decoded combo to end with `🙏`.
4. It slices off the finisher and parses the remaining core into known `GESTURES` keys.
5. It requires 1-5 hand signs.
6. It builds stats with `buildSpell(combo)` and applies finisher bonuses with `applyFinisher`.

## Generation

- Gesture decoding: `parseEmojis` greedily matches known gesture keys.
- Stat generation: base ATK/DEF/SPC, same-type synergy, scaling, diversity/complexity/repetition modifiers, ultimate bonuses, power, cost, risk.
- Rank generation: `rank(spell)` maps power thresholds to `C/B/A/S`.
- Technique naming: `describeTechnique(spell)` chooses prefix/core from dominant stat/class.
- Serialization: `/lookup` returns JSON with `status`, `id`, `name`, `technique`, `outcome`, `spell`, `element`, `type`, `damage`, `effect`, `chakraCost`, `rank`, `stats`, and `battleStyle` plus response help metadata.

## Schema comparison

Expected by Telegram:

```json
{
  "name": "string",
  "rank": "string",
  "stats": {
    "atk": "number",
    "def": "number",
    "spc": "number",
    "class": "string",
    "power": "number",
    "cost": "number"
  },
  "outcome": "string optional",
  "battleStyle": "string optional"
}
```

Returned by Worker:

```json
{
  "status": "success",
  "id": "string",
  "name": "string",
  "technique": "string",
  "outcome": "string",
  "spell": "string",
  "element": "string",
  "type": "string",
  "damage": "number",
  "effect": "string",
  "chakraCost": "number",
  "rank": "string",
  "stats": {
    "atk": "number",
    "def": "number",
    "spc": "number",
    "class": "string",
    "power": "number",
    "cost": "number",
    "risk": "number",
    "ultimate": "object|null",
    "modifiers": "object",
    "types": "array"
  },
  "battleStyle": "string"
}
```

## Mismatches

No required Telegram fields are missing from the current Worker success response. The bug was on validation failure: skin-tone variants were rejected before serialization, and Telegram hid the Worker error.
