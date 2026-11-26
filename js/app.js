import { h, toast } from "./ui.js";
import { onChange, state } from "./store.js";
import * as health from "./health.js";
import * as push from "./push.js";
import { renderToday } from "./views/today.js";
import { renderRoutine, renderSession } from "./views/routine.js";
import { renderProgress } from "./views/progress.js";
import { renderPlan } from "./views/plan.js";
import { renderSettings } from "./views/settings.js";

const TABS = [
  { path: "hoy", label: "Hoy", icon: "M4 12l5 5L20 6" },
  { path: "rutina", label: "Rutina", icon: "M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" },
  { path: "progreso", label: "Progreso", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { path: "plan", label: "Plan", icon: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3" },
  { path: "ajustes", label: "Ajustes", icon: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },
];

const main = document.getElementById("main");
const nav = document.getElementById("tabs");

const ctx = {
  params: {},
  installPrompt: null,
  go: (hash) => { if (location.hash === hash) render(); else location.hash = hash; },
  rerender: () => render(true),
};

function route() {
  const [, page = "hoy", arg] = (location.hash || "#/hoy").split("/");
  if (page === "entreno") return { tab: "rutina", view: renderSession, params: { id: arg } };
  if (page === "hoy") return { tab: "hoy", view: renderToday, params: { day: arg } };
  const map = { rutina: renderRoutine, progreso: renderProgress, plan: renderPlan, ajustes: renderSettings };
  return map[page] ? { tab: page, view: map[page], params: {} } : { tab: "hoy", view: renderToday, params: {} };
}

let lastKey = "";
function render(keepScroll = false) {
  const r = route();
  ctx.params = r.params;
  const y = scrollY;
  main.replaceChildren(r.view(ctx));
  const key = location.hash;
  if (keepScroll || key === lastKey) scrollTo(0, y);
  else scrollTo(0, 0);
  lastKey = key;
  for (const a of nav.querySelectorAll("a")) {
    const on = a.dataset.tab === r.tab;
    a.classList.toggle("on", on);
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  }
}

function buildNav() {
  nav.replaceChildren(...TABS.map((t) => {
    const a = h("a", { href: `#/${t.path}`, "data-tab": t.path });
    a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${t.icon}"/></svg>`;
    a.append(h("span", {}, t.label));
    return a;
  }));
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

async function start() {
  buildNav();
  addEventListener("hashchange", () => render());
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    ctx.installPrompt = e;
    if (route().tab === "ajustes") render(true);
  });
  onChange(() => push.queueStateSync());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker no registrado", e));
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

  if (push.isConfigured()) push.syncState().catch(() => {});
  syncHealthIfStale();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      render(true);
      syncHealthIfStale();
    }
  });
}

start();
