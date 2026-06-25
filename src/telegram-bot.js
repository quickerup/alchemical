const TELEGRAM_API = "https://api.telegram.org";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const GESTURE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_PENDING_LOOKUPS = 8;
const FINISHER = "🙏";
const EMOJI_SKIN_TONE_MODIFIER_PATTERN = /[\u{1F3FB}-\u{1F3FF}]/gu;
const GESTURE_CACHE = {
  values: null,
  loadedAt: 0
};
const TELEGRAM_CONFIG_KEY = "telegram:config";
const DEFAULT_TRANSMUTATION_DELETE_DELAY_MS = 2500;
const DEFAULT_CAST_GESTURES = [
  "💪", "👏", "👍", "👎", "🫶",
  "🙌", "👐", "🤲", "🤜", "🤛",
  "✊", "👊", "🫸", "🫷", "🤚",
  "🖐", "✋", "🖖", "🤟", "🤞",
  "✌", "🤌", "🤘", "🫳", "🫴", "🫲",
  "🫱", "👋", "🫰", "🤙", "🤏",
  "👌", "🫵", "👉", "👈", "☝",
  "👆", "👇", "🖕", "✍", "🤳"
];
const HAND_SIGN_PATTERN = new RegExp(`^(?:${DEFAULT_CAST_GESTURES.map(escapeRegExp).join("|")}){1,5}(?:${escapeRegExp(FINISHER)})?$`, "u");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function shortId(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmojiModifiers(value) {
  return String(value || "").replace(EMOJI_SKIN_TONE_MODIFIER_PATTERN, "");
}

function normalizeSealedCombo(input) {
  const combo = normalizeEmojiModifiers(input).trim();
  return combo.endsWith(FINISHER) ? combo : `${combo}${FINISHER}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function text(message, status = 200) {
  return new Response(message, { status });
}

async function getStoredTelegramConfig(env) {
  if (!env?.BOT_SESSIONS) return {};
  return (await env.BOT_SESSIONS.get(TELEGRAM_CONFIG_KEY, "json")) || {};
}

async function getBotConfig(env) {
  const stored = await getStoredTelegramConfig(env);
  return {
    token: stored.token || env?.TELEGRAM_BOT_TOKEN || "",
    webhookSecret: stored.webhookSecret || env?.TELEGRAM_WEBHOOK_SECRET || "",
    gestureStickers: stored.gestureStickers || {},
    transmutationDeleteDelayMs: Number(stored.transmutationDeleteDelayMs || env?.TELEGRAM_TRANSMUTATION_DELETE_DELAY_MS || DEFAULT_TRANSMUTATION_DELETE_DELAY_MS)
  };
}

async function requireBotEnv(env) {
  const config = await getBotConfig(env);
  if (!config.token) return "Missing Telegram bot token. Set it with POST /telegram/config.";
  if (!config.webhookSecret) return "Missing Telegram webhook secret. Set it with POST /telegram/config.";
  if (!env?.BOT_SESSIONS) return "Missing BOT_SESSIONS KV binding";
  return null;
}

function constantTimeStringEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < maxLength; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }

  return diff === 0;
}

async function verifyTelegramSecret(request, env) {
  const config = await getBotConfig(env);
  return constantTimeStringEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), config.webhookSecret);
}

async function telegram(env, method, payload) {
  const config = await getBotConfig(env);
  const response = await fetch(`${TELEGRAM_API}/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram ${method} failed: ${detail}`);
  }

  return response.json();
}

async function telegramStatusCall(env, method, payload = {}) {
  try {
    const data = await telegram(env, method, payload);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function redactBotUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: user.id,
    is_bot: user.is_bot,
    first_name: user.first_name,
    username: user.username,
    can_join_groups: user.can_join_groups,
    can_read_all_group_messages: user.can_read_all_group_messages,
    supports_inline_queries: user.supports_inline_queries
  };
}

function telegramDate(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stickerFileIdForGesture(config, gesture) {
  return config.gestureStickers?.[gesture] || config.gestureStickers?.[encodeURIComponent(gesture)] || "";
}

function splitSealedCombo(combo, gestures) {
  const signs = [];
  let remaining = normalizeSealedCombo(combo);

  while (remaining && remaining !== FINISHER) {
    const gesture = gestures.find(candidate => remaining.startsWith(candidate));
    if (!gesture) return [];
    signs.push(gesture);
    remaining = remaining.slice(gesture.length);
  }

  return remaining === FINISHER ? [...signs, FINISHER] : [];
}

async function deleteTelegramMessages(env, chatId, messageIds) {
  await Promise.all(messageIds.map(async messageId => {
    try {
      await telegram(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
    } catch (error) {
      console.warn(`Telegram deleteMessage failed for ${messageId}: ${error.message}`);
    }
  }));
}

async function sendTransmutationSequence(request, env, chatId, combo) {
  const config = await getBotConfig(env);
  const gestures = await loadGestures(request);
  const signs = splitSealedCombo(combo, gestures);
  const sentMessageIds = [];

  for (const sign of signs) {
    const sticker = stickerFileIdForGesture(config, sign);
    if (!sticker) continue;
    const sent = await telegram(env, "sendSticker", { chat_id: chatId, sticker });
    if (sent.result?.message_id) sentMessageIds.push(sent.result.message_id);
  }

  if (!sentMessageIds.length) return;

  const delayMs = Math.max(0, Number(config.transmutationDeleteDelayMs) || DEFAULT_TRANSMUTATION_DELETE_DELAY_MS);
  await sleep(delayMs);
  await deleteTelegramMessages(env, chatId, sentMessageIds);
}

function workerUrl(request, path) {
  const url = new URL(request.url);
  return `${url.origin}${path}`;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("Content-Type") || "";
  const textBody = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return textBody ? JSON.parse(textBody) : {};
    } catch {
      return { error: "Worker returned malformed JSON", detail: textBody };
    }
  }

  try {
    return textBody ? JSON.parse(textBody) : {};
  } catch {
    return { error: textBody || `HTTP ${response.status} ${response.statusText}` };
  }
}

async function sendTypingIndicator(env, chatId) {
  try {
    await telegram(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  } catch (error) {
    console.warn(`Telegram sendChatAction failed: ${error.message}`);
  }
}

async function callWorkerJson(request, path, init = {}) {
  const response = await fetch(workerUrl(request, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = await parseResponseBody(response);
  return { ok: response.ok, status: response.status, data };
}

async function kvGet(env, key, fallback = null) {
  const value = await env.BOT_SESSIONS.get(key, "json");
  return value ?? fallback;
}

async function kvPut(env, key, value) {
  await env.BOT_SESSIONS.put(key, JSON.stringify(value), { expirationTtl: SESSION_TTL_SECONDS });
}

async function getSession(env, chatId) {
  return kvGet(env, `chat:${chatId}`, {});
}

async function saveSession(env, chatId, session) {
  await kvPut(env, `chat:${chatId}`, session);
}

const STATIC_BUTTONS = {
  cast: "🥷 Cast",
  duel: "⚔️ Duel",
  queue: "📥 Queue",
  arena: "🏟️ Arena",
  rankings: "🏆 Rankings",
  butler: "🤖 Butler",
  myjutsu: "📜 My Jutsu",
  profile: "👤 Profile",
  draw: "🎴 Draw",
  help: "❓ Help",
  api: "🧭 API"
};

function commandList(playerId) {
  return [
    "🥷 Welcome to Emoji Jutsu.",
    playerId ? `Player ID: ${playerId}` : null,
    "",
    "Use the emoji buttons at the bottom of the screen:",
    `${STATIC_BUTTONS.cast} — build a technique with sign buttons, seal with ${FINISHER}`,
    `${STATIC_BUTTONS.duel} — duel a saved rival or paste a combo`,
    `${STATIC_BUTTONS.queue} — submit your last sealed technique to the arena`,
    `${STATIC_BUTTONS.arena} — leaderboard and queue`,
    `${STATIC_BUTTONS.rankings} — ELO ladder and rank tier`,
    `${STATIC_BUTTONS.butler} — inspect the AI Butler`,
    `${STATIC_BUTTONS.myjutsu} — saved signature techniques`,
    `${STATIC_BUTTONS.profile} — your stats`,
    `${STATIC_BUTTONS.draw} — draw 7 signs and seal a 1-5 sign technique`,
    `${STATIC_BUTTONS.api} — browse every public API feature from Telegram`
  ].filter(Boolean).join("\n");
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: STATIC_BUTTONS.cast, callback_data: "nav:cast" }, { text: STATIC_BUTTONS.duel, callback_data: "nav:duel" }],
      [{ text: STATIC_BUTTONS.queue, callback_data: "nav:queue" }, { text: STATIC_BUTTONS.arena, callback_data: "nav:arena" }],
      [{ text: STATIC_BUTTONS.rankings, callback_data: "nav:rankings" }],
      [{ text: STATIC_BUTTONS.myjutsu, callback_data: "nav:myjutsu" }, { text: STATIC_BUTTONS.profile, callback_data: "nav:profile" }],
      [{ text: STATIC_BUTTONS.draw, callback_data: "nav:draw" }, { text: STATIC_BUTTONS.butler, callback_data: "nav:butler" }],
      [{ text: STATIC_BUTTONS.api, callback_data: "nav:api" }, { text: STATIC_BUTTONS.help, callback_data: "nav:help" }]
    ]
  };
}

function withMainMenu(payload) {
  return { ...payload, reply_markup: mainMenuKeyboard() };
}

function screenKeyboard(rows = []) {
  return {
    inline_keyboard: [
      ...rows,
      [{ text: "🏠 Main Menu", callback_data: "nav:home" }]
    ]
  };
}

async function sendOrEdit(env, chatId, text, replyMarkup, editMessageId = null) {
  const payload = { chat_id: chatId, text, reply_markup: replyMarkup };
  if (editMessageId) {
    return telegram(env, "editMessageText", { ...payload, message_id: editMessageId });
  }
  return telegram(env, "sendMessage", payload);
}

async function showHome(env, chatId, session, editMessageId = null) {
  const text = [
    "🥷 Emoji Jutsu command room",
    session?.playerId ? `Player ID: ${session.playerId}` : null,
    session?.lastCombo ? `Last sealed: ${session.lastCombo}` : "No sealed technique yet.",
    "",
    "Tap a button below. Cast freely, paste a combo, or use Draw Mode for a 7-card hand.",
    "Draw Mode deals 7 signs, lets you pick 1-5, verifies the lookup, saves valid jutsu, and keeps Queue/Duel synced.",
    `Use ${STATIC_BUTTONS.api} for rules, gestures, changelog, balance simulation, battle replay, and raw API-style lookups.`
  ].filter(Boolean).join("\n");
  return sendOrEdit(env, chatId, text, mainMenuKeyboard(), editMessageId);
}

function createdAt() {
  return Date.now();
}

async function createTelegramPlayer(env, actor) {
  if (!env?.DB) throw new Error("D1 database binding DB is not configured");

  const baseName = (actor.username || actor.first_name || `telegram-${actor.id}`).trim();
  const usernames = [baseName, `${baseName}-${actor.id}`];
  let lastError = null;

  for (const username of usernames) {
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(`
INSERT INTO players (id, username, created_at)
VALUES (?, ?, ?)
`).bind(id, username, createdAt()).run();
      return { playerId: id, username };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Player could not be created: ${lastError?.message || "unknown database error"}`);
}

