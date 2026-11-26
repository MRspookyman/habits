// Service worker (módulo): funciona sin conexión, muestra las notificaciones push,
// marca hábitos desde el botón «Hecho» y avisa del fin del descanso con la app en segundo plano.
import * as db from "./js/db.js";
import { CONFIG } from "./js/config.js";

const VERSION = "habits-v7";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "css/dark.css",
  "js/theme.js",
  "assets/sierra.webp",
  "assets/estudio.webp",
  "js/app.js",
  "js/icons.js",
  "js/config.js",
  "js/db.js",
  "js/backup.js",
  "js/logic.js",
  "js/exercises.js",
  "js/timer.js",
  "js/views/shared.js",
  "js/store.js",
  "js/ui.js",
  "js/charts.js",
  "js/health.js",
  "js/push.js",
  "js/views/today.js",
  "js/views/calendar.js",
  "js/views/habits.js",
  "js/views/routine.js",
  "js/views/progress.js",
  "js/views/settings.js",
  "fonts/dm-sans.woff2",
  "fonts/instrument-serif.woff2",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/badge-96.png",
];
const ICON = "icons/icon-192.png";
const BADGE = "icons/badge-96.png";

// Se descarga saltando la caché HTTP para no mezclar archivos de versiones distintas.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("habits-v") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Archivos de la app: primero red, revalidando siempre con el servidor (cache: "no-cache"),
// para que todos los módulos sean de la misma versión; sin red, la copia guardada.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.mode === "navigate" ? e.request.url : e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  const ids = Array.isArray(data.habitIds) ? data.habitIds : [];
  e.waitUntil(
    self.registration.showNotification(data.title || "Habits", {
      body: data.body || "",
      tag: data.tag || "habits",
      renotify: true,
      icon: ICON,
      badge: BADGE,
      actions: ids.length && data.date ? [{ action: "done", title: "Hecho ✓" }] : [],
      data: { url: data.url || "./#/hoy", habitIds: ids, date: data.date || null },
    }),
  );
});

const windows = () => self.clients.matchAll({ type: "window", includeUncontrolled: true });

// Marca los hábitos en los datos de la app y se lo cuenta a la app abierta y al Worker.
async function markDone({ date, habitIds }) {
  let push = null;
  await db.update("state", (s) => {
    if (!s) return undefined;
    const list = new Set(s.checks[date] || []);
    for (const id of habitIds) list.add(id);
    s.checks[date] = [...list];
    push = s.push;
    return s;
  });
  for (const c of await windows()) c.postMessage({ type: "state-changed" });
  if (push?.enabled && CONFIG.workerUrl) {
    await fetch(`${CONFIG.workerUrl}/done`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Id": push.clientId, "X-Client-Key": push.clientKey },
      body: JSON.stringify({ date, ids: habitIds }),
    }).catch(() => {});
  }
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  if (e.action === "done" && data.habitIds?.length) {
    e.waitUntil(markDone(data));
    return;
  }
  const target = new URL(data.url || "./#/hoy", self.registration.scope).href;
  e.waitUntil(
    windows().then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Temporizador de descanso: la app manda { type: "rest", endAt, label, url } (endAt null = cancelar).
// El evento se mantiene vivo hasta el final del descanso y, si la app no está a la vista, avisa.
let rest = null;
function cancelRest() {
  if (!rest) return;
  clearTimeout(rest.timer);
  rest.resolve();
  rest = null;
}

self.addEventListener("message", (e) => {
  if (e.data?.type !== "rest") return;
  cancelRest();
  const { endAt, label, url } = e.data;
  if (!endAt) return;
  e.waitUntil(new Promise((resolve) => {
    const fire = async () => {
      rest = null;
      const visible = (await windows()).some((c) => c.visibilityState === "visible");
      if (!visible) {
        await self.registration.showNotification("Descanso terminado", {
          body: `A por la siguiente serie · ${label}`,
          tag: "rest",
          renotify: true,
          vibrate: [300, 150, 300],
          icon: ICON,
          badge: BADGE,
          data: { url: url || "./#/rutina" },
        });
      }
      resolve();
    };
    rest = { resolve, timer: setTimeout(fire, Math.max(0, endAt - Date.now())) };
  }));
});
