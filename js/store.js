// Estado de la app guardado en IndexedDB del dispositivo.
import { DEFAULT_EXERCISES, normName } from "./exercises.js";
import { visibleOn } from "./logic.js";
import * as db from "./db.js";

const LEGACY_KEY = "habits.v1";
const KEY = "state";
const VERSION = 3;
const listeners = new Set();

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// --- Fechas (siempre en hora local, formato YYYY-MM-DD) ---
export const dateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
// Lunes = 0 … Domingo = 6
export const weekday = (k) => (parseKey(k).getDay() + 6) % 7;
export const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];
export const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// kind: "check" (casilla) | "amount" (cantidad con objetivo).
// role: qué lo enlaza con el resto de la app: "kcal" y "protein" (objetivos del plan, tipo cantidad);
//       "sleep", "gym" y "weigh" (se marcan solos con la Fitbit, un entreno o el peso apuntado).
// perWeek: si tiene valor, el hábito es «N veces por semana» y `days` no se usa.
// since: día en que se creó; antes no cuenta (así un hábito nuevo no baja el historial).
export const newHabit = (name = "", detail = "", extra = {}) => ({
  id: uid(), name, detail, kind: "check", target: null, unit: "", quick: [], role: null,
  days: [...ALL_DAYS], perWeek: null, remind: null, active: true, since: dateKey(), ...extra,
});

function defaults() {
  return {
    version: VERSION,
    habits: [
      newHabit("Creatina", "5 g", { remind: "14:00" }),
      newHabit("Omega-3", "2 perlas con comida", { remind: "14:00" }),
      newHabit("Proteína", "", { kind: "amount", role: "protein", target: 175, unit: "g", quick: [20, 30, 40, 50] }),
      newHabit("Calorías", "", { kind: "amount", role: "kcal", target: 4200, unit: "kcal", quick: [300, 500, 800] }),
      newHabit("Batido casero", "100 g avena + 40 g whey + leche", { remind: "21:30" }),
      newHabit("Ashwagandha", "1 cápsula por la noche"),
      newHabit("Agua", "", { kind: "amount", target: 3, unit: "L", quick: [0.5, 1] }),
      newHabit("Dormir", "", { role: "sleep", target: 8 }),
      newHabit("Pesarse", "En ayunas", { role: "weigh", days: [0, 2, 4], remind: "08:00" }),
    ],
    checks: {},
    amounts: {},
    skips: {},
    plan: {
      carbs: 600,
      fat: 90,
      lastAdjust: null,
      notes:
        "Batido casero: 100 g de harina de avena + 40 g de whey + 400 ml de leche (~600 kcal, ~50 g de proteína).\n" +
        "Whey: 30–40 g, 1–2 batidos para llegar a la proteína.\n" +
        "Objetivo: subir 0,5–1 kg al mes. Pésate en ayunas 3–4 días por semana.",
    },
    templates: [],
    sessions: [],
    exercises: {},
    body: [],
    health: {},
    ui: { weeklyDismissed: null },
    backup: { lastExport: null, cloud: false, lastCloud: null },
    google: null,
    push: { enabled: false, clientId: uid(), clientKey: uid() + uid() },
  };
}

function migrate(s) {
  const d = defaults();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  if ((s.version || 1) < 2) {
    for (const ses of s.sessions) {
      ses.startedAt ??= null;
      ses.finishedAt ??= null;
      for (const e of ses.exercises) for (const x of e.sets) {
        x.done ??= Number(x.reps) > 0;
        x.warmup ??= false;
      }
    }
    s.version = 2;
  }
  if (s.version < 3) toV3(s);
  return s;
}

// v3: hábitos de cantidad y con rol, recordatorios dentro de cada hábito y suplementos fusionados.
function toV3(s) {
  const p = s.plan || {};
  const norm = (x) => x.trim().toLowerCase();
  for (const x of s.habits) {
    const base = newHabit();
    for (const k of ["kind", "target", "unit", "quick", "role", "perWeek", "remind"]) x[k] ??= base[k];
  }
  const byName = (n) => s.habits.find((x) => norm(x.name) === n);

  const protein = s.habits.find((x) => x.id === p.proteinHabitId) || byName("proteína");
  if (protein) {
    Object.assign(protein, { kind: "amount", role: "protein", target: p.protein ?? 175, unit: "g", quick: [20, 30, 40, 50], detail: "" });
    for (const [k, list] of Object.entries(s.protein || {})) if (list.length) (s.amounts[k] ||= {})[protein.id] = [...list];
  }
  const kcal = byName("calorías");
  if (kcal) Object.assign(kcal, { kind: "amount", role: "kcal", target: p.kcal ?? 4200, unit: "kcal", quick: [300, 500, 800], detail: "" });
  const water = byName("agua");
  if (water && !water.role) Object.assign(water, { kind: "amount", target: 3, unit: "L", quick: [0.5, 1], detail: "" });
  const sleep = byName("dormir");
  if (sleep && !sleep.role) Object.assign(sleep, { role: "sleep", target: 8 });

  // Cada recordatorio pasa a ser la hora de aviso de sus hábitos; el de pesarse, un hábito propio.
  for (const r of s.reminders || []) {
    if (!r.active) continue;
    for (const id of r.habitIds) {
      const x = s.habits.find((y) => y.id === id);
      if (x && !x.remind) x.remind = r.time;
    }
    if (r.weigh && !s.habits.some((x) => x.role === "weigh")) {
      s.habits.push(newHabit("Pesarse", "En ayunas", { role: "weigh", days: [...r.days], remind: r.time }));
    } else if (!r.weigh && !r.habitIds.length) {
      s.habits.push(newHabit(r.title, "", { days: [...r.days], remind: r.time }));
    }
  }

  // Los suplementos que ya son hábito se quedan como hábito; el resto pasa a las notas.
  const first = (x) => norm(x).split(/[\s(]/)[0];
  const extra = (p.supplements || []).filter((x) => x.name.trim() && !s.habits.some((y) => first(y.name) === first(x.name)));
  let notes = p.notes || "";
  if (extra.length) notes = [notes, "Suplementos:", ...extra.map((x) => `- ${[x.name, x.dose, x.when].filter(Boolean).join(" · ")}`)].filter(Boolean).join("\n");

  s.plan = { carbs: p.carbs ?? 600, fat: p.fat ?? 90, notes, lastAdjust: null };
  delete s.protein;
  delete s.reminders;
  s.version = 3;
}

export let state = null;
let writing = Promise.resolve();

function write() {
  writing = writing.catch(() => {}).then(() => db.set(KEY, state));
  return writing;
}

// Carga el estado. La primera vez trae los datos de la versión con localStorage.
export async function init() {
  let s = null;
  try {
    s = await db.get(KEY);
  } catch (e) {
    console.error("No se pudo leer IndexedDB", e);
  }
  const legacy = !s && localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try { s = JSON.parse(legacy); } catch (e) { console.error("No se pudo leer el estado antiguo", e); }
  }
  state = migrate(s || defaults());
  try {
    await write();
    if (legacy) localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.error("No se pudo guardar el estado", e);
  }
}

