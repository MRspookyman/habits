// Reglas del plan. Funciones puras: reciben datos, no tocan el estado.

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shift(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
const inRange = (k, from, to) => KEY_RE.test(k) && k >= from && k <= to;

export function mean(xs) {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function valuesIn(body, field, from, to) {
  return body.filter((b) => inRange(b.date, from, to) && b[field] != null).map((b) => b[field]);
}

// % de hábitos programados que se marcaron, de `from` a `to` (incluidos).
export function compliance(habits, checks, from, to) {
  let scheduled = 0;
  let done = 0;
  for (let k = from; k <= to; k = shift(k, 1)) {
    const wd = (parseKey(k).getDay() + 6) % 7;
    const todays = habits.filter((h) => h.active && h.days.includes(wd));
    const marked = new Set(checks[k] || []);
    scheduled += todays.length;
    done += todays.filter((h) => marked.has(h.id)).length;
  }
  return scheduled ? done / scheduled : null;
}

export const MIN_WEIGHINS = 3;

// Recomendación de calorías cada 2 semanas.
// Peso: media de los últimos 7 días frente a la media de los 7 días que acabaron hace 14.
// Grasa: media de los últimos 14 días frente a la de hace 4 semanas.
export function calorieAdvice({ body, habits, checks, today }) {
  const weightNow = valuesIn(body, "weight", shift(today, -6), today);
  const weightPrev = valuesIn(body, "weight", shift(today, -20), shift(today, -14));
  const fatNow = valuesIn(body, "fat", shift(today, -13), today);
  const fatPrev = valuesIn(body, "fat", shift(today, -41), shift(today, -28));
  const comp = compliance(habits, checks, shift(today, -14), shift(today, -1));

  const result = {
    weightNow: mean(weightNow),
    weightPrev: mean(weightPrev),
    delta: null,
    fatDelta: null,
    compliance: comp,
    action: "nodata",
    title: "",
    detail: "",
  };

  if (weightNow.length < MIN_WEIGHINS || weightPrev.length < MIN_WEIGHINS) {
    const missing = weightPrev.length < MIN_WEIGHINS ? "hace dos semanas" : "esta semana";
    result.title = "Faltan pesajes";
    result.detail = `Necesito al menos ${MIN_WEIGHINS} pesajes esta semana y ${MIN_WEIGHINS} de hace dos semanas para comparar. Ahora faltan los de ${missing}.`;
    return result;
  }

  result.delta = result.weightNow - result.weightPrev;
  if (fatNow.length >= MIN_WEIGHINS && fatPrev.length >= MIN_WEIGHINS) {
    result.fatDelta = mean(fatNow) - mean(fatPrev);
  }

  const d = result.delta.toFixed(2).replace(".", ",");
  if (comp != null && comp < 0.8) {
    result.action = "comply";
    result.title = "Primero, cumple el plan";
    result.detail = `Has cumplido el ${Math.round(comp * 100)} % de los hábitos en 2 semanas. Con menos del 80 % el peso no dice si las calorías son correctas: no cambies nada todavía.`;
  } else if (result.fatDelta != null && result.fatDelta > 1) {
    result.action = "down";
    result.title = "Baja 200 kcal al día";
    result.detail = `La grasa ha subido ${result.fatDelta.toFixed(1).replace(".", ",")} puntos en 4 semanas (más de 1).`;
  } else if (result.delta < 0.25) {
    result.action = "up";
    result.title = "Sube 200 kcal al día";
    result.detail = `Has cambiado ${d} kg en 2 semanas (objetivo: +0,25 a +0,5). Añade medio batido casero.`;
  } else if (result.delta > 0.5) {
    result.action = "down";
    result.title = "Baja 200 kcal al día";
    result.detail = `Has subido ${d} kg en 2 semanas (máximo recomendado: +0,5).`;
  } else {
    result.action = "keep";
    result.title = "Mantén el plan";
    result.detail = `Has subido ${d} kg en 2 semanas: dentro del objetivo.`;
  }
  return result;
}

// Avisos de recuperación a partir de los datos de Google Health.
export function recoveryAlerts(health, today) {
  const alerts = [];
  const days = (from, to, f) => {
    const out = [];
    for (let k = from; k <= to; k = shift(k, 1)) {
      const v = health[k]?.[f];
      if (typeof v === "number") out.push(v);
    }
    return out;
  };
  const sleep = days(shift(today, -6), today, "sleepMin");
  if (sleep.length >= 3) {
    const avg = mean(sleep);
    if (avg < 420) {
      const h = Math.floor(avg / 60);
      const m = Math.round(avg % 60);
      alerts.push({ kind: "sleep", text: `Duermes ${h} h ${m} min de media esta semana (menos de 7 h). La recuperación y el músculo lo notan.` });
    }
  }
  const recent = days(shift(today, -2), today, "rhr");
  const base = days(shift(today, -30), shift(today, -3), "rhr");
  if (recent.length >= 2 && base.length >= 7) {
    const diff = mean(recent) - mean(base);
    if (diff > 5) {
      alerts.push({ kind: "rhr", text: `Tu pulso en reposo está ${Math.round(diff)} latidos por encima de tu media. Señal de fatiga: baja la intensidad del gimnasio y duerme más.` });
    }
  }
  return alerts;
}

// --- Gimnasio ---
const norm = (s) => s.trim().toLowerCase();

export function setScore(set) {
  const kg = Number(set.kg) || 0;
  const reps = Number(set.reps) || 0;
  if (reps <= 0) return 0;
  return kg > 0 ? kg * (1 + reps / 30) : reps; // 1RM estimado (Epley) o repeticiones si es sin peso
}

function sessionScores(sessions, name) {
  const n = norm(name);
  return sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((s) => s.exercises.find((e) => norm(e.name) === n))
    .filter((e) => e && e.sets.some((x) => Number(x.reps) > 0))
    .map((e) => Math.max(...e.sets.map(setScore)));
}

// Ejercicios sin mejorar en las 3 últimas sesiones respecto a su mejor marca anterior.
export function stalledExercises(sessions) {
  const names = new Map();
  for (const s of sessions) for (const e of s.exercises) names.set(norm(e.name), e.name);
  const out = [];
  for (const [, display] of names) {
    const scores = sessionScores(sessions, display);
    if (scores.length < 4) continue;
    const before = Math.max(...scores.slice(0, -3));
    if (scores.slice(-3).every((x) => x <= before + 1e-9)) out.push(display);
  }
  return out;
}

// Series de la última sesión (anterior a `beforeDate`) en la que se hizo el ejercicio.
export function lastPerformance(sessions, name, beforeDate = "9999-12-31", excludeId = null) {
  const n = norm(name);
  const prev = sessions
    .filter((s) => s.id !== excludeId && s.date <= beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  for (const s of prev) {
    const e = s.exercises.find((x) => norm(x.name) === n);
    if (e && e.sets.some((x) => Number(x.reps) > 0)) return { date: s.date, sets: e.sets };
  }
  return null;
}

// Media móvil de 7 días (por fecha) para las gráficas.
export function rollingAverage(points, days = 7) {
  return points.map((p) => {
    const from = shift(p.date, -(days - 1));
    return { date: p.date, value: mean(points.filter((q) => q.date >= from && q.date <= p.date).map((q) => q.value)) };
  });
}