async function ensurePlayer(request, env, chat, from = null) {
  const session = await getSession(env, chat.id);
  if (session.playerId) return session;

  const created = await createTelegramPlayer(env, from || chat);
  const next = { ...session, playerId: created.playerId, username: created.username };
  await saveSession(env, chat.id, next);
  return next;
}

async function loadGestures(request) {
  if (GESTURE_CACHE.values && Date.now() - GESTURE_CACHE.loadedAt < GESTURE_CACHE_TTL_MS) return GESTURE_CACHE.values;

  try {
    const response = await fetch(workerUrl(request, "/gestures"));
    const data = await parseResponseBody(response);
    const gestures = Object.keys(data.gestures || {});
    if (response.ok && gestures.length) {
      GESTURE_CACHE.values = gestures;
      GESTURE_CACHE.loadedAt = Date.now();
      return GESTURE_CACHE.values;
    }
    console.warn("Falling back to default Telegram cast gestures", data.error || response.status);
  } catch (error) {
    console.warn("Falling back to default Telegram cast gestures", error.message);
  }

  GESTURE_CACHE.values = DEFAULT_CAST_GESTURES;
  GESTURE_CACHE.loadedAt = Date.now();
  return GESTURE_CACHE.values;
}

function castKeyboard(gestures, combo = []) {
  const rows = gestures.reduce((acc, gesture, index) => {
    if (index % 5 === 0) acc.push([]);
    acc[acc.length - 1].push({ text: gesture, callback_data: `cast:add:${gesture}` });
    return acc;
  }, []);
  rows.push([
    { text: FINISHER, callback_data: "cast:seal" },
    { text: "⌫", callback_data: "cast:back" },
    { text: "Reset", callback_data: "cast:reset" }
  ]);
  rows.push([{ text: "🏠 Main Menu", callback_data: "nav:home" }]);
  return { inline_keyboard: rows };
}

async function showCast(request, env, chatId, editMessageId) {
  const session = await getSession(env, chatId);
  const gestures = await loadGestures(request);
  const combo = session.castCombo || [];
  const payload = {
    chat_id: chatId,
    text: `Build your technique (1-5 signs), then seal with ${FINISHER}.\nCurrent: ${combo.join("") || "—"}\nSigns: ${combo.length}/5`,
    reply_markup: castKeyboard(gestures, combo)
  };

  if (editMessageId) {
    return telegram(env, "editMessageText", { ...payload, message_id: editMessageId });
  }
  return telegram(env, "sendMessage", payload);
}


