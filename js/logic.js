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

// Serie efectiva: hecha, no de calentamiento y con repeticiones.
export const isWorkSet = (x) => x.done !== false && !x.warmup && Number(x.reps) > 0;

export function setScore(set) {
  const kg = Number(set.kg) || 0;
  const reps = Number(set.reps) || 0;
  if (reps <= 0) return 0;
  return kg > 0 ? kg * (1 + reps / 30) : reps; // 1RM estimado (Epley) o repeticiones si es sin peso
}

const byDate = (a, b) => a.date.localeCompare(b.date) || (a.startedAt || 0) - (b.startedAt || 0) || a.id.localeCompare(b.id);

// Historial de un ejercicio: una entrada por sesión con su mejor serie efectiva.
export function exerciseHistory(sessions, name) {
  const n = norm(name);
  const out = [];
  for (const s of sessions.slice().sort(byDate)) {
    const e = s.exercises.find((x) => norm(x.name) === n);
    const work = e ? e.sets.filter(isWorkSet) : [];
    if (!work.length) continue;
    const best = work.reduce((a, b) => (setScore(b) > setScore(a) ? b : a));
    out.push({
      sessionId: s.id,
      date: s.date,
      e1rm: setScore(best),
      best,
      maxKg: Math.max(...work.map((x) => Number(x.kg) || 0)),
      volume: work.reduce((a, x) => a + (Number(x.kg) || 0) * Number(x.reps), 0),
    });
  }
  return out;
}

// Ejercicios sin mejorar en las 3 últimas sesiones respecto a su mejor marca anterior.
export function stalledExercises(sessions) {
  const names = new Map();
  for (const s of sessions) for (const e of s.exercises) names.set(norm(e.name), e.name);
  const out = [];
  for (const [, display] of names) {
    const scores = exerciseHistory(sessions, display).map((h) => h.e1rm);
    if (scores.length < 4) continue;
    const before = Math.max(...scores.slice(0, -3));
    if (scores.slice(-3).every((x) => x <= before + 1e-9)) out.push(display);
  }
  return out;
}

// Series de la última sesión (anterior a `beforeDate`) en la que se hizo el ejercicio.
export function lastPerformance(sessions, name, beforeDate = "9999-12-31", excludeId = null) {
  const n = norm(name);
  const prev = sessions.filter((s) => s.id !== excludeId && s.date <= beforeDate).sort(byDate).reverse();
  for (const s of prev) {
    const e = s.exercises.find((x) => norm(x.name) === n);
    if (e && e.sets.some(isWorkSet)) return { date: s.date, sets: e.sets.filter((x) => x.done !== false && Number(x.reps) > 0) };
  }
  return null;
}

// Mejores marcas de un ejercicio sin contar la sesión `excludeId`.
export function bestMarks(sessions, name, excludeId) {
  const hist = exerciseHistory(sessions.filter((s) => s.id !== excludeId), name);
  if (!hist.length) return null;
  return { e1rm: Math.max(...hist.map((h) => h.e1rm)), kg: Math.max(...hist.map((h) => h.maxKg)) };
}

// Tipo de récord que bate una serie frente a `marks` (null si no hay historial previo).
export function setPR(set, marks) {
  if (!marks || !isWorkSet(set)) return null;
  const kg = Number(set.kg) || 0;
  if (kg > 0 && kg > marks.kg + 1e-9) return "kg";
  if (setScore(set) > marks.e1rm + 1e-9) return "e1rm";
  return null;
}

// Discos por lado para cargar `total` kg en una barra de `bar` kg.
export function plateBreakdown(total, bar = 20, plates = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  let side = (total - bar) / 2;
  if (!(side > 0)) return { perSide: [], remainder: 0 };
  const perSide = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      perSide.push(p);
      side -= p;
    }
  }
  return { perSide, remainder: Math.round(side * 2 * 100) / 100 };
}

// --- Hábitos: cumplimiento por día y racha ---
export function dayCompletion(habits, checks, k) {
  const wd = (parseKey(k).getDay() + 6) % 7;
  const todays = habits.filter((h) => h.active && h.days.includes(wd));
  const marked = new Set(checks[k] || []);
  const done = todays.filter((h) => marked.has(h.id)).length;
  return { scheduled: todays.length, done, pct: todays.length ? done / todays.length : null };
}

// Primer día con algún hábito marcado: antes de eso no hay datos (no cuenta como 0 %).
export function firstUseDate(checks) {
  let first = null;
  for (const [k, v] of Object.entries(checks)) if (v?.length && (!first || k < first)) first = k;
  return first;
}

export const STREAK_MIN = 0.8;

// Días seguidos con ≥80 %. Se perdona 1 día fallido por semana (lunes a domingo);
// hoy no rompe la racha mientras no esté cerrado.
export function streak(habits, checks, today) {
  const marked = Object.keys(checks).filter((k) => (checks[k] || []).length).sort();
  if (!marked.length) return 0;
  const first = marked[0];
  let count = 0;
  const misses = new Map();
  for (let k = today; k >= first; k = shift(k, -1)) {
    const { pct } = dayCompletion(habits, checks, k);
    if (pct == null) continue;
    if (pct >= STREAK_MIN) {
      count++;
      continue;
    }
    if (k === today) continue;
    const wk = weekStart(k);
    const m = (misses.get(wk) || 0) + 1;
    misses.set(wk, m);
    if (m > 1) break;
  }
  return count;
}

