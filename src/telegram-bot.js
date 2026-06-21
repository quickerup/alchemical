const TELEGRAM_API = "https://api.telegram.org";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const FINISHER = "🙏🏻";
const GESTURE_CACHE = {
  values: null,
  loadedAt: 0
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function text(message, status = 200) {
  return new Response(message, { status });
}

function requireBotEnv(env) {
  if (!env?.TELEGRAM_BOT_TOKEN) return "Missing TELEGRAM_BOT_TOKEN secret";
  if (!env?.TELEGRAM_WEBHOOK_SECRET) return "Missing TELEGRAM_WEBHOOK_SECRET secret";
  if (!env?.BOT_SESSIONS) return "Missing BOT_SESSIONS KV binding";
  return null;
}

function verifyTelegramSecret(request, env) {
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.TELEGRAM_WEBHOOK_SECRET;
}

async function telegram(env, method, payload) {
  const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
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

async function callWorkerJson(request, path, init = {}) {
  const response = await fetch(workerUrl(request, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = await response.json();
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

async function ensurePlayer(request, env, chat) {
  const session = await getSession(env, chat.id);
  if (session.playerId) return session;

  const name = chat.username || chat.first_name || `telegram-${chat.id}`;
  const created = await callWorkerJson(request, "/player/create", {
    method: "POST",
    body: JSON.stringify({ username: name })
  });

  if (!created.ok) throw new Error(created.data?.error || "Could not create player");

  const next = { ...session, playerId: created.data.playerId, username: created.data.username };
  await saveSession(env, chat.id, next);
  return next;
}

async function loadGestures(request) {
  if (GESTURE_CACHE.values) return GESTURE_CACHE.values;
  const response = await fetch(workerUrl(request, "/gestures"));
  const data = await response.json();
  GESTURE_CACHE.values = Object.keys(data.gestures || {});
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
    await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: `Sealed: ${sealed}\n${lookup.data.name} (${lookup.data.rank})\nATK ${lookup.data.stats.atk} / DEF ${lookup.data.stats.def} / SPC ${lookup.data.stats.spc}`
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

export async function handleTelegramWebhook(request, env) {
  const missing = requireBotEnv(env);
  if (missing) return json({ error: missing }, 503);
  if (!verifyTelegramSecret(request, env)) return text("Unauthorized", 401);
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