function splitMatrixRows(items, rowSize = 4) {
  return items.reduce((rows, item, index) => {
    if (index % rowSize === 0) rows.push([]);
    rows[rows.length - 1].push(item);
    return rows;
  }, []);
}

function drawHand(gestures, size = 7) {
  const pool = [...gestures];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

function drawKeyboard(hand, combo = []) {
  const signButtons = hand.map((gesture, index) => ({ text: gesture, callback_data: `draw:add:${index}` }));
  return { inline_keyboard: [
    ...splitMatrixRows(signButtons, 4),
    [{ text: FINISHER, callback_data: "draw:seal" }, { text: "⌫", callback_data: "draw:back" }, { text: "Redraw", callback_data: "draw:redraw" }],
    [{ text: "Cancel", callback_data: "nav:cancel" }, { text: "🏠 Main Menu", callback_data: "nav:home" }]
  ] };
}

async function showDraw(request, env, chatId, session, editMessageId = null, redraw = false) {
  const gestures = await loadGestures(request);
  const hand = redraw || !session.drawHand?.length ? drawHand(gestures, 7) : session.drawHand;
  const combo = redraw ? [] : session.drawCombo || [];
  await saveSession(env, chatId, { ...session, drawHand: hand, drawCombo: combo, mode: "draw" });
  const text = `🎴 Draw Mode\nPick 1-5 signs from this 7-card hand, then seal with ${FINISHER}.\nCurrent: ${combo.join("") || "—"}`;
  return sendOrEdit(env, chatId, text, drawKeyboard(hand, combo), editMessageId);
}

async function handleCastCallback(request, env, callback) {
  const chatId = callback.message.chat.id;
  const session = await getSession(env, chatId);
  const combo = session.castCombo || [];
  const action = callback.data.split(":")[1];
  const value = callback.data.split(":").slice(2).join(":");

  if (action === "add" && combo.length < 5) combo.push(value);
  if (action === "back") combo.pop();
  if (action === "reset") combo.length = 0;

  if (action === "seal") {
    if (!combo.length) {
      await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Pick at least one sign first." });
      return;
    }

    const sealed = `${combo.join("")}${FINISHER}`;
    const lookup = await callWorkerJson(request, `/lookup?combo=${encodeURIComponent(sealed)}`);
    const technique = lookup.data || {};
    const stats = technique.stats || {};
    const lookupFailureReason = lookupFailureMessage(lookup);
    const lookupSucceeded = !lookupFailureReason;

    let saveResult = null;
    if (lookupSucceeded) {
      session.lastCombo = sealed;
      session.last_sealed_jutsu = sealed;
      if (session.playerId) {
        saveResult = await callWorkerJson(request, "/jutsu/save", {
          method: "POST",
          body: JSON.stringify({ playerId: session.playerId, name: technique.name, combo: sealed })
        });
      }
    } else {
      // Clear stale combo so Queue and Duel don't inherit a broken technique
      session.lastCombo = null;
      session.last_sealed_jutsu = null;
    }
    session.castCombo = [];
    await saveSession(env, chatId, session);
    const resultText = lookupSucceeded
      ? `Sealed: ${sealed} → ${technique.outcome || "✨"}\n${technique.name} (${technique.rank})\nATK ${stats.atk} / DEF ${stats.def} / SPC ${stats.spc}\n${saveResult?.ok ? "Saved to My Jutsu." : "Sealed for this session; My Jutsu save is temporarily unavailable."}`
      : `Sealed: ${sealed}\nTechnique lookup is temporarily unavailable. Try ${STATIC_BUTTONS.duel} or ${STATIC_BUTTONS.queue} in a moment.`;

    await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: `Transmutation circle opened for ${sealed}...`
    });
    await sendTransmutationSequence(request, env, chatId, sealed);
    await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: resultText,
      reply_markup: mainMenuKeyboard()
    });
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Technique sealed." });
    return;
  }

  session.castCombo = combo;
  await saveSession(env, chatId, session);
  await showCast(request, env, chatId, callback.message.message_id);
  await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
}


async function handleDrawCallback(request, env, callback) {
  const chatId = callback.message.chat.id;
  const session = await getSession(env, chatId);
  const hand = session.drawHand || drawHand(await loadGestures(request), 7);
  const combo = session.drawCombo || [];
  const [, action, rawIndex] = callback.data.split(":");

  if (action === "redraw") {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Drew a new hand." });
    return showDraw(request, env, chatId, session, callback.message.message_id, true);
  }
  if (action === "add" && combo.length < 5 && hand[Number(rawIndex)]) combo.push(hand[Number(rawIndex)]);
  if (action === "back") combo.pop();

  if (action === "seal") {
    if (!combo.length) {
      await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Pick at least one drawn sign first." });
      return;
    }
    const sealed = `${combo.join("")}${FINISHER}`;
    const lookup = await callWorkerJson(request, `/lookup?combo=${encodeURIComponent(sealed)}`);
    const technique = lookup.data || {};
    const lookupFailureReason = lookupFailureMessage(lookup);
    const lookupSucceeded = !lookupFailureReason;
    const next = { ...session, drawHand: [], drawCombo: [], mode: undefined };
    let saveResult = null;
    if (lookupSucceeded) {
      next.lastCombo = sealed;
      next.last_sealed_jutsu = sealed;
      saveResult = await callWorkerJson(request, "/jutsu/save", { method: "POST", body: JSON.stringify({ playerId: session.playerId, name: technique.name, combo: sealed }) });
    } else {
      next.lastCombo = null;
      next.last_sealed_jutsu = null;
    }
    delete next.mode;
    await saveSession(env, chatId, next);
    const stats = technique.stats || {};
    const text = lookupSucceeded
      ? `Draw sealed: ${sealed} → ${technique.outcome || "✨"}\n${technique.name} (${technique.rank})\nATK ${stats.atk} / DEF ${stats.def} / SPC ${stats.spc}\n${saveResult?.ok ? "Saved to My Jutsu." : "Sealed for this session; My Jutsu save is temporarily unavailable."}`
      : `Draw sealed: ${sealed}\nTechnique lookup failed verification, so no active jutsu was saved.`;
    await telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text, reply_markup: mainMenuKeyboard() });
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: lookupSucceeded ? "Draw sealed." : "Lookup failed." });
    return;
  }

  await saveSession(env, chatId, { ...session, drawHand: hand, drawCombo: combo, mode: "draw" });
  await showDraw(request, env, chatId, { ...session, drawHand: hand, drawCombo: combo }, callback.message.message_id);
  await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
}

function percent(n) {
  return `${Math.round((Number(n) || 0) * 100)}%`;
}

function playerWinRate(record) {
  const battles = Number(record?.battles || record?.wins + record?.losses + record?.draws || 0);
  return battles ? Number(((record.wins || 0) / battles).toFixed(2)) : 0;
}

function medalForRank(index) {
  return ["🥇", "🥈", "🥉"][index] || "🏅";
}

