const TELEGRAM_API = "https://api.telegram.org";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const FINISHER = "🙏🏻";
const GESTURE_CACHE = {
  values: null,
  loadedAt: 0
};
const TELEGRAM_CONFIG_KEY = "telegram:config";
const DEFAULT_CAST_GESTURES = [
  "💪🏻", "👏🏻", "👍🏻", "👎🏻", "🫶🏻",
  "🙌🏻", "👐🏻", "🤲🏻", "🤜🏻", "🤛🏻",
  "✊🏻", "👊🏻", "🫸🏻", "🫷🏻", "🤚🏻",
  "🖐🏻", "✋🏻", "🖖🏻", "🤟🏻", "🤞🏻",
  "✌🏻", "🤌🏻", "🫳🏻", "🫴🏻", "🫲🏻",
  "🫱🏻", "👋🏻", "🫰🏻", "🤙🏻", "🤏🏻"
];

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
    webhookSecret: stored.webhookSecret || env?.TELEGRAM_WEBHOOK_SECRET || ""
  };
}

async function requireBotEnv(env) {
  const config = await getBotConfig(env);
  if (!config.token) return "Missing Telegram bot token. Set it with POST /telegram/config.";
  if (!config.webhookSecret) return "Missing Telegram webhook secret. Set it with POST /telegram/config.";
  if (!env?.BOT_SESSIONS) return "Missing BOT_SESSIONS KV binding";
  return null;
}

async function verifyTelegramSecret(request, env) {
  const config = await getBotConfig(env);
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === config.webhookSecret;
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

function commandList(playerId) {
  return [
    "🥷 Welcome to Emoji Jutsu.",
    playerId ? `Player ID: ${playerId}` : null,
    "",
    "/cast — build a technique with buttons, seal with 🙏🏻",
    "/duel [playerId] — duel a saved rival or paste a combo",
    "/queue — submit your last sealed technique to the arena",
    "/arena — leaderboard and queue",
    "/butler — inspect the AI Butler",
    "/myjutsu — saved signature techniques",
    "/profile — your stats"
  ].filter(Boolean).join("\n");
}

function createdAt() {
  return Date.now();
}

async function createTelegramPlayer(env, chat) {
  if (!env?.DB) throw new Error("D1 database binding DB is not configured");

  const baseName = (chat.username || chat.first_name || `telegram-${chat.id}`).trim();
  const usernames = [baseName, `${baseName}-${chat.id}`];
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

async function ensurePlayer(request, env, chat) {
  const session = await getSession(env, chat.id);
  if (session.playerId) return session;

  const created = await createTelegramPlayer(env, chat);
  const next = { ...session, playerId: created.playerId, username: created.username };
  await saveSession(env, chat.id, next);
  return next;
}

async function loadGestures(request) {
  if (GESTURE_CACHE.values) return GESTURE_CACHE.values;

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
  const rows = gestures.slice(0, 30).reduce((acc, gesture, index) => {
    if (index % 5 === 0) acc.push([]);
    acc[acc.length - 1].push({ text: gesture, callback_data: `cast:add:${gesture}` });
    return acc;
  }, []);
  rows.push([
    { text: FINISHER, callback_data: "cast:seal" },
    { text: "⌫", callback_data: "cast:back" },
    { text: "Reset", callback_data: "cast:reset" }
  ]);
  return { inline_keyboard: rows };
}

async function showCast(request, env, chatId, editMessageId) {
  const session = await getSession(env, chatId);
  const gestures = await loadGestures(request);
  const combo = session.castCombo || [];
  const payload = {
    chat_id: chatId,
    text: `Build your technique (1-5 signs), then seal with ${FINISHER}.\nCurrent: ${combo.join("") || "—"}`,
    reply_markup: castKeyboard(gestures, combo)
  };

  if (editMessageId) {
    return telegram(env, "editMessageText", { ...payload, message_id: editMessageId });
  }
  return telegram(env, "sendMessage", payload);
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
    session.lastCombo = sealed;
    session.castCombo = [];
    await saveSession(env, chatId, session);
    const technique = lookup.data || {};
    const stats = technique.stats || {};
    const resultText = lookup.ok && technique.name && technique.rank && technique.stats
      ? `Sealed: ${sealed}\n${technique.name} (${technique.rank})\nATK ${stats.atk} / DEF ${stats.def} / SPC ${stats.spc}`
      : `Sealed: ${sealed}\nTechnique lookup is temporarily unavailable. Try /duel or /queue in a moment.`;

    await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: resultText
    });
    await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Technique sealed." });
    return;
  }

  session.castCombo = combo;
  await saveSession(env, chatId, session);
  await showCast(request, env, chatId, callback.message.message_id);
  await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
}

