// Estado de la app guardado en localStorage del dispositivo.
const KEY = "habits.v1";
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

function defaults() {
  const h = (name, detail, days = ALL_DAYS) => ({ id: uid(), name, detail, days: [...days], active: true });
  const habits = [
    h("Creatina", "5 g"),
    h("Omega-3", "2 perlas con comida"),
    h("Proteína", "170–180 g"),
    h("Calorías", "~4.200 kcal"),
    h("Batido casero", "100 g avena + 40 g whey + leche"),
    h("Ashwagandha", "1 cápsula por la noche"),
    h("Agua", "3–4 L"),
    h("Dormir", "8 h o más"),
  ];
  const byName = (n) => habits.find((x) => x.name === n).id;
  return {
    version: 1,
    habits,
    checks: {},
    reminders: [
      { id: uid(), title: "Creatina y omega-3", time: "14:00", days: [...ALL_DAYS], habitIds: [byName("Creatina"), byName("Omega-3")], weigh: false, active: true },
      { id: uid(), title: "Batido post-entreno", time: "21:30", days: [...ALL_DAYS], habitIds: [byName("Batido casero")], weigh: false, active: true },
      { id: uid(), title: "Pesarse en ayunas", time: "08:00", days: [0, 2, 4], habitIds: [], weigh: true, active: true },
    ],
    plan: {
      kcal: 4200,
      protein: 175,
      carbs: 600,
      fat: 90,
      supplements: [
        { id: uid(), name: "Creatina monohidrato", dose: "5 g", when: "Cualquier hora, todos los días" },
        { id: uid(), name: "Omega-3 (Ultra TG)", dose: "2 perlas", when: "Con una comida" },
        { id: uid(), name: "Whey (Evowhey)", dose: "30–40 g", when: "1–2 batidos para llegar a la proteína" },
        { id: uid(), name: "Ashwagandha", dose: "1 cápsula", when: "Por la noche" },
      ],
      notes:
        "Batido casero: 100 g de harina de avena + 40 g de whey + 400 ml de leche (~600 kcal, ~50 g de proteína).\n" +
        "Objetivo: subir 0,5–1 kg al mes. Pésate en ayunas 3–4 días por semana.",
    },
    templates: [],
    sessions: [],
    body: [],
    health: {},
    google: null,
    push: { enabled: false, clientId: uid(), clientKey: uid() + uid() },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error("No se pudo leer el estado", e);
  }
  return defaults();
}

function migrate(s) {
  const d = defaults();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  return s;
}

export let state = load();

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const fn of listeners) fn(state);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

export function exportJSON() {
  // Los tokens de Google no se exportan: se vuelven a pedir al conectar.
  const { google, ...rest } = state;
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
  replaceState(data);
}

// --- Consultas habituales ---
export const habitsForDay = (k) =>
  state.habits.filter((h) => h.active && h.days.includes(weekday(k)));

export const isChecked = (k, id) => (state.checks[k] || []).includes(id);

export function toggleCheck(k, id) {
  const list = new Set(state.checks[k] || []);
  list.has(id) ? list.delete(id) : list.add(id);
  state.checks[k] = [...list];
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