function formatArena(arena) {
  const leaders = (arena.leaderboard || []).slice(0, 5).map((p, i) => `${medalForRank(i)} ${p.playerId}: ${p.rating ?? "—"} ${p.rank || "Bronze"} • ${p.wins}W/${p.losses}L • ${percent(playerWinRate(p))} WR`).join("\n") || "No battles yet.";
  return `Arena queue: ${(arena.queue || []).length}\nActive battles: ${(arena.activeBattles || []).length}\nRecent battles: ${(arena.history || []).length}\n\nLeaderboard:\n${leaders}`;
}

function lookupFailureMessage(lookup) {
  if (!lookup) return "worker request failed before a response was created";
  if (!lookup.ok) return lookup.data?.error ? `worker returned HTTP ${lookup.status}: ${lookup.data.error}` : `worker returned HTTP ${lookup.status}`;
  if (!lookup.data || typeof lookup.data !== "object") return "worker returned a malformed response body";
  const missing = ["name", "rank", "stats"].filter(field => !lookup.data[field]);
  return missing.length ? `lookup schema mismatch; missing ${missing.join(", ")}` : "";
}

function formatTechniquePreview(combo, technique) {
  const stats = technique.stats || {};
  const effect = technique.battleStyle || technique.spell || `${stats.class || technique.class || "Unknown"} Technique`;
  return [
    `Preview: ${combo} → ${technique.outcome || "✨"}`,
    `${technique.name} (${technique.rank || "Unranked"})`,
    `Element/Type: ${stats.class || technique.class || "Unknown"}`,
    `Damage/Effect: Power ${stats.power ?? "?"}; ${effect}`,
    `Chakra Cost: ${stats.cost ?? "?"}`,
    "",
    "This is only a lookup preview. Tap Save/Seal to make it your queued technique."
  ].join("\n");
}


function truncateTelegramText(value, limit = 3900) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit - 40)}\n… truncated for Telegram. Open the API for more.` : text;
}

const API_BUTTONS = {
  help: { text: "📚 Help", path: "/help" },
  changelog: { text: "📝 Changelog", path: "/changelog" },
  about: { text: "ℹ️ About", path: "/about" },
  lookupLast: { text: "🥷 Lookup Last", path: "/lookup", requiresCombo: true },
  analyzeLast: { text: "🔎 Analyze Last", path: "/analyze", requiresCombo: true },
  gestures: { text: "🧬 Gestures", path: "/gestures" },
  rules: { text: "📖 Rules", path: "/rules" },
  balance: { text: "⚖️ Balance", path: "/balance/simulate?maxLength=3" },
  duelLast: { text: "⚔️ Duel Last", path: "/duel", promptMode: "awaiting_duel_opponent" },
  simulateLast: { text: "🎲 Simulate Last", path: "/simulate", promptMode: "awaiting_simulate_opponent" },
  replay: { text: "🔁 Replay", path: "/replay", promptMode: "awaiting_replay_args" },
  train: { text: "🎓 Train", path: "/train" },
  queueStatus: { text: "📥 Queue Status", path: "/queue" },
  arena: { text: "🏟️ Arena", path: "/arena" },
  leaderboard: { text: "🏆 Leaderboard", path: "/leaderboard" },
  rank: { text: "🥇 My Rank", path: "/rank", requiresPlayer: true },
  battle: { text: "📜 Battle Replay", path: "/battle/:id", promptMode: "awaiting_battle_id" },
  butler: { text: "🤖 Butler", path: "/butler" },
  player: { text: "👤 Player", path: "/player", requiresPlayer: true },
  stats: { text: "📊 Stats", path: "/stats", requiresPlayer: true },
  chronicle: { text: "📖 Chronicle", path: "/ai/chronicle", promptMode: "awaiting_chronicle_battle_id" },
  telegramStatus: { text: "🤖 Bot Status", path: "/telegram/status" },
  aiConfig: { text: "🧠 AI Config", path: "/ai/config" }
};

function apiKeyboard() {
  return screenKeyboard([
    ["help", "changelog", "about"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["lookupLast", "analyzeLast"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["gestures", "rules", "train"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["balance", "queueStatus"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["duelLast", "simulateLast", "replay"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["arena", "leaderboard", "rank"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["battle", "butler", "chronicle"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["player", "stats"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` })),
    ["telegramStatus", "aiConfig"].map(key => ({ text: API_BUTTONS[key].text, callback_data: `api:${key}` }))
  ]);
}

function formatApiEndpoint(path, data) {
  if (path === "/help") {
    const commands = (data.commands || []).map(c => `${c.method} ${c.path} — ${c.description}`).join("\n");
    return `📚 ${data.title || "API Help"}\n${truncateTelegramText(commands || data)}`;
  }
  if (path === "/rules") return `📖 Rules\n${truncateTelegramText(data.summary || data)}`;
  if (path === "/train") return `🎓 Training\n${truncateTelegramText(data)}`;
  if (path === "/about") return `ℹ️ About\n${data.name} v${data.version}\n${data.description}\nCommands: ${data.availableCommandsUrl}`;
  if (path === "/changelog") return `📝 Changelog\n${truncateTelegramText(data)}`;
  if (path === "/gestures") {
    const gestures = Object.entries(data.gestures || {}).map(([emoji, g]) => `${emoji} ${g.name}: ATK ${g.atk} DEF ${g.def} SPC ${g.spc} ${g.type}`).join("\n");
    return `🧬 Gestures (${data.count})\n${truncateTelegramText(gestures)}`;
  }
  if (path === "/queue") {
    const queue = (data.queue || []).slice(0, 10).map((entry, i) => `${i + 1}. ${entry.playerId}: ${entry.combo} (${entry.name || "queued"})`).join("\n");
    return `📥 Queue Status\nPersistence: ${data.persistence?.mode || "unknown"}\nWaiting: ${(data.queue || []).length}\n\n${queue || "No waiting entries."}`;
  }
  if (path.startsWith("/player")) return `👤 Player\n${truncateTelegramText(data)}`;
  if (path.startsWith("/stats")) return `📊 Stats\n${truncateTelegramText(data)}`;
  if (path.startsWith("/ai/chronicle")) return `📜 Chronicle\n${truncateTelegramText(data.chronicle || data)}`;
  if (path.startsWith("/balance/simulate")) {
    const top = (data.topCombos || []).slice(0, 10).map((c, i) => `${i + 1}. ${c.combo} ${c.class} P${c.power} WR ${percent(c.winRate)}`).join("\n");
    return `⚖️ Balance simulation\nCombos: ${data.comboCount}; max length: ${data.maxLength}\n\nTop combos:\n${top || "No results."}`;
  }
  return truncateTelegramText(data);
}

async function sendApiEndpoint(request, env, chatId, path, editMessageId = null) {
  await sendTypingIndicator(env, chatId);
  const result = await callWorkerJson(request, path);
  const text = result.ok ? formatApiEndpoint(path, result.data) : `API request failed for ${path}: ${result.data?.error || result.status}`;
  return sendOrEdit(env, chatId, text, apiKeyboard(), editMessageId);
}