function formatArena(arena) {
  const leaders = (arena.leaderboard || []).slice(0, 5).map((p, i) => `${i + 1}. ${p.playerId}: ${p.wins}W/${p.losses}L/${p.draws}D`).join("\n") || "No battles yet.";
  return `Arena queue: ${(arena.queue || []).length}\n\nLeaderboard:\n${leaders}`;
}

async function handleMessage(request, env, message) {
  const chat = message.chat;
  const textBody = (message.text || "").trim();
  const [command, ...args] = textBody.split(/\s+/);
  const session = await ensurePlayer(request, env, chat);

  if (command === "/start" || command === "/help") {
    return telegram(env, "sendMessage", { chat_id: chat.id, text: commandList(session.playerId) });
  }

  if (command === "/cast") return showCast(request, env, chat.id);

  if (command === "/queue") {
    if (!session.lastCombo) return telegram(env, "sendMessage", { chat_id: chat.id, text: "Cast and seal a technique first with /cast." });
    const queued = await callWorkerJson(request, "/queue", { method: "POST", body: JSON.stringify({ playerId: session.playerId, combo: session.lastCombo, includeButler: true }) });
    return telegram(env, "sendMessage", { chat_id: chat.id, text: queued.ok ? `Queued ${queued.data.entry.name}. Resolved battles: ${queued.data.resolved}` : `Queue failed: ${queued.data.error}` });
  }

  if (command === "/arena") {
    const arena = await callWorkerJson(request, "/arena");
    return telegram(env, "sendMessage", { chat_id: chat.id, text: formatArena(arena.data) });
  }

  if (command === "/butler") {
    const butler = await callWorkerJson(request, "/butler");
    return telegram(env, "sendMessage", { chat_id: chat.id, text: `AI Butler\nStyle: ${butler.data.preferredStyle}\nWin rate: ${butler.data.winRate}\nNext: ${butler.data.nextCombo}` });
  }

  if (command === "/profile") {
    const stats = await callWorkerJson(request, `/stats?id=${encodeURIComponent(session.playerId)}`);
    const p = stats.data.player || {};
    return telegram(env, "sendMessage", { chat_id: chat.id, text: `Profile ${p.username || session.username}\nID: ${session.playerId}\n${p.wins || 0}W/${p.losses || 0}L/${p.draws || 0}D\nXP: ${p.xp || 0}\nPoints: ${p.points || 0}` });
  }

  if (command === "/myjutsu") {
    const stats = await callWorkerJson(request, `/stats?id=${encodeURIComponent(session.playerId)}`);
    const list = (stats.data.signature_jutsu || []).slice(0, 10).map(j => `• ${j.name}: ${j.combo}`).join("\n") || "No saved signatures yet.";
    return telegram(env, "sendMessage", { chat_id: chat.id, text: list });
  }

  if (command === "/duel") {
    if (!session.lastCombo) return telegram(env, "sendMessage", { chat_id: chat.id, text: "Cast and seal your technique first with /cast." });
    const opponentArg = args.join(" ");
    if (!opponentArg) return telegram(env, "sendMessage", { chat_id: chat.id, text: `Paste an opponent combo or player ID after /duel, for example:\n/duel 👊🏻🖖🏻${FINISHER}` });

    let opponent = opponentArg;
    let opponentPlayer = "";
    if (!opponentArg.endsWith(FINISHER)) {
      const rival = await callWorkerJson(request, `/stats?id=${encodeURIComponent(opponentArg)}`);
      const signature = rival.data.signature_jutsu?.[0];
      if (!signature?.combo) return telegram(env, "sendMessage", { chat_id: chat.id, text: "That player has no saved signature jutsu yet. Paste a combo instead." });
      opponent = signature.combo;
      opponentPlayer = opponentArg;
    }

    const duel = await callWorkerJson(request, `/simulate?combo=${encodeURIComponent(session.lastCombo)}&opponent=${encodeURIComponent(opponent)}&playerA=${encodeURIComponent(session.playerId)}&playerB=${encodeURIComponent(opponentPlayer)}`);
    return telegram(env, "sendMessage", { chat_id: chat.id, text: duel.ok ? `Duel result: ${duel.data.winner}\n${duel.data.combo.name} vs ${duel.data.opponent.name}\n${duel.data.rounds.map(r => `${r.attacker}: ${r.damage}`).join("\n")}` : `Duel failed: ${duel.data.error}` });
  }

  return telegram(env, "sendMessage", { chat_id: chat.id, text: "Unknown command. Try /help." });
}

export async function handleTelegramConfig(request, env) {
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
  const config = { token, webhookSecret, updatedAt: new Date().toISOString() };
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
    message: "Telegram bot token saved and webhook configured. The token is not returned."
  });
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
    else if (update.message) await handleMessage(request, env, update.message);
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) await telegram(env, "sendMessage", { chat_id: chatId, text: `Bot error: ${error.message}` });
    return json({ ok: false, error: error.message }, 200);
  }
}