// Vuelve a leer el estado (el service worker puede haberlo cambiado desde una notificación).
export async function reload() {
  await writing.catch(() => {});
  const s = await db.get(KEY);
  if (s) state = migrate(s);
}

export function save() {
  write().catch((e) => console.error("No se pudo guardar", e));
  for (const fn of listeners) fn(state);
}

export async function wipe() {
  await writing.catch(() => {});
  await db.del(KEY);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

// Lo que es de este dispositivo (permiso de Google, avisos, copia) no se exporta.
export function exportJSON() {
  const { google, push, backup, ...rest } = state;
  return JSON.stringify({ ...rest, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.habits) || typeof data.checks !== "object") {
    throw new Error("El archivo no es una copia de Habits.");
  }
  delete data.exportedAt;
  data.google = state.google;
  data.push = state.push;
  data.backup = state.backup;
  replaceState(data);
}

// --- Hábitos del día ---
export const habitsForDay = (k) => state.habits.filter((x) => visibleOn(state, x, k));
export const roleHabit = (role) => state.habits.find((x) => x.role === role) || null;

export const isChecked = (k, id) => (state.checks[k] || []).includes(id);
export const isSkipped = (k, id) => (state.skips[k] || []).includes(id);

function toggleIn(map, k, id, on) {
  const list = new Set(map[k] || []);
  (on ?? !list.has(id)) ? list.add(id) : list.delete(id);
  if (list.size) map[k] = [...list];
  else delete map[k];
}

export function toggleCheck(k, id) {
  toggleIn(state.checks, k, id);
  save();
}

export function setSkips(k, ids, on) {
  for (const id of ids) toggleIn(state.skips, k, id, on);
  save();
}

export function addAmount(k, id, value) {
  ((state.amounts[k] ||= {})[id] ||= []).push(value);
  save();
}

export function undoAmount(k, id) {
  const day = state.amounts[k];
  day?.[id]?.pop();
  if (day?.[id]?.length === 0) delete day[id];
  if (day && !Object.keys(day).length) delete state.amounts[k];
  save();
}

// Aplica el consejo de calorías y recuerda cuándo, para no repetirlo hasta que el peso reaccione.
export function applyKcal(next, today) {
  const x = roleHabit("kcal");
  if (!x) return;
  state.plan.lastAdjust = { date: today, from: x.target, to: next };
  x.target = next;
  save();
}

export function bodyEntry(k) {
  return state.body.find((b) => b.date === k);
}

export function setBody(k, weight, fat) {
  const i = state.body.findIndex((b) => b.date === k);
  const entry = { date: k, weight: weight ?? null, fat: fat ?? null };
  if (entry.weight == null && entry.fat == null) {
    if (i >= 0) state.body.splice(i, 1);
  } else if (i >= 0) state.body[i] = entry;
  else state.body.push(entry);
  state.body.sort((a, b) => a.date.localeCompare(b.date));
  save();
}

// --- Biblioteca de ejercicios: valores por defecto + cambios del usuario ---
export function exerciseInfo(name) {
  const n = normName(name);
  const base = DEFAULT_EXERCISES.find((e) => normName(e.name) === n) || { name: name.trim(), group: null, rest: 90, step: 2.5 };
  return { note: "", ...base, ...(state.exercises[n] || {}) };
}

export function setExerciseInfo(name, patch) {
  const n = normName(name);
  state.exercises[n] = { ...(state.exercises[n] || {}), ...patch };
  save();
}

export function knownExerciseNames() {
  const names = new Map(DEFAULT_EXERCISES.map((e) => [normName(e.name), e.name]));
  for (const t of state.templates) for (const e of t.exercises) names.set(normName(e.name), e.name);
  for (const s of state.sessions) for (const e of s.exercises) names.set(normName(e.name), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
}