async function showApiMenu(env, chatId, editMessageId = null) {
  const text = [
    "🧭 API from Telegram",
    "Every API endpoint has a canonical button below.",
    "Buttons that need extra input will ask for the missing combo, player id, battle id, or replay values.",
    "Operational endpoints that require an admin token are shown for completeness and may return Unauthorized from Telegram."
  ].join("\n");
  return sendOrEdit(env, chatId, text, apiKeyboard(), editMessageId);
}

async function sendLookupPreview(request, env, chatId, session, rawCombo) {
  const sealed = normalizeSealedCombo(rawCombo);
  const lookup = await callWorkerJson(request, `/lookup?combo=${encodeURIComponent(sealed)}`);
  const failureReason = lookupFailureMessage(lookup);
  if (failureReason) {
    return telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: `Technique lookup failed: ${failureReason}` }));
  }

  await sendTypingIndicator(env, chatId);
  const token = await shortId(`${chatId}:${sealed}:${Date.now()}`);
  const pendingLookupEntries = Object.entries(session.pendingLookups || {}).slice(-(MAX_PENDING_LOOKUPS - 1));
  const pendingLookups = { ...Object.fromEntries(pendingLookupEntries), [token]: sealed };
  await saveSession(env, chatId, { ...session, pendingLookups });

  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text: formatTechniquePreview(sealed, lookup.data),
    reply_markup: { inline_keyboard: [
      [{ text: "Save/Seal", callback_data: `lookup:seal:${token}` }],
      [{ text: STATIC_BUTTONS.duel, callback_data: `duel:use:${token}` }, { text: STATIC_BUTTONS.queue, callback_data: `queue:use:${token}` }]
    ] }
  });
}

async function handleLookupCallback(request, env, callback) {
  const chatId = callback.message.chat.id;
  const token = callback.data.split(":")[2];
  const session = await getSession(env, chatId);
  const sealed = session.pendingLookups?.[token];
  if (!sealed) {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Preview expired. Paste the combo again." });
    return;
  }

  const lookup = await callWorkerJson(request, `/lookup?combo=${encodeURIComponent(sealed)}`);
  const failureReason = lookupFailureMessage(lookup);
  if (failureReason) {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: failureReason });
    return;
  }

  const pendingLookups = { ...(session.pendingLookups || {}) };
  delete pendingLookups[token];
  const nextSession = { ...session, lastCombo: sealed, last_sealed_jutsu: sealed, pendingLookups };
  await saveSession(env, chatId, nextSession);

  await callWorkerJson(request, "/jutsu/save", { method: "POST", body: JSON.stringify({ playerId: session.playerId, name: lookup.data.name, combo: sealed }) });
  await telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: `Transmutation circle opened for ${sealed}...` });
  await sendTransmutationSequence(request, env, chatId, sealed);
  await telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: `Sealed: ${sealed} → ${lookup.data.outcome || "✨"}\n${lookup.data.name} (${lookup.data.rank})\nSaved as your latest jutsu.` });
  await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Technique saved and sealed." });
}


async function queueCombo(request, env, chatId, session, sealed) {
  await sendTypingIndicator(env, chatId);
  const validation = await callWorkerJson(request, `/lookup?combo=${encodeURIComponent(sealed)}`);
  if (!validation.ok) {
    return telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: `Queue failed: your sealed technique is invalid (${validation.data.error || "unknown error"}). Seal a fresh combo first.` }));
  }
  const queued = await callWorkerJson(request, "/queue", { method: "POST", body: JSON.stringify({ playerId: session.playerId, combo: sealed, includeButler: true }) });
  const entryName = queued.data?.entry?.name || validation.data?.name || sealed;
  await telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: queued.ok ? `Queued ${entryName}. Resolved battles: ${queued.data.resolved ?? 0}` : `Queue failed: ${queued.data.error || "temporarily unavailable"}` }));
  if (queued.ok && queued.data?.latestBattle && queued.data.resolved > 0) await sendChronicleFollowup(request, env, chatId, queued.data.latestBattle);
}

async function sendChronicleFollowup(request, env, chatId, matchData) {
  await sendTypingIndicator(env, chatId);
  const chronicle = await callWorkerJson(request, "/ai/chronicle", { method: "POST", body: JSON.stringify(matchData) });
  if (!chronicle.ok || !chronicle.data?.chronicle) return null;
  const text = String(chronicle.data.chronicle).slice(0, 3900);
  return telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: `📜 Chronicle of the Duel\n\n${text}` }));
}

async function sendDuelPrompt(env, chatId, session, messageId = null) {
  await saveSession(env, chatId, { ...session, mode: "awaiting_duel_opponent" });
  const payload = {
    chat_id: chatId,
    text: `Duel mode armed with ${session.lastCombo || "your next sealed technique"}.

Paste an opponent combo ending in ${FINISHER}, or send a rival player ID.`,
    reply_markup: screenKeyboard([[{ text: "Cancel", callback_data: "nav:cancel" }]])
  };
  if (messageId) return telegram(env, "editMessageText", { ...payload, message_id: messageId });
  return telegram(env, "sendMessage", payload);
}

async function runDuel(request, env, chatId, session, opponentArg) {
  await sendTypingIndicator(env, chatId);
  if (!session.lastCombo) return telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: `Cast and seal your technique first with ${STATIC_BUTTONS.cast}.` }));
  let opponent = normalizeSealedCombo(opponentArg);
  let opponentPlayer = "";
  if (!HAND_SIGN_PATTERN.test(opponent)) {
    const rival = await callWorkerJson(request, `/stats?id=${encodeURIComponent(opponentArg)}`);
    const signature = rival.data.signature_jutsu?.[0];
    if (!signature?.combo) return telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: "That player has no saved signature jutsu yet. Paste a combo instead." }));
    opponent = signature.combo;
    opponentPlayer = opponentArg;
  }
  const nextSession = { ...session };
  delete nextSession.mode;
  await saveSession(env, chatId, nextSession);
  const duel = await callWorkerJson(request, `/simulate?combo=${encodeURIComponent(session.lastCombo)}&opponent=${encodeURIComponent(opponent)}&playerA=${encodeURIComponent(session.playerId)}&playerB=${encodeURIComponent(opponentPlayer)}`);
  const duelText = duel.ok
    ? [
      `Duel result: ${duel.data.winner}`,
      `${duel.data.combo.name} vs ${duel.data.opponent.name}`,
      ...duel.data.rounds.map(r => `${r.attacker}: ${r.damage}`)
    ].join("\n")
    : `Duel failed: ${duel.data.error}`;
  await telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: duelText }));
  if (duel.ok) await sendChronicleFollowup(request, env, chatId, duel.data);
}

