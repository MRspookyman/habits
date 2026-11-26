import { h, toast } from "./ui.js";
import { icon } from "./icons.js";
import { init, reload, onChange, state } from "./store.js";
import * as health from "./health.js";
import * as push from "./push.js";
import * as backup from "./backup.js";
import { applyTheme } from "./theme.js";
import * as timer from "./timer.js";
import { renderToday, showCapture } from "./views/today.js";
import { renderRoutine, renderSession } from "./views/routine.js";
import { renderProgress } from "./views/progress.js";
import { renderSettings } from "./views/settings.js";
import { renderHabits } from "./views/habits.js";
import { editBody } from "./views/shared.js";

const TABS = [
  { path: "hoy", label: "Mi día", icon: "sun" },
  { path: "habitos", label: "Mis hábitos", short: "Hábitos", icon: "layers" },
  { path: "rutina", label: "Entrenamiento", short: "Entrenar", icon: "gym" },
  { path: "progreso", label: "Progreso", icon: "chart" },
];

const main = document.getElementById("main");

const ctx = {
  params: {},
  installPrompt: null,
  go: (hash) => { if (location.hash === hash) render(); else location.hash = hash; },
  rerender: () => render(true),
};

function route() {
  const [, page = "hoy", arg, mode] = (location.hash || "#/hoy").split("/");
  if (page === "entreno") return { tab: "rutina", view: renderSession, params: { id: arg, edit: mode === "editar" } };
  if (page === "hoy") return { tab: "hoy", view: renderToday, params: { day: arg } };
  if (page === "peso") return { tab: "hoy", view: renderToday, params: { focusWeight: true } };
  if (page === "plan") return { tab: "plan", view: renderSettings, params: { section: "plan" } };
  const map = { habitos: renderHabits, rutina: renderRoutine, progreso: renderProgress, ajustes: renderSettings };
  return map[page] ? { tab: page, view: map[page], params: { section: arg } } : { tab: "hoy", view: renderToday, params: {} };
}

let lastKey = "";
function render(keepScroll = false) {
  const r = route();
  if (keepScroll && r.tab === "plan" && main.querySelector(".plan-form[data-dirty]")) return;
  ctx.params = r.params;
  if (r.view !== renderSession) timer.keepAwake(false);
  const y = scrollY;
  const focusKey = document.activeElement?.dataset.focus;
  main.replaceChildren(r.view(ctx));
  document.title = (main.querySelector("h1")?.textContent || "Mi día") + " · Habits";
  const key = location.hash;
  if (keepScroll || key === lastKey) {
    if (focusKey) main.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    scrollTo(0, y);
  } else {
    if (lastKey && !document.querySelector("dialog[open]")) main.focus({ preventScroll: true });
    scrollTo(0, 0);
  }
  lastKey = key;
  for (const a of document.querySelectorAll("[data-tab]")) {
    const on = a.dataset.tab === r.tab || (r.tab === "plan" && a.closest("#mobile-head"));
    a.classList.toggle("on", on);
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  }
  if (r.params.focusWeight) {
    history.replaceState(null, "", "#/hoy");
    lastKey = location.hash;
    editBody(ctx);
  }
}

function buildNav() {
  const brand = () => h("a", { class: "brand", href: "#/hoy", "aria-label": "Habits, mi día" },
    h("img", { src: "icons/icon.svg", width: 40, height: 40, alt: "" }), h("span", {}, "Habits"));
  const link = (t, compact = false) => h("a", { class: "nav-link", href: "#/" + t.path, "data-tab": t.path },
    icon(t.icon, 21), h("span", {}, compact && t.short || t.label));
  const settings = { path: "ajustes", label: "Ajustes", icon: "settings" };
  document.getElementById("rail").replaceChildren(brand(),
    h("nav", { class: "primary-nav", "aria-label": "Navegación principal" }, TABS.map((t) => link(t))),
    h("div", { class: "rail-bottom" },
      link({ path: "plan", label: "Plan nutricional", icon: "leaf" }), link(settings),
      h("a", { class: "local-data", href: "#/ajustes/datos" }, h("span", { class: "local-dot" }), "Datos en este dispositivo", icon("right", 14))));
  const mobile = TABS.map((t) => link(t, true));
  mobile.splice(2, 0, h("button", { class: "nav-link nav-capture", "aria-haspopup": "dialog", onClick: () => showCapture(ctx) },
    h("span", { class: "capture-icon" }, icon("plus", 20)), h("span", {}, "Registrar")));
  document.getElementById("mobile-nav").replaceChildren(...mobile);
  document.getElementById("mobile-head").replaceChildren(brand(), h("a", { class: "icon-btn", href: "#/ajustes", "data-tab": "ajustes", "aria-label": "Ajustes" }, icon("settings")));
}

async function syncHealthIfStale() {
  if (!health.isConfigured() || !health.isConnected() || state.google.expired) return;
  if (Date.now() - (state.google.lastSync || 0) < 30 * 60 * 1000) return;
  try {
    const errors = await health.sync();
    if (errors.length) console.warn("Sincronización parcial", errors);
    render(true);
  } catch (e) {
    if (e instanceof health.ReconnectNeeded) {
      push.queueStateSync();
      render(true);
    } else console.warn("No se pudo sincronizar Google Health", e);
  }
}

// Relee los datos (una notificación puede haber marcado hábitos) y vuelve a pintar.
async function refresh() {
  try { await reload(); } catch (e) { console.warn("No se pudo releer el estado", e); }
  render(true);
}

async function start() {
  applyTheme();
  await init();
  // Pide al navegador que no borre los datos aunque falte espacio.
  navigator.storage?.persist?.().catch(() => {});
  buildNav();
  document.querySelector(".skip").addEventListener("click", (e) => {
    e.preventDefault();
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: "start" });
  });
  addEventListener("hashchange", () => render());
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    ctx.installPrompt = e;
    if (route().tab === "ajustes") render(true);
  });
  onChange(() => push.queueStateSync());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { type: "module" }).catch((e) => console.warn("Service worker no registrado", e));
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "state-changed") refresh();
    });
  }

  render();

  const msg = await health.handleRedirect();
  if (msg) {
    toast(msg.text, msg.ok ? "info" : "error");
    if (msg.ok) {
      location.hash = "#/ajustes";
      push.queueStateSync();
      try { await health.sync(); } catch (e) { console.warn(e); }
    }
    render(true);
  }

  if (push.isConfigured()) {
    push.syncSchedule().catch(() => {});
    push.syncState().catch(() => {});
  }
  syncHealthIfStale();
  backup.autoUpload();
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    await refresh();
    syncHealthIfStale();
    backup.autoUpload();
  });
}

start();