export function weekStart(k) {
  const wd = (parseKey(k).getDay() + 6) % 7;
  return shift(k, -wd);
}

// --- Peso: tendencia suavizada (media exponencial diaria) y ritmo semanal ---
export const TREND_ALPHA = 0.1;

// Devuelve un punto por día desde el primer registro hasta `today`.
export function trendSeries(body, field, today, alpha = TREND_ALPHA) {
  const entries = body.filter((b) => b[field] != null).sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) return [];
  const raw = new Map(entries.map((b) => [b.date, b[field]]));
  const out = [];
  let t = entries[0][field];
  const end = today > entries.at(-1).date ? today : entries.at(-1).date;
  for (let k = entries[0].date; k <= end; k = shift(k, 1)) {
    if (raw.has(k)) t += alpha * (raw.get(k) - t);
    out.push({ date: k, value: t, raw: raw.get(k) ?? null });
  }
  return out;
}

// Pendiente (kg/semana) por mínimos cuadrados de la tendencia en los últimos `days` días.
export function weeklyRate(trend, days = 21) {
  const pts = trend.slice(-days);
  if (pts.length < 7 || pts.filter((p) => p.raw != null).length < 3) return null;
  const n = pts.length;
  const xs = pts.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = mean(pts.map((p) => p.value));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (pts[i].value - my);
    den += (xs[i] - mx) ** 2;
  }
  return (num / den) * 7;
}

export const RATE_TARGET = { min: 0.12, max: 0.25 };

// --- Gimnasio por semanas ---
export function sessionMinutes(s) {
  if (s.startedAt && s.finishedAt && s.finishedAt > s.startedAt) return Math.round((s.finishedAt - s.startedAt) / 60000);
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done !== false && Number(x.reps) > 0).length, 0);
  return Math.round(sets * 2.5);
}

export function sessionVolume(s) {
  let v = 0;
  for (const e of s.exercises) for (const x of e.sets) if (isWorkSet(x)) v += (Number(x.kg) || 0) * Number(x.reps);
  return v;
}

// Series efectivas por grupo muscular entre `from` y `to` (incluidos).
export function setsPerGroup(sessions, from, to, groupOf) {
  const out = {};
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    for (const e of s.exercises) {
      const g = groupOf(e.name);
      if (!g) continue;
      out[g] = (out[g] || 0) + e.sets.filter(isWorkSet).length;
    }
  }
  return out;
}

export const sportMinutes = (health, k) => (health[k]?.sports || []).reduce((a, x) => a + x.min, 0);

// Últimas `weeks` semanas (de la más antigua a la actual).
export function weeklyStats({ sessions, health }, today, weeks = 12) {
  const out = [];
  const current = weekStart(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const from = shift(current, -7 * i);
    const to = shift(from, 6);
    const ss = sessions.filter((s) => s.date >= from && s.date <= to && s.exercises.some((e) => e.sets.some(isWorkSet)));
    let sport = 0;
    for (let k = from; k <= to; k = shift(k, 1)) sport += sportMinutes(health, k);
    out.push({
      week: from,
      workouts: ss.length,
      volume: ss.reduce((a, s) => a + sessionVolume(s), 0),
      gymMin: ss.reduce((a, s) => a + sessionMinutes(s), 0),
      sportMin: sport,
    });
  }
  return out;
}

// Récords de una sesión frente a todo lo anterior a ella.
export function sessionPRs(sessions, s) {
  const before = sessions.filter((x) => byDate(x, s) < 0);
  const out = [];
  for (const e of s.exercises) {
    const marks = bestMarks(before, e.name, s.id);
    const best = e.sets.filter(isWorkSet).map((x) => ({ x, pr: setPR(x, marks) })).find((p) => p.pr);
    if (best) out.push({ name: e.name, set: best.x, kind: best.pr });
  }
  return out;
}

// Resumen de la semana que empieza en `from` (lunes).
export function weekSummary(state, from) {
  const to = shift(from, 6);
  const [w] = weeklyStats(state, to, 1);
  const trend = trendSeries(state.body, "weight", to);
  const inWeek = trend.filter((p) => p.date >= from && p.date <= to && p.raw != null);
  const prs = state.sessions.filter((s) => s.date >= from && s.date <= to).flatMap((s) => sessionPRs(state.sessions, s));
  return {
    from,
    to,
    workouts: w.workouts,
    sportMin: w.sportMin,
    avgWeight: mean(inWeek.map((p) => p.raw)),
    rate: weeklyRate(trend.filter((p) => p.date <= to)),
    compliance: (() => {
      const first = firstUseDate(state.checks);
      return first && first <= to ? compliance(state.habits, state.checks, first > from ? first : from, to) : null;
    })(),
    prs,
  };
}

// Media móvil de 7 días (por fecha) para las gráficas.
export function rollingAverage(points, days = 7) {
  return points.map((p) => {
    const from = shift(p.date, -(days - 1));
    return { date: p.date, value: mean(points.filter((q) => q.date >= from && q.date <= p.date).map((q) => q.value)) };
  });
}