async function showArena(request, env, chatId, editMessageId = null) {
  await sendTypingIndicator(env, chatId);
  const arena = await callWorkerJson(request, "/arena");
  return sendOrEdit(env, chatId, formatArena(arena.data), screenKeyboard([[{ text: "🔄 Refresh Arena", callback_data: "nav:arena" }]]), editMessageId);
}

async function showRankings(request, env, chatId, session, editMessageId = null) {
  await sendTypingIndicator(env, chatId);
  const board = await callWorkerJson(request, "/leaderboard");
  const self = session?.playerId ? await callWorkerJson(request, `/rank?id=${encodeURIComponent(session.playerId)}`) : null;
  const leaders = (board.data?.leaderboard || []).slice(0, 10).map((p, i) => `${medalForRank(i)} ${p.playerId}: ${p.rating} ${p.rank} • ${p.wins}W/${p.losses}L`).join("\n") || "No ranked duels yet.";
  const me = self?.ok ? `\n\nYour rank: ${self.data.rank.rating} ${self.data.rank.rank} • ${self.data.rank.wins}W/${self.data.rank.losses}L` : "";
  const tiers = (board.data?.ranks || ["Bronze", "Silver", "Gold", "Platinum", "Astral", "Mythic"]).join(" → ");
  return sendOrEdit(env, chatId, `🏆 Rankings\n${tiers}\n\n${leaders}${me}`, screenKeyboard([[{ text: "🔄 Refresh Rankings", callback_data: "nav:rankings" }]]), editMessageId);
}

async function showButler(request, env, chatId, editMessageId = null) {
  const butler = await callWorkerJson(request, "/butler");
  const text = butler.ok
    ? `AI Butler\nStyle: ${butler.data.preferredStyle}\nWin rate: ${butler.data.winRate}\nNext: ${butler.data.nextCombo}`
    : `AI Butler is unavailable: ${butler.data?.error || "temporarily unavailable"}`;
  return sendOrEdit(env, chatId, text, screenKeyboard([[{ text: "🔄 Refresh Butler", callback_data: "nav:butler" }]]), editMessageId);
}

async function showProfile(request, env, chatId, session, editMessageId = null) {
  await sendTypingIndicator(env, chatId);
  const stats = await callWorkerJson(request, `/stats?id=${encodeURIComponent(session.playerId)}`);
  const p = stats.data.player || {};
  const wins = Number(p.wins || 0);
  const losses = Number(p.losses || 0);
  const draws = Number(p.draws || 0);
  const battles = wins + losses + draws;
  const jutsuCount = (stats.data.signature_jutsu || []).length;
  const level = Math.max(1, Math.floor(Number(p.xp || 0) / 100) + 1);
  const text = `Profile ${p.username || session.username}\nID: ${session.playerId}\nLevel: ${level}\nRecord: ${wins}W/${losses}L/${draws}D • ${percent(battles ? wins / battles : 0)} WR\nJutsu saved: ${jutsuCount}\nXP: ${p.xp || 0}\nPoints: ${p.points || 0}`;
  return sendOrEdit(env, chatId, text, screenKeyboard([[{ text: STATIC_BUTTONS.myjutsu, callback_data: "nav:myjutsu" }]]), editMessageId);
}

async function showMyJutsu(request, env, chatId, session, editMessageId = null) {
  await sendTypingIndicator(env, chatId);
  const stats = await callWorkerJson(request, `/stats?id=${encodeURIComponent(session.playerId)}`);
  const list = (stats.data.signature_jutsu || []).slice(0, 10).map(j => {
    const uses = Number(j.usage_count || 0);
    const wins = Number(j.wins || 0);
    return `• ${j.name}: ${j.combo} • ${wins}/${uses} wins (${percent(uses ? wins / uses : 0)} WR)`;
  }).join("\n") || "No saved signatures yet.";
  return sendOrEdit(env, chatId, list, screenKeyboard([[{ text: STATIC_BUTTONS.cast, callback_data: "nav:cast" }]]), editMessageId);
}

async function handleMessage(request, env, message) {
  const chat = message.chat;
  const textBody = (message.text || "").trim();
  const [typedCommand, ...args] = textBody.split(/\s+/);
  const command = Object.values(STATIC_BUTTONS).includes(textBody) ? textBody : typedCommand;
  const session = await ensurePlayer(request, env, chat, message.from);

  if (command === "/cancel") {
    const next = { ...session, castCombo: [], drawCombo: [], drawHand: [], pendingLookups: {} };
    delete next.mode;
    await saveSession(env, chat.id, next);
    return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: "Cancelled current action and cleared pending previews." }));
  }

  if (session.mode === "awaiting_duel_opponent" && textBody) {
    return runDuel(request, env, chat.id, session, textBody);
  }

  if (session.mode === "awaiting_simulate_opponent" && textBody) {
    const next = { ...session };
    delete next.mode;
    await saveSession(env, chat.id, next);
    if (!session.lastCombo) return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: `Cast and seal a technique first with ${STATIC_BUTTONS.cast}.` }));
    return sendApiEndpoint(request, env, chat.id, `/simulate?combo=${encodeURIComponent(session.lastCombo)}&opponent=${encodeURIComponent(normalizeSealedCombo(textBody))}`);
  }

  if (session.mode === "awaiting_replay_args" && textBody) {
    const next = { ...session };
    delete next.mode;
    await saveSession(env, chat.id, next);
    const [comboArg, opponentArg, matchId] = textBody.split(/\s+/);
    if (!comboArg || !opponentArg) return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: "Replay needs: combo opponent [matchId]. Tap Replay again and send all values in one message." }));
    const q = new URLSearchParams({ combo: normalizeSealedCombo(comboArg), opponent: normalizeSealedCombo(opponentArg) });
    if (matchId) q.set("matchId", matchId);
    return sendApiEndpoint(request, env, chat.id, `/replay?${q}`);
  }

  if (session.mode === "awaiting_battle_id" && textBody) {
    const next = { ...session };
    delete next.mode;
    await saveSession(env, chat.id, next);
    return sendApiEndpoint(request, env, chat.id, `/battle/${encodeURIComponent(textBody)}`);
  }

  if (session.mode === "awaiting_chronicle_battle_id" && textBody) {
    const next = { ...session };
    delete next.mode;
    await saveSession(env, chat.id, next);
    const battle = await callWorkerJson(request, `/battle/${encodeURIComponent(textBody)}`);
    if (!battle.ok) return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: `Battle lookup failed: ${battle.data?.error || battle.status}` }));
    const chronicle = await callWorkerJson(request, "/ai/chronicle", { method: "POST", body: JSON.stringify(battle.data) });
    return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: chronicle.ok ? `📜 Chronicle
${truncateTelegramText(chronicle.data.chronicle || chronicle.data)}` : `Chronicle failed: ${chronicle.data?.error || chronicle.status}` }));
  }

  const normalizedTextCombo = normalizeSealedCombo(textBody);
  if (HAND_SIGN_PATTERN.test(normalizedTextCombo)) {
    return sendLookupPreview(request, env, chat.id, session, normalizedTextCombo);
  }

  if (command === "/start" || command === "/help" || command === STATIC_BUTTONS.help) {
    return showHome(env, chat.id, session);
  }

  if (command === STATIC_BUTTONS.api) return showApiMenu(env, chat.id);

  if (textBody.startsWith("/") && !["/start", "/help", "/cancel"].includes(command)) {
    return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: `Slash commands were replaced with canonical buttons. Tap ${STATIC_BUTTONS.api} or the menu below.` }));
  }

  if (command === STATIC_BUTTONS.cast) return showCast(request, env, chat.id);

  if (command === STATIC_BUTTONS.draw) return showDraw(request, env, chat.id, session, null, true);

  if (command === STATIC_BUTTONS.queue) {
    const sealed = session.last_sealed_jutsu || session.lastCombo;
    if (!sealed) return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: `Cast and seal a technique first with ${STATIC_BUTTONS.cast}, or paste a combo and tap Save/Seal.` }));
    return queueCombo(request, env, chat.id, session, sealed);
  }

  if (command === STATIC_BUTTONS.arena) {
    return showArena(request, env, chat.id);
  }

  if (command === STATIC_BUTTONS.rankings) {
    return showRankings(request, env, chat.id, session);
  }

  if (command === STATIC_BUTTONS.butler) {
    return showButler(request, env, chat.id);
  }

  if (command === STATIC_BUTTONS.profile) {
    return showProfile(request, env, chat.id, session);
  }

  if (command === STATIC_BUTTONS.myjutsu) {
    return showMyJutsu(request, env, chat.id, session);
  }

  if (command === STATIC_BUTTONS.duel) {
    if (!session.lastCombo) return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: `Cast and seal your technique first with ${STATIC_BUTTONS.cast}.` }));
    const opponentArg = args.join(" ");
    if (!opponentArg) return sendDuelPrompt(env, chat.id, session);
    return runDuel(request, env, chat.id, session, opponentArg);
  }

  return telegram(env, "sendMessage", withMainMenu({ chat_id: chat.id, text: `Unknown action. Tap ${STATIC_BUTTONS.help} or use the menu buttons below.` }));
}


