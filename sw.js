// Service worker: funciona sin conexión y muestra las notificaciones push.
const VERSION = "habits-v3";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/config.js",
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
  "js/views/routine.js",
  "js/views/progress.js",
  "js/views/plan.js",
  "js/views/settings.js",
  "fonts/barlow-400.woff2",
  "fonts/barlow-500.woff2",
  "fonts/barlow-600.woff2",
  "fonts/barlowcond-600.woff2",
  "fonts/barlowcond-800.woff2",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/badge-96.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Archivos de la app: primero red (para recibir actualizaciones), si no hay red, la copia guardada.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
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
  e.waitUntil(
    self.registration.showNotification(data.title || "Habits", {
      body: data.body || "",
      tag: data.tag || "habits",
      renotify: true,
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      data: { url: data.url || "./#/hoy" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "./#/hoy", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
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
