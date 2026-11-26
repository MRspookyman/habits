// Servidor de Habits (Cloudflare Worker).
// 1) Envía los recordatorios push a su hora (hora de Madrid), saltándose los ya marcados.
// 2) Canjea y renueva el permiso de Google Health con la clave secreta, sin guardarlo.
// 3) Reenvía las peticiones de datos a health.googleapis.com.
// 4) Avisa cuando caduca el permiso semanal de Google.
import { sendPush } from "./webpush.js";

const TZ = "Europe/Madrid";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const HEALTH_API = "https://health.googleapis.com/v4/";
const CONSENT_MS = 7 * 86400000;
const CONSENT_WARN_BEFORE_MS = 12 * 3600000;

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(req, env) {
  const origin = req.headers.get("Origin");
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Id, X-Client-Key, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins(env).includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });

async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const vapid = (env) => ({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });

// --- Usuarios (uno por dispositivo) en KV ---
async function userIds(env) {
  return (await env.HABITS.get("users", "json")) || [];
}
async function setUserIds(env, ids) {
  await env.HABITS.put("users", JSON.stringify([...new Set(ids)]));
}
const userKey = (id) => `user:${id}`;

async function authUser(req, env, { create = false } = {}) {
  const id = req.headers.get("X-Client-Id");
  const key = req.headers.get("X-Client-Key");
  if (!id || !key || id.length > 64 || key.length > 128) return { error: "Faltan credenciales del dispositivo", status: 401 };
  const hash = await sha256(key);
  const user = await env.HABITS.get(userKey(id), "json");
  if (user && user.keyHash !== hash) return { error: "Credenciales no válidas", status: 403 };
  if (!user && !create) return { error: "Dispositivo no registrado: activa los avisos de nuevo", status: 404 };
  return { id, user: user || { keyHash: hash, reminders: [], habitNames: {}, state: null, createdAt: Date.now() } };
}

// --- Hora local de Madrid ---
function madridNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, hour: Number(parts.hour), wd };
}

// Qué falta de un recordatorio. Devuelve null si no hay que avisar.
export function pendingFor(reminder, state, today, habitNames) {
  const fresh = state && state.date === today;
  const done = new Set(fresh ? state.done || [] : []);
  const weighed = fresh && state.weighed;
  const missing = reminder.habitIds.filter((id) => !done.has(id)).map((id) => habitNames[id]).filter(Boolean);
  if (reminder.weigh && !weighed) missing.push("pesarte");
  const tracked = reminder.habitIds.length > 0 || reminder.weigh;
  if (tracked && missing.length === 0) return null;
  return missing;
}

async function runSchedule(env, now = new Date()) {
  const t = madridNow(now);
  for (const id of await userIds(env)) {
    const user = await env.HABITS.get(userKey(id), "json");
    if (!user?.subscription) continue;
    const messages = [];
    for (const r of user.reminders || []) {
      if (!r.active || r.time !== t.hhmm || !r.days.includes(t.wd)) continue;
      const missing = pendingFor(r, user.state, t.date, user.habitNames || {});
      if (!missing) continue;
      messages.push({ title: r.title, body: missing.length ? `Te falta: ${missing.join(", ")}` : "Abre Habits y márcalo.", tag: `r-${r.id}`, url: "./#/hoy" });
    }
    const consentAt = user.state?.consentAt;
    if (consentAt && user.consentWarned !== consentAt && Date.now() >= consentAt + CONSENT_MS - CONSENT_WARN_BEFORE_MS && t.hour >= 9 && t.hour < 22) {
      messages.push({ title: "Google Health: vuelve a conectar", body: "El permiso semanal caduca. Abre Habits › Ajustes › Volver a conectar.", tag: "consent", url: "./#/ajustes" });
      user.consentWarned = consentAt;
      await env.HABITS.put(userKey(id), JSON.stringify(user));
    }
    for (const m of messages) {
      const status = await sendPush(user.subscription, m, vapid(env));
      if (status === 404 || status === 410) {
        delete user.subscription;
        await env.HABITS.put(userKey(id), JSON.stringify(user));
        break;
      }
    }
  }
}

// --- OAuth con Google ---
async function googleToken(env, params) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({ error: "bad_response" }));
  return { status: res.status, data };
}