async function handleFrontEndCallback(request, env, callback) {
  const chatId = callback.message.chat.id;
  const session = await getSession(env, chatId);
  const [scope, action, token] = callback.data.split(":");

  if (scope === "nav") {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
    if (action === "home") return showHome(env, chatId, session, callback.message.message_id);
    if (action === "cancel") {
      const next = { ...session };
      delete next.mode;
      await saveSession(env, chatId, next);
      return telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: "Cancelled. Choose your next action.", reply_markup: mainMenuKeyboard() });
    }
    if (action === "cast") return showCast(request, env, chatId, callback.message.message_id);
    if (action === "draw") return showDraw(request, env, chatId, session, callback.message.message_id, true);
    if (action === "duel") return session.lastCombo
      ? sendDuelPrompt(env, chatId, session, callback.message.message_id)
      : telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: `Cast and seal your technique first with ${STATIC_BUTTONS.cast}.`, reply_markup: mainMenuKeyboard() });
    if (action === "queue") {
      const sealed = session.last_sealed_jutsu || session.lastCombo;
      if (!sealed) return telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: `Cast and seal a technique first with ${STATIC_BUTTONS.cast}, or paste a combo and tap Save/Seal.`, reply_markup: mainMenuKeyboard() });
      return queueCombo(request, env, chatId, session, sealed);
    }
    if (action === "arena") return showArena(request, env, chatId, callback.message.message_id);
    if (action === "rankings") return showRankings(request, env, chatId, session, callback.message.message_id);
    if (action === "butler") return showButler(request, env, chatId, callback.message.message_id);
    if (action === "profile") return showProfile(request, env, chatId, session, callback.message.message_id);
    if (action === "myjutsu") return showMyJutsu(request, env, chatId, session, callback.message.message_id);
    if (action === "help") return sendOrEdit(env, chatId, commandList(session.playerId), mainMenuKeyboard(), callback.message.message_id);
    if (action === "api") return showApiMenu(env, chatId, callback.message.message_id);
    const fakeMessage = { chat: callback.message.chat, from: callback.from, text: STATIC_BUTTONS[action] || `/${action}` };
    return handleMessage(request, env, fakeMessage);
  }

  if (scope === "api") {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
    const button = API_BUTTONS[action];
    if (!button) return showApiMenu(env, chatId, callback.message.message_id);

    const combo = session.last_sealed_jutsu || session.lastCombo;
    if (button.requiresCombo) {
      if (!combo) return telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: `Cast and seal a technique first with ${STATIC_BUTTONS.cast}.`, reply_markup: apiKeyboard() });
      return sendApiEndpoint(request, env, chatId, `${button.path}?combo=${encodeURIComponent(combo)}`, callback.message.message_id);
    }

    if (button.requiresPlayer) {
      if (!session.playerId) return telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: "Create or load a Telegram player first.", reply_markup: apiKeyboard() });
      const param = button.path === "/rank" ? "id" : "id";
      return sendApiEndpoint(request, env, chatId, `${button.path}?${param}=${encodeURIComponent(session.playerId)}`, callback.message.message_id);
    }

    if (button.promptMode) {
      if ((action === "duelLast" || action === "simulateLast") && !combo) {
        return telegram(env, "editMessageText", { chat_id: chatId, message_id: callback.message.message_id, text: `Cast and seal a technique first with ${STATIC_BUTTONS.cast}.`, reply_markup: apiKeyboard() });
      }
      await saveSession(env, chatId, { ...session, mode: button.promptMode });
      const prompts = {
        duelLast: `Duel endpoint armed with ${combo}. Send an opponent combo or rival player id.`,
        simulateLast: `Simulate endpoint armed with ${combo}. Send the opponent combo.`,
        replay: "Replay endpoint selected. Send: combo opponent [matchId].",
        battle: "Battle replay endpoint selected. Send the battle id.",
        chronicle: "Chronicle endpoint selected. Send a battle id to load /battle/:id and post it to /ai/chronicle."
      };
      return sendOrEdit(env, chatId, prompts[action] || "Send the requested value.", apiKeyboard(), callback.message.message_id);
    }

    return sendApiEndpoint(request, env, chatId, button.path, callback.message.message_id);
  }

  if ((scope === "duel" || scope === "queue") && action === "use") {
    const sealed = session.pendingLookups?.[token];
    if (!sealed) {
      await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Preview expired. Paste the combo again." });
      return;
    }
    const next = { ...session, lastCombo: sealed, last_sealed_jutsu: sealed };
    await saveSession(env, chatId, next);
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: scope === "queue" ? "Queuing this technique." : "Duel mode armed." });
    return scope === "queue" ? queueCombo(request, env, chatId, next, sealed) : sendDuelPrompt(env, chatId, next, callback.message.message_id);
  }
}

function configAuthToken(env) {
  return env?.ADMIN_TOKEN || env?.CONFIG_ADMIN_TOKEN || "";
}

