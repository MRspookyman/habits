// Notificaciones push: la app registra el móvil en el Worker, le envía las horas de aviso
// de cada hábito y le dice qué hábitos están ya resueltos hoy para que no avise de ellos.
import { CONFIG } from "./config.js";
import { state, save, dateKey, weekday } from "./store.js";
import { habitDone, isSkippedOn, doneInWeek } from "./logic.js";

export const isConfigured = () => Boolean(CONFIG.workerUrl && CONFIG.vapidPublicKey);
export const isSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const headers = (creds) => ({
  "Content-Type": "application/json",
  "X-Client-Id": creds.clientId,
  "X-Client-Key": creds.clientKey,
});

// Llamada al Worker con las credenciales de este dispositivo (o las de un código de recuperación).
export async function call(method, path, body, creds = state.push) {
  const res = await fetch(CONFIG.workerUrl + path, { method, headers: headers(creds), body: body ? JSON.stringify(body) : undefined });
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

// Un aviso por hora y día de la semana con todos los hábitos que tienen esa hora.
// markIds: los que se pueden marcar con el botón «Hecho» de la notificación (los de casilla).
export function buildReminders(habits) {
  const groups = new Map();
  for (const x of habits) {
    if (!x.active || !x.remind) continue;
    for (const d of x.perWeek ? [0, 1, 2, 3, 4, 5, 6] : x.days) {
      const key = `${x.remind}|${d}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(x);
    }
  }
  return [...groups].map(([key, list]) => {
    const [time, d] = key.split("|");
    return {
      id: `${time.replace(":", "")}-${d}`,
      title: list.length === 1 ? list[0].name : `Hábitos de las ${time}`,
      time,
      days: [Number(d)],
      habitIds: list.map((x) => x.id),
      markIds: list.filter((x) => x.kind === "check").map((x) => x.id),
      active: true,
    };
  });
}

export async function syncSchedule() {
  if (!state.push.enabled) return;
  await call("PUT", "/schedule", {
    reminders: buildReminders(state.habits),
    habitNames: Object.fromEntries(state.habits.map((x) => [x.id, x.name])),
  });
}

// Hábitos de los que no hay que avisar hoy: hechos, omitidos, que no tocan o con la semana ya cumplida.
function resolvedToday(today) {
  const wd = weekday(today);
  return state.habits.filter((x) =>
    habitDone(state, x, today) || isSkippedOn(state, x, today) ||
    (x.perWeek ? doneInWeek(state, x, today, false) >= x.perWeek : !x.days.includes(wd)),
  ).map((x) => x.id);
}

export async function syncState() {
  if (!state.push.enabled) return;
  const today = dateKey();
  await call("PUT", "/state", {
    date: today,
    done: resolvedToday(today),
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
