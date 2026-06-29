import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_BUTLER_HISTORY_LIMIT,
  FORCE_ADVANTAGE_BONUS,
  FORCE_ADVANTAGE_SCALE,
  buildSpell,
  forceAdvantage,
  getArenaPersistenceMode,
  rankForRating,
  rankedLeaderboard,
  recordRankedDuel,
  parseTechnique,
  scoreDuelist,
  updateAiButlerAfterBattle,
  default as worker
} from "../src/worker.js";

const seal = combo => encodeURIComponent(`${combo}🙏`);
const parse = combo => {
  const result = parseTechnique(seal(combo));
  assert.equal(result.error, undefined);
  return result.spell;
};

test("arena persistence mode uses dedicated ARENA_KV, shared KV_BINDING, then volatile memory", () => {
  assert.deepEqual(getArenaPersistenceMode({ ARENA_KV: { get() {}, put() {} } }), { mode: "kv", binding: "ARENA_KV", durable: true, warning: null });
  assert.deepEqual(getArenaPersistenceMode({ KV_BINDING: { get() {}, put() {} } }), {
    mode: "kv",
    binding: "KV_BINDING",
    durable: true,
    warning: "ARENA_KV is not bound; using KV_BINDING for arena state. Create and bind a dedicated ARENA_KV namespace when you need isolated arena storage."
  });
  assert.deepEqual(getArenaPersistenceMode({}), {
    mode: "memory",
    binding: null,
    durable: false,
    warning: "No KV namespace is bound for arena state; arena queue, active battles, and history are volatile and may reset when the Worker isolate is evicted.",
    productionError: "A KV namespace must be bound for production arena state; bind ARENA_KV or KV_BINDING before deploying production traffic."
  });
});

test("force advantage stays symmetric and tied classes have no bonus", () => {
  const kinetic = parse("🤜🤛✊");
  const mystic = parse("🖖🤟🤞");
  const barrier = parse("🤚🖐✋");
  assert.equal(forceAdvantage(kinetic, kinetic), 0);
  assert.equal(forceAdvantage(kinetic, mystic), FORCE_ADVANTAGE_BONUS + Math.round(mystic.power * FORCE_ADVANTAGE_SCALE));
  assert.equal(forceAdvantage(mystic, kinetic), -(FORCE_ADVANTAGE_BONUS + Math.round(mystic.power * FORCE_ADVANTAGE_SCALE)));
  assert.equal(forceAdvantage(mystic, barrier), FORCE_ADVANTAGE_BONUS + Math.round(barrier.power * FORCE_ADVANTAGE_SCALE));
  assert.equal(forceAdvantage(barrier, mystic), -(FORCE_ADVANTAGE_BONUS + Math.round(barrier.power * FORCE_ADVANTAGE_SCALE)));
});

test("representative class triangle has no single class that dominates both other archetypes", () => {
  const archetypes = { Kinetic: parse("🤜🤛✊"), Mystic: parse("🖖🤟🤞"), Barrier: parse("🤚🖐✋") };
  const wins = Object.fromEntries(Object.keys(archetypes).map(name => [name, 0]));
  for (const [leftName, left] of Object.entries(archetypes)) {
    for (const [rightName, right] of Object.entries(archetypes)) {
      if (leftName === rightName) continue;
      const leftScore = scoreDuelist(left, right, 0.5);
      const rightScore = scoreDuelist(right, left, 0.5);
      assert.notEqual(leftScore, rightScore);
      wins[leftScore > rightScore ? leftName : rightName] += 1;
    }
  }
  assert.deepEqual(wins, { Kinetic: 2, Mystic: 2, Barrier: 2 });
});

test("repetition penalty makes face-rolled combos meaningfully weaker than varied combos", () => {
  const repeated = buildSpell(["🤜", "🤜", "🤜", "🤜", "🤜"]);
  const varied = buildSpell(["🤜", "🤛", "✊", "👊", "🫵"]);
  assert.equal(repeated.modifiers.repetitionPenalty, 16);
  assert.equal(varied.modifiers.repetitionPenalty, 0);
  assert.ok(varied.power > repeated.power, `${varied.power} should beat ${repeated.power}`);
  assert.ok(repeated.risk > varied.risk, `${repeated.risk} should exceed ${varied.risk}`);
});

test("specific gesture trees unlock named elemental ultimates", () => {
  const spell = buildSpell(["🖖", "🤟", "🤞", "✌", "☝"]);
  assert.equal(spell.ultimate.name, "Celestial Mystic Seal");
  assert.equal(spell.ultimate.element, "Astral");
  assert.ok(spell.power > 100);
});


