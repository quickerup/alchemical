import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_BUTLER_HISTORY_LIMIT,
  FORCE_ADVANTAGE_BONUS,
  FORCE_ADVANTAGE_SCALE,
  buildSpell,
  forceAdvantage,
  getArenaPersistenceMode,
  parseTechnique,
  scoreDuelist,
  updateAiButlerAfterBattle
} from "../src/worker.js";

const seal = combo => encodeURIComponent(`${combo}🙏🏻`);
const parse = combo => {
  const result = parseTechnique(seal(combo));
  assert.equal(result.error, undefined);
  return result.spell;
};

test("arena persistence mode reports volatile memory when ARENA_KV is missing", () => {
  assert.deepEqual(getArenaPersistenceMode({ ARENA_KV: { get() {}, put() {} } }), { mode: "kv", durable: true, warning: null });
  assert.deepEqual(getArenaPersistenceMode({}), {
    mode: "memory",
    durable: false,
    warning: "ARENA_KV is not bound; arena queue, active battles, and history are volatile and may reset when the Worker isolate is evicted."
  });
});

test("force advantage stays symmetric and tied classes have no bonus", () => {
  const kinetic = parse("🤜🏻🤛🏻✊🏻");
  const mystic = parse("🖖🏻🤟🏻🤞🏻");
  const barrier = parse("🤚🏻🖐🏻✋🏻");
  assert.equal(forceAdvantage(kinetic, kinetic), 0);
  assert.equal(forceAdvantage(kinetic, mystic), FORCE_ADVANTAGE_BONUS + Math.round(mystic.power * FORCE_ADVANTAGE_SCALE));
  assert.equal(forceAdvantage(mystic, kinetic), -(FORCE_ADVANTAGE_BONUS + Math.round(mystic.power * FORCE_ADVANTAGE_SCALE)));
  assert.equal(forceAdvantage(mystic, barrier), FORCE_ADVANTAGE_BONUS + Math.round(barrier.power * FORCE_ADVANTAGE_SCALE));
  assert.equal(forceAdvantage(barrier, mystic), -(FORCE_ADVANTAGE_BONUS + Math.round(barrier.power * FORCE_ADVANTAGE_SCALE)));
});

test("representative class triangle has no single class that dominates both other archetypes", () => {
  const archetypes = { Kinetic: parse("🤜🏻🤛🏻✊🏻"), Mystic: parse("🖖🏻🤟🏻🤞🏻"), Barrier: parse("🤚🏻🖐🏻✋🏻") };
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
  const repeated = buildSpell(["🤜🏻", "🤜🏻", "🤜🏻", "🤜🏻", "🤜🏻"]);
  const varied = buildSpell(["🤜🏻", "🤛🏻", "✊🏻", "👊🏻", "🫵🏻"]);
  assert.equal(repeated.modifiers.repetitionPenalty, 16);
  assert.equal(varied.modifiers.repetitionPenalty, 0);
  assert.ok(varied.power > repeated.power, `${varied.power} should beat ${repeated.power}`);
  assert.ok(repeated.risk > varied.risk, `${repeated.risk} should exceed ${varied.risk}`);
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
