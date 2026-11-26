// Conexión con Google Health (Fitbit Air). El permiso de Google se guarda solo en este
// dispositivo; el Worker únicamente añade la clave secreta al canjear o renovar el token
// y reenvía las peticiones de datos.
import { CONFIG, GOOGLE_SCOPES } from "./config.js";
import { state, save, dateKey, addDays } from "./store.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const PKCE_KEY = "habits.pkce";

export class ReconnectNeeded extends Error {}

export const isConfigured = () => Boolean(CONFIG.workerUrl && CONFIG.googleClientId);
export const isConnected = () => Boolean(state.google?.refreshToken);
const redirectUri = () => location.origin + location.pathname;

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function connect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const st = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state: st }));
  const params = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: st,
  });
  location.assign(`${AUTH_URL}?${params}`);
}

async function workerPost(path, body) {
  const res = await fetch(CONFIG.workerUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Error ${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

// Se llama al arrancar: si Google nos ha devuelto ?code=…, lo canjea por tokens.
// Devuelve un mensaje para mostrar, o null si no había nada que hacer.
export async function handleRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (!code && !error) return null;
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || "null");
  sessionStorage.removeItem(PKCE_KEY);
  history.replaceState(null, "", redirectUri() + url.hash);
  if (error) return { ok: false, text: `Google no dio permiso (${error}).` };
  if (!saved || saved.state !== url.searchParams.get("state")) {
    return { ok: false, text: "La respuesta de Google no corresponde a esta conexión. Vuelve a conectar." };
  }
  try {
    const tok = await workerPost("/oauth/exchange", { code, codeVerifier: saved.verifier, redirectUri: redirectUri() });
    if (!tok.refresh_token) throw new Error("Google no devolvió permiso de larga duración. Vuelve a conectar.");
    state.google = {
      accessToken: tok.access_token,
      expiresAt: Date.now() + (tok.expires_in - 60) * 1000,
      refreshToken: tok.refresh_token,
      scope: tok.scope || "",
      consentAt: Date.now(),
      expired: false,
      lastSync: null,
    };
    save();
    const linked = await checkIdentity();
    if (!linked.ok) return linked;
    return { ok: true, text: "Google Health conectado." };
  } catch (e) {
    return { ok: false, text: `No se pudo conectar con Google Health: ${e.message}` };
  }
}

export function disconnect() {
  state.google = null;
  save();
}

async function accessToken() {
  const g = state.google;
  if (!g?.refreshToken) throw new ReconnectNeeded("Conecta Google Health.");
  if (g.accessToken && Date.now() < g.expiresAt) return g.accessToken;
  try {
    const tok = await workerPost("/oauth/refresh", { refreshToken: g.refreshToken });
    g.accessToken = tok.access_token;
    g.expiresAt = Date.now() + (tok.expires_in - 60) * 1000;
    g.expired = false;
    save();
    return g.accessToken;
  } catch (e) {
    if (e.code === "invalid_grant") {
      g.expired = true;
      g.accessToken = null;
      save();
      throw new ReconnectNeeded("El permiso semanal de Google ha caducado. Vuelve a conectar.");
    }
    throw e;
  }
}

async function api(path, { method = "GET", body } = {}) {
  const token = await accessToken();
  const res = await fetch(`${CONFIG.workerUrl}/health/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Error ${res.status}`);
    err.status = res.status;
    err.reason = data.error?.details?.find((d) => d.reason)?.reason;
    throw err;
  }
  return data;
}

async function checkIdentity() {
  try {
    await api("users/me/identity");
    return { ok: true };
  } catch (e) {
    if (e.reason === "ACCOUNT_NOT_LINKED") {
      return { ok: false, text: "Tu cuenta de Google no está vinculada a Google Health. Abre la app Google Health en el móvil, inicia sesión con esta cuenta y vuelve a conectar." };
    }
    return { ok: false, text: `Conectado, pero Google Health respondió: ${e.message}` };
  }
}

const civil = (k) => {
  const [year, month, day] = k.split("-").map(Number);
  return { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } };
};
const keyFromCivil = (c) =>
  `${c.date.year}-${String(c.date.month).padStart(2, "0")}-${String(c.date.day).padStart(2, "0")}`;

async function dailyRollUp(type, from, toExclusive) {
  const data = await api(`users/me/dataTypes/${type}/dataPoints:dailyRollUp`, {
    method: "POST",
    body: { range: { start: civil(from), end: civil(toExclusive) }, windowSizeDays: 1 },
  });
  return data.rollupDataPoints || [];
}

async function listPoints(type, filter, pageSize) {
  const out = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ filter });
    if (pageSize) q.set("pageSize", String(pageSize));
    if (pageToken) q.set("pageToken", pageToken);
    const data = await api(`users/me/dataTypes/${type}/dataPoints?${q}`);
    out.push(...(data.dataPoints || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// Fecha local (según el desfase que da Google) del momento ISO `iso`.
function localKey(iso, offset) {
  const secs = parseInt(offset || "0", 10) || 0;
  const d = new Date(Date.parse(iso) + secs * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function put(k, field, value) {
  if (value == null || Number.isNaN(value)) return;
  state.health[k] = { ...(state.health[k] || {}), [field]: value };
}

// Trae los últimos 14 días (31 para el pulso en reposo, para calcular la media).
export async function sync() {
  const today = dateKey();
  const tomorrow = addDays(today, 1);
  const from14 = addDays(today, -13);
  const from31 = addDays(today, -30);
  const errors = [];

  const tasks = {
    steps: async () => {
      for (const p of await dailyRollUp("steps", from14, tomorrow)) {
        if (p.steps) put(keyFromCivil(p.civilStartTime), "steps", Number(p.steps.countSum));
      }
    },
    kcal: async () => {
      for (const p of await dailyRollUp("total-calories", from14, tomorrow)) {
        if (p.totalCalories) put(keyFromCivil(p.civilStartTime), "kcal", Math.round(Number(p.totalCalories.kcalSum)));
      }
    },
    sleep: async () => {
      const points = await listPoints("sleep", `sleep.interval.civil_end_time >= "${from14}"`, 25);
      const perDay = {};
      const sessions = points.map((p) => p.sleep).filter(Boolean);
      const main = sessions.filter((s) => s.metadata?.main !== false);
      for (const s of main.length ? main : sessions) {
        const k = localKey(s.interval.endTime, s.interval.endUtcOffset);
        perDay[k] = (perDay[k] || 0) + Number(s.summary?.minutesAsleep || 0);
      }
      for (const [k, v] of Object.entries(perDay)) put(k, "sleepMin", v);
    },
    rhr: async () => {
      let points;
      try {
        points = await listPoints("daily-resting-heart-rate", `daily_resting_heart_rate.date >= "${from31}"`);
      } catch (e) {
        if (e.status !== 400) throw e;
        points = await listPoints("daily-resting-heart-rate", `dailyRestingHeartRate.date >= "${from31}"`);
      }
      for (const p of points) {
        const r = p.dailyRestingHeartRate;
        if (r?.date) put(keyFromCivil({ date: r.date }), "rhr", Number(r.beatsPerMinute));
      }
    },
  };

  const names = { steps: "pasos", kcal: "kcal", sleep: "sueño", rhr: "pulso en reposo" };
  for (const [name, fn] of Object.entries(tasks)) {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ReconnectNeeded) throw e;
      errors.push(`${names[name]}: ${e.message}`);
    }
  }
  state.google.lastSync = Date.now();
  save();
  return errors;
}