async function readJSON(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function handle(req, env) {
  const h = cors(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/" && req.method === "GET") return json({ ok: true, service: "habits" }, 200, h);

  if (path === "/oauth/exchange" && req.method === "POST") {
    const b = await readJSON(req);
    if (!b?.code || !b?.codeVerifier || !b?.redirectUri) return json({ error: "invalid_request" }, 400, h);
    const okRedirect = allowedOrigins(env).some((o) => b.redirectUri === o + "/" || b.redirectUri.startsWith(o + "/"));
    if (!okRedirect) return json({ error: "invalid_redirect" }, 400, h);
    const { status, data } = await googleToken(env, { grant_type: "authorization_code", code: b.code, code_verifier: b.codeVerifier, redirect_uri: b.redirectUri });
    return json(data, status, h);
  }

  if (path === "/oauth/refresh" && req.method === "POST") {
    const b = await readJSON(req);
    if (!b?.refreshToken) return json({ error: "invalid_request" }, 400, h);
    const { status, data } = await googleToken(env, { grant_type: "refresh_token", refresh_token: b.refreshToken });
    return json(data, status, h);
  }

  if (path.startsWith("/health/")) {
    const rest = path.slice("/health/".length);
    if (!rest.startsWith("users/me/") || !["GET", "POST"].includes(req.method)) return json({ error: "not_allowed" }, 403, h);
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "missing_token" }, 401, h);
    const upstream = await fetch(HEALTH_API + rest + url.search, {
      method: req.method,
      headers: { Authorization: auth, Accept: "application/json", ...(req.method === "POST" ? { "Content-Type": "application/json" } : {}) },
      body: req.method === "POST" ? await req.text() : undefined,
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...h, "Content-Type": upstream.headers.get("Content-Type") || "application/json" } });
  }

  if (path === "/register" && req.method === "POST") {
    const a = await authUser(req, env, { create: true });
    if (a.error) return json({ error: a.error }, a.status, h);
    const b = await readJSON(req);
    const sub = b?.subscription;
    if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "Suscripción no válida" }, 400, h);
    a.user.subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    await env.HABITS.put(userKey(a.id), JSON.stringify(a.user));
    await setUserIds(env, [...(await userIds(env)), a.id]);
    return json({ ok: true }, 200, h);
  }

  if (path === "/register" && req.method === "DELETE") {
    const a = await authUser(req, env);
    if (a.error) return json({ error: a.error }, a.status, h);
    await env.HABITS.delete(userKey(a.id));
    await setUserIds(env, (await userIds(env)).filter((x) => x !== a.id));
    return json({ ok: true }, 200, h);
  }

  if (path === "/schedule" && req.method === "PUT") {
    const a = await authUser(req, env);
    if (a.error) return json({ error: a.error }, a.status, h);
    const b = await readJSON(req);
    if (!Array.isArray(b?.reminders) || b.reminders.length > 50) return json({ error: "Recordatorios no válidos" }, 400, h);
    a.user.reminders = b.reminders.map((r) => ({
      id: String(r.id).slice(0, 40),
      title: String(r.title || "Habits").slice(0, 80),
      time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : "09:00",
      days: (Array.isArray(r.days) ? r.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      habitIds: (Array.isArray(r.habitIds) ? r.habitIds : []).map(String).slice(0, 30),
      weigh: Boolean(r.weigh),
      active: r.active !== false,
    }));
    const names = {};
    for (const [k, v] of Object.entries(b.habitNames || {}).slice(0, 100)) names[String(k).slice(0, 40)] = String(v).slice(0, 60);
    a.user.habitNames = names;
    await env.HABITS.put(userKey(a.id), JSON.stringify(a.user));
    return json({ ok: true }, 200, h);
  }

  if (path === "/state" && req.method === "PUT") {
    const a = await authUser(req, env);
    if (a.error) return json({ error: a.error }, a.status, h);
    const b = await readJSON(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b?.date || "")) return json({ error: "Fecha no válida" }, 400, h);
    const next = {
      date: b.date,
      done: (Array.isArray(b.done) ? b.done : []).map(String).slice(0, 100),
      weighed: Boolean(b.weighed),
      consentAt: Number.isFinite(b.consentAt) ? b.consentAt : null,
    };
    if (JSON.stringify(next) !== JSON.stringify(a.user.state)) {
      a.user.state = next;
      await env.HABITS.put(userKey(a.id), JSON.stringify(a.user));
    }
    return json({ ok: true }, 200, h);
  }

  if (path === "/test" && req.method === "POST") {
    const a = await authUser(req, env);
    if (a.error) return json({ error: a.error }, a.status, h);
    if (!a.user.subscription) return json({ error: "Este dispositivo no tiene avisos activos" }, 400, h);
    const status = await sendPush(a.user.subscription, { title: "Habits", body: "Los avisos funcionan.", tag: "test", url: "./#/ajustes" }, vapid(env));
    if (status >= 300) return json({ error: `El servicio de avisos respondió ${status}` }, 502, h);
    return json({ ok: true }, 200, h);
  }

  return json({ error: "not_found" }, 404, h);
}

export default {
  fetch: (req, env) =>
    handle(req, env).catch((e) => json({ error: `Error del servidor: ${e.message}` }, 500, cors(req, env))),
  scheduled: (event, env, ctx) => ctx.waitUntil(runSchedule(env, new Date(event.scheduledTime))),
};
