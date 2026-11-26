// Notificaciones push: la app registra el móvil en el Worker, le envía los horarios
// y le dice qué hábitos llevas hechos hoy para que no avise de lo ya marcado.
import { CONFIG } from "./config.js";
import { state, save, dateKey, bodyEntry } from "./store.js";

export const isConfigured = () => Boolean(CONFIG.workerUrl && CONFIG.vapidPublicKey);
export const isSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const headers = () => ({
  "Content-Type": "application/json",
  "X-Client-Id": state.push.clientId,
  "X-Client-Key": state.push.clientKey,
});

async function call(method, path, body) {
  const res = await fetch(CONFIG.workerUrl + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status} del servidor`);
  }
  return res.json().catch(() => ({}));
}

function vapidKey() {
  const b64 = CONFIG.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enable() {
  if (!isSupported()) throw new Error("Este navegador no admite notificaciones push. En Android, usa Chrome con la app instalada.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Has bloqueado las notificaciones. Actívalas en los ajustes del sitio en Chrome.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() });
  await call("POST", "/register", { subscription: sub.toJSON() });
  state.push.enabled = true;
  save();
  await syncSchedule();
  await syncState();
}

export async function disable() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  state.push.enabled = false;
  save();
  await call("DELETE", "/register").catch(() => {});
}

export const sendTest = () => call("POST", "/test");

export async function syncSchedule() {
  if (!state.push.enabled) return;
  await call("PUT", "/schedule", {
    reminders: state.reminders.map(({ id, title, time, days, habitIds, weigh, active }) => ({ id, title, time, days, habitIds, weigh, active })),
    habitNames: Object.fromEntries(state.habits.map((x) => [x.id, x.name])),
  });
}

export async function syncState() {
  if (!state.push.enabled) return;
  const today = dateKey();
  await call("PUT", "/state", {
    date: today,
    done: state.checks[today] || [],
    weighed: bodyEntry(today)?.weight != null,
    consentAt: state.google?.refreshToken && !state.google.expired ? state.google.consentAt : null,
  });
}

// Envía el estado poco después del último cambio; si falla (sin red), lo reintenta al volver la conexión.
let timer = null;
let pending = false;
export function queueStateSync() {
  if (!state.push.enabled) return;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}
async function flush() {
  if (!pending) return;
  try {
    await syncState();
    pending = false;
  } catch {
    /* se reintenta con el evento online o al abrir la app */
  }
}
addEventListener("online", flush);
