// Temporizador de descanso, reloj del entreno y pantalla encendida.
import { h } from "./ui.js";

const KEY = "habits.rest";
let rest = JSON.parse(sessionStorage.getItem(KEY) || "null"); // { endAt, total, label, notified }
let bar = null;
let audio = null;
let wakeLock = null;
let wantAwake = false;

const persist = () => (rest ? sessionStorage.setItem(KEY, JSON.stringify(rest)) : sessionStorage.removeItem(KEY));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

// El sonido necesita un AudioContext creado tras un toque del usuario.
function primeAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { audio = null; }
}

function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  for (const [i, f] of [[0, 880], [0.22, 880], [0.44, 1320]]) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + i);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + i + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(t0 + i);
    o.stop(t0 + i + 0.2);
  }
}

let parts = null;
function ensureBar() {
  if (bar) return bar;
  parts = {
    fill: h("div", { class: "rt-fill" }),
    time: h("span", { class: "rt-time" }),
    label: h("span", { class: "rt-label" }),
    minus: h("button", { class: "btn small ghost", onClick: () => adjust(-15), "aria-label": "Quitar 15 segundos" }, "−15"),
    plus: h("button", { class: "btn small ghost", onClick: () => adjust(15), "aria-label": "Añadir 15 segundos" }, "+15"),
    close: h("button", { class: "btn small", onClick: stop }),
  };
  bar = h("div", { id: "rest-timer", role: "timer", hidden: true },
    parts.fill,
    h("div", { class: "rt-body" }, h("div", { class: "rt-text" }, parts.time, parts.label), parts.minus, parts.plus, parts.close),
  );
  document.body.append(bar);
  return bar;
}

function draw() {
  const el = ensureBar();
  if (!rest) {
    el.hidden = true;
    document.body.classList.remove("has-timer");
    return;
  }
  el.hidden = false;
  document.body.classList.add("has-timer");
  const left = Math.max(0, (rest.endAt - Date.now()) / 1000);
  const doneNow = left <= 0;
  el.classList.toggle("done", doneNow);
  parts.fill.style.transform = `scaleX(${doneNow ? 1 : 1 - left / rest.total})`;
  parts.time.textContent = doneNow ? "¡A por la siguiente!" : mmss(Math.ceil(left));
  parts.label.textContent = doneNow ? "Descanso terminado" : `Descanso · ${rest.label}`;
  parts.minus.hidden = parts.plus.hidden = doneNow;
  parts.close.textContent = doneNow ? "Cerrar" : "Saltar";
}

function tick() {
  for (const el of document.querySelectorAll("[data-since]")) {
    const s = (Date.now() - Number(el.dataset.since)) / 1000;
    el.textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${mmss(s % 3600).padStart(5, "0")}` : mmss(s);
  }
  if (!rest) return;
  const left = (rest.endAt - Date.now()) / 1000;
  if (left <= 0 && !rest.notified) {
    rest.notified = true;
    persist();
    navigator.vibrate?.([300, 150, 300]);
    if (document.visibilityState === "visible") beep();
  }
  if (left < -20) stop();
  else draw();
}

export function start(seconds, label) {
  primeAudio();
  if (!(seconds > 0)) return;
  rest = { endAt: Date.now() + seconds * 1000, total: seconds, label, notified: false };
  persist();
  draw();
}

export function adjust(delta) {
  if (!rest) return;
  rest.endAt += delta * 1000;
  rest.total = Math.max(1, rest.total + delta);
  persist();
  draw();
}

export function stop() {
  rest = null;
  persist();
  draw();
}

async function lock() {
  if (!wantAwake || wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => (wakeLock = null));
  } catch { wakeLock = null; }
}

// Mantiene la pantalla encendida mientras haya un entreno abierto.
export function keepAwake(on) {
  wantAwake = on;
  if (on) lock();
  else if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    lock();
    tick();
  }
});
setInterval(tick, 250);
draw();