function isAuthorizedConfigRequest(request, env) {
  const token = configAuthToken(env);
  if (!token) return false;
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("X-Admin-Token") || "";
  return bearer === token || header === token;
}

export async function handleTelegramConfig(request, env) {
  if (!isAuthorizedConfigRequest(request, env)) return json({ error: "Unauthorized. Set ADMIN_TOKEN and send it as Bearer or X-Admin-Token." }, 401);
  if (!env?.BOT_SESSIONS) return json({ error: "Missing BOT_SESSIONS KV binding" }, 503);
  if (request.method !== "POST") return text("Use POST", 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON with a token field" }, 400);
  }

  const token = (body.token || body.telegramBotToken || "").trim();
  if (!token) return json({ error: "Missing token" }, 400);

  const existing = await getStoredTelegramConfig(env);
  const webhookSecret = (body.webhookSecret || existing.webhookSecret || crypto.randomUUID()).trim();
  const gestureStickers = body.gestureStickers && typeof body.gestureStickers === "object"
    ? body.gestureStickers
    : existing.gestureStickers || {};
  const transmutationDeleteDelayMs = Number(body.transmutationDeleteDelayMs || existing.transmutationDeleteDelayMs || DEFAULT_TRANSMUTATION_DELETE_DELAY_MS);
  const config = { token, webhookSecret, gestureStickers, transmutationDeleteDelayMs, updatedAt: new Date().toISOString() };
  await env.BOT_SESSIONS.put(TELEGRAM_CONFIG_KEY, JSON.stringify(config));

  const url = new URL(request.url);
  const webhookUrl = body.webhookUrl || `${url.origin}/telegram/webhook`;
  let webhook = null;
  if (body.setWebhook !== false) {
    webhook = await telegram(env, "setWebhook", {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message", "callback_query"]
    });
  }

  return json({
    ok: true,
    webhookUrl,
    webhookSecret,
    webhook,
    gestureStickerCount: Object.keys(gestureStickers).length,
    transmutationDeleteDelayMs,
    message: "Telegram bot token saved and webhook configured. The token is not returned."
  });
}

export async function handleTelegramStatus(request, env) {
  if (!isAuthorizedConfigRequest(request, env)) return json({ error: "Unauthorized. Set ADMIN_TOKEN and send it as Bearer or X-Admin-Token." }, 401);
  if (request.method !== "GET") return json({ error: "Use GET /telegram/status" }, 405);

  const stored = await getStoredTelegramConfig(env);
  const config = await getBotConfig(env);
  const hasToken = Boolean(config.token);
  const hasWebhookSecret = Boolean(config.webhookSecret);
  const hasBotSessions = Boolean(env?.BOT_SESSIONS);
  const tokenSource = stored.token ? "kv" : env?.TELEGRAM_BOT_TOKEN ? "env" : "missing";
  const webhookSecretSource = stored.webhookSecret ? "kv" : env?.TELEGRAM_WEBHOOK_SECRET ? "env" : "missing";
  const expectedWebhookUrl = `${new URL(request.url).origin}/telegram/webhook`;

  if (!hasToken) {
    return json({
      ok: false,
      status: "not_configured",
      configured: { hasToken, tokenSource, hasWebhookSecret, webhookSecretSource, hasBotSessions },
      expectedWebhookUrl,
      diagnosis: ["Missing Telegram bot token. Configure it with POST /telegram/config or TELEGRAM_BOT_TOKEN."],
      tokenReturned: false
    }, 503);
  }

  const [bot, webhook] = await Promise.all([
    telegramStatusCall(env, "getMe"),
    telegramStatusCall(env, "getWebhookInfo")
  ]);
  const webhookResult = webhook.data?.result || null;
  const issues = [];

  if (!hasWebhookSecret) issues.push("Missing Telegram webhook secret. Configure it with POST /telegram/config or TELEGRAM_WEBHOOK_SECRET.");
  if (!hasBotSessions) issues.push("Missing BOT_SESSIONS KV binding; webhook sessions and runtime Telegram config cannot persist.");
  if (!bot.ok) issues.push(`getMe failed: ${bot.error}`);
  if (!webhook.ok) issues.push(`getWebhookInfo failed: ${webhook.error}`);
  if (webhookResult) {
    if (!webhookResult.url) issues.push("Telegram has no webhook URL configured.");
    else if (webhookResult.url !== expectedWebhookUrl) issues.push(`Telegram webhook URL is ${webhookResult.url}, expected ${expectedWebhookUrl}.`);
    if (webhookResult.last_error_message) issues.push(`Telegram reports last webhook error: ${webhookResult.last_error_message}`);
  }

  return json({
    ok: issues.length === 0,
    status: issues.length === 0 ? "healthy" : "attention_required",
    configured: { hasToken, tokenSource, hasWebhookSecret, webhookSecretSource, hasBotSessions },
    expectedWebhookUrl,
    bot: { ok: bot.ok, user: redactBotUser(bot.data?.result), error: bot.error || null },
    webhook: {
      ok: webhook.ok,
      url: webhookResult?.url || "",
      matchesExpectedUrl: webhookResult ? webhookResult.url === expectedWebhookUrl : false,
      pendingUpdateCount: webhookResult?.pending_update_count ?? null,
      lastErrorDate: telegramDate(webhookResult?.last_error_date),
      lastErrorMessage: webhookResult?.last_error_message || null,
      maxConnections: webhookResult?.max_connections ?? null,
      allowedUpdates: webhookResult?.allowed_updates || [],
      error: webhook.error || null
    },
    diagnosis: issues,
    tokenReturned: false
  }, issues.length === 0 ? 200 : 502);
}

export async function handleTelegramWebhook(request, env) {
  const missing = await requireBotEnv(env);
  if (missing) return json({ error: missing }, 503);
  if (!(await verifyTelegramSecret(request, env))) return text("Unauthorized", 401);
  if (request.method !== "POST") return text("Use POST", 405);

  let update;
  try {
    update = await request.json();
  } catch {
    return json({ error: "Invalid Telegram update" }, 400);
  }

  try {
    if (update.callback_query?.data?.startsWith("cast:")) await handleCastCallback(request, env, update.callback_query);
    else if (update.callback_query?.data?.startsWith("draw:")) await handleDrawCallback(request, env, update.callback_query);
    else if (update.callback_query?.data?.startsWith("lookup:seal:")) await handleLookupCallback(request, env, update.callback_query);
    else if (update.callback_query?.data?.startsWith("nav:") || update.callback_query?.data?.startsWith("api:") || update.callback_query?.data?.startsWith("duel:use:") || update.callback_query?.data?.startsWith("queue:use:")) await handleFrontEndCallback(request, env, update.callback_query);
    else if (update.message) await handleMessage(request, env, update.message);
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) await telegram(env, "sendMessage", withMainMenu({ chat_id: chatId, text: `Bot error: ${error.message}` }));
    return json({ ok: false, error: error.message }, 200);
  }
}