test("elemental ultimates unlock from any permutation of the five required gestures", () => {
  const canonical = buildSpell(["🖖", "🤟", "🤞", "✌", "☝"]);
  const permuted = buildSpell(["☝", "✌", "🤞", "🤟", "🖖"]);
  assert.equal(permuted.ultimate.name, canonical.ultimate.name);
  assert.equal(permuted.ultimate.element, canonical.ultimate.element);
});

test("public balance simulator rejects expensive max lengths", async () => {
  const response = await worker.fetch(new Request("https://example.com/balance/simulate?maxLength=5"), {});
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.maxLengthLimit, 3);
});

test("AI Butler keeps enough recent battle history for adaptation metrics", () => {
  let butler = { id: "AI-BUTLER-1", name: "AI Butler", history: [], winRate: 0.5, preferredStyle: "Mystic", adaptationLevel: 0.1 };
  for (let i = 0; i < AI_BUTLER_HISTORY_LIMIT + 5; i += 1) {
    butler = updateAiButlerAfterBattle(butler, {
      battleId: `battle-${i}`,
      winnerId: i % 2 === 0 ? butler.id : "human",
      aiOpponent: { spell: { class: "Barrier" } },
      completedAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`
    });
  }
  assert.equal(butler.history.length, AI_BUTLER_HISTORY_LIMIT);
  assert.equal(butler.history[0].battleId, `battle-${AI_BUTLER_HISTORY_LIMIT + 4}`);
  assert.equal(butler.history.at(-1).battleId, "battle-5");
  assert.equal(butler.preferredStyle, "Barrier");
});

test("gesture catalog gives every outcome symbol a name and names each gesture outcome", async () => {
  const response = await worker.fetch(new Request("https://example.com/gestures"), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outcomeLegend.length, data.outcomeCatalog.length);
  assert.equal(Object.keys(data.outcomeNameMatrix).length, data.outcomeLegend.length);
  for (const symbol of data.outcomeLegend) {
    assert.equal(typeof data.outcomeNameMatrix[symbol], "string");
    assert.ok(data.outcomeNameMatrix[symbol].length > 0);
  }
  for (const [gesture, outcome] of Object.entries(data.outcomes)) {
    assert.equal(typeof outcome.gestureName, "string", `${gesture} should include its gesture name`);
    assert.equal(typeof outcome.outcomeName, "string", `${gesture} should include its outcome name`);
    assert.equal(data.outcomeNameMatrix[outcome.outcome], outcome.outcomeName);
  }
});

test("analyze returns a named outcome matrix for every symbol in the combo", async () => {
  const response = await worker.fetch(new Request(`https://example.com/analyze?combo=${seal("👊🖖")}`), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(typeof data.outcomeName, "string");
  assert.deepEqual(data.outcomeMatrix.map(row => Object.keys(row)), [
    ["gesture", "gestureName", "outcome", "outcomeName"],
    ["gesture", "gestureName", "outcome", "outcomeName"]
  ]);
});


test("lookup accepts skin-tone-modified hand signs and horns gesture", async () => {
  const response = await worker.fetch(new Request(`https://example.com/lookup?combo=${encodeURIComponent("🤘🏻🫵🏻☝🏻🙏🏻")}`), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.technique, "🤘🫵☝🙏");
  assert.equal(data.stats.types.includes("mystic"), true);
});

test("reported draw and seal combos resolve through lookup", async () => {
  for (const combo of ["🤌✋👊🖕🙏", "✌🤌👈🫵🙏"]) {
    const response = await worker.fetch(new Request(`https://example.com/lookup?combo=${encodeURIComponent(combo)}`), {});
    assert.equal(response.status, 200, combo);
    const data = await response.json();
    assert.equal(data.status, "success");
    assert.equal(data.technique, combo);
    assert.equal(typeof data.name, "string");
  }
});

test("telegram status requires admin auth", async () => {
  const response = await worker.fetch(new Request("https://example.com/telegram/status"), { ADMIN_TOKEN: "secret" });
  assert.equal(response.status, 401);
});

test("telegram status diagnoses missing token without exposing secrets", async () => {
  const response = await worker.fetch(new Request("https://example.com/telegram/status", {
    headers: { "X-Admin-Token": "secret" }
  }), { ADMIN_TOKEN: "secret" });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.status, "not_configured");
  assert.equal(data.configured.hasToken, false);
  assert.equal(data.tokenReturned, false);
  assert.equal(data.expectedWebhookUrl, "https://example.com/telegram/webhook");
});

test("ranked ladder applies ELO and rank tiers", () => {
  const arena = { leaderboard: {}, player_rating: {}, player_wins: {}, player_losses: {}, player_rank: {} };
  const ranked = recordRankedDuel(arena, "alice", "bob", "alice");
  assert.equal(ranked.alice.previousRating, 1000);
  assert.equal(ranked.alice.rating, 1016);
  assert.equal(ranked.bob.rating, 984);
  assert.equal(arena.player_wins.alice, 1);
  assert.equal(arena.player_losses.bob, 1);
  assert.equal(rankForRating(1800), "Mythic");
  assert.deepEqual(rankedLeaderboard(arena).map(row => row.playerId), ["alice", "bob"]);
});

test("rank and leaderboard endpoints expose ranked ladder state", async () => {
  const response = await worker.fetch(new Request(`https://example.com/simulate?combo=${seal("👊🖖")}&opponent=${seal("✋🤟")}&playerA=alice&playerB=bob`), {});
  assert.equal(response.status, 200);
  const duel = await response.json();
  assert.equal(typeof duel.ranked.alice.rating, "number");
  assert.equal(typeof duel.ranked.bob.rating, "number");

  const boardResponse = await worker.fetch(new Request("https://example.com/leaderboard"), {});
  assert.equal(boardResponse.status, 200);
  const board = await boardResponse.json();
  assert.deepEqual(board.ranks, ["Bronze", "Silver", "Gold", "Platinum", "Astral", "Mythic"]);
  assert.ok(board.leaderboard.some(row => row.playerId === "alice"));

  const rankResponse = await worker.fetch(new Request("https://example.com/rank?id=alice"), {});
  assert.equal(rankResponse.status, 200);
  const rank = await rankResponse.json();
  assert.equal(rank.rank.playerId, "alice");
  assert.equal(typeof rank.rank.rating, "number");
});

test("telegram config sets webhook with the newly submitted token", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const stored = new Map();
  const env = {
    ADMIN_TOKEN: "secret",
    BOT_SESSIONS: {
      async get() {
        return null;
      },
      async put(key, value) {
        stored.set(key, value);
      }
    }
  };

  try {
    const response = await worker.fetch(new Request("https://example.com/telegram/config", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": "secret" },
      body: JSON.stringify({ token: "123:new-token", webhookSecret: "hook-secret" })
    }), env);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.telegram.org/bot123:new-token/setWebhook");
    assert.equal(calls[0].body.url, "https://example.com/telegram/webhook");
    assert.equal(calls[0].body.secret_token, "hook-secret");
    assert.ok(stored.has("telegram:config"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("telegram webhook records successful interaction outcomes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  const stored = new Map([["telegram:config", JSON.stringify({ token: "123:test", webhookSecret: "hook-secret" })]]);
  const env = {
    BOT_SESSIONS: {
      async get(key, type) {
        const value = stored.get(key) ?? null;
        return type === "json" && value ? JSON.parse(value) : value;
      },
      async put(key, value) {
        stored.set(key, value);
      }
    },
    DB: {
      prepare() {
        return { bind: () => ({ run: async () => ({ success: true }) }) };
      }
    }
  };

  try {
    const response = await worker.fetch(new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hook-secret" },
      body: JSON.stringify({ update_id: 1001, message: { message_id: 7, chat: { id: 42, type: "private" }, from: { id: 9, username: "ninja" }, text: "/start" } })
    }), env);

    assert.equal(response.status, 200);
    const log = JSON.parse(stored.get("telegram:interaction-log"));
    assert.equal(log.length, 1);
    assert.equal(log[0].outcome, "success");
    assert.equal(log[0].ok, true);
    assert.equal(log[0].updateId, 1001);
    assert.equal(log[0].interactionType, "message");
    assert.equal(log[0].chatId, 42);
    assert.equal(log[0].commandOrText, "/start");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("telegram webhook records interaction errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  const stored = new Map([["telegram:config", JSON.stringify({ token: "123:test", webhookSecret: "hook-secret" })]]);
  const env = {
    BOT_SESSIONS: {
      async get(key, type) {
        const value = stored.get(key) ?? null;
        return type === "json" && value ? JSON.parse(value) : value;
      },
      async put(key, value) {
        stored.set(key, value);
      }
    },
    DB: {
      prepare() {
        return { bind: () => ({ run: async () => { throw new Error("database unavailable"); } }) };
      }
    }
  };

  try {
    const response = await worker.fetch(new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hook-secret" },
      body: JSON.stringify({ update_id: 1002, message: { message_id: 8, chat: { id: 43, type: "private" }, from: { id: 10, username: "ronin" }, text: "/start" } })
    }), env);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, false);
    const log = JSON.parse(stored.get("telegram:interaction-log"));
    assert.equal(log.length, 1);
    assert.equal(log[0].outcome, "error");
    assert.equal(log[0].ok, false);
    assert.equal(log[0].updateId, 1002);
    assert.match(log[0].error, /Player could not be created|database unavailable/);
    assert.equal(log[0].notificationError, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
