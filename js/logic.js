// Reglas del plan. Funciones puras: reciben datos, no tocan el estado.
// `s` es un objeto con la forma del estado (habits, checks, amounts, skips, body, sessions, health, plan).

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
const wdOf = (k) => (parseKey(k).getDay() + 6) % 7;
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
const longDay = (k) => parseKey(k).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
const kcalText = (v) => Math.round(v).toLocaleString("es-ES");

export function mean(xs) {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const MIN_WEIGHINS = 3;

// --- Hábitos ---
export const amountTotal = (s, k, id) => (s.amounts?.[k]?.[id] || []).reduce((a, b) => a + b, 0);

export const trainedOn = (s, k) =>
  s.sessions.some((x) => x.date === k && x.exercises.some((e) => e.sets.some(isWorkSet))) || (s.health[k]?.sports || []).length > 0;

// Hecho: marcado a mano, o cumplido por su cantidad o por su rol automático.
export function habitDone(s, h, k) {
  if ((s.checks[k] || []).includes(h.id)) return true;
  if (h.kind === "amount") return h.target > 0 && amountTotal(s, k, h.id) >= h.target;
  if (h.role === "sleep") return (s.health[k]?.sleepMin ?? 0) >= (h.target || 8) * 60;
  if (h.role === "gym") return trainedOn(s, k);
  if (h.role === "weigh") return s.body.some((b) => b.date === k && b.weight != null);
  return false;
}

export const isSkippedOn = (s, h, k) => (s.skips?.[k] || []).includes(h.id);

// Veces hecho en la semana (lunes a domingo) hasta `k`; `inclusive` cuenta también `k`.
export function doneInWeek(s, h, k, inclusive = true) {
  let n = 0;
  const end = inclusive ? k : shift(k, -1);
  for (let d = weekStart(k); d <= end; d = shift(d, 1)) if (habitDone(s, h, d)) n++;
  return n;
}

// Se muestra en la lista del día.
export function visibleOn(s, h, k) {
  if (!h.active || (h.since && k < h.since)) return false;
  if (!h.perWeek) return h.days.includes(wdOf(k));
  return habitDone(s, h, k) || doneInWeek(s, h, k, false) < h.perWeek;
}

// Cuenta para el porcentaje del día. Un hábito «N por semana» solo cuenta si se hizo
// o si ya no quedan días para llegar a N; los días omitidos no cuentan.
export function scheduledOn(s, h, k) {
  if (!h.active || (h.since && k < h.since) || isSkippedOn(s, h, k)) return false;
  if (!h.perWeek) return h.days.includes(wdOf(k));
  if (habitDone(s, h, k)) return true;
  const before = doneInWeek(s, h, k, false);
  return before < h.perWeek && 7 - wdOf(k) <= h.perWeek - before;
}

export function dayCompletion(s, k, only = null) {
  let scheduled = 0;
  let done = 0;
  for (const h of s.habits) {
    if ((only && !only(h)) || !scheduledOn(s, h, k)) continue;
    scheduled++;
    if (habitDone(s, h, k)) done++;
  }
  return { scheduled, done, pct: scheduled ? done / scheduled : null };
}

// % de hábitos programados que se hicieron, de `from` a `to` (incluidos).
export function compliance(s, from, to, only = null) {
  let scheduled = 0;
  let done = 0;
  for (let k = from; k <= to; k = shift(k, 1)) {
    const d = dayCompletion(s, k, only);
    scheduled += d.scheduled;
    done += d.done;
  }
  return scheduled ? done / scheduled : null;
}

// Cumplimiento de un hábito entre dos fechas.
export function habitRate(s, h, from, to) {
  let scheduled = 0;
  let done = 0;
  for (let k = from; k <= to; k = shift(k, 1)) {
    if (!scheduledOn(s, h, k)) continue;
    scheduled++;
    if (habitDone(s, h, k)) done++;
  }
  return { scheduled, done, pct: scheduled ? done / scheduled : null };
}

// Primer día con algo apuntado: antes de eso no hay datos (no cuenta como 0 %).
export function firstUseDate(s) {
  let first = null;
  for (const [k, v] of Object.entries(s.checks)) if (v?.length && (!first || k < first)) first = k;
  for (const [k, v] of Object.entries(s.amounts || {})) if (Object.keys(v).length && (!first || k < first)) first = k;
  return first;
}

export const STREAK_MIN = 0.8;

// Días seguidos con ≥80 %. Se perdona 1 día fallido por semana (lunes a domingo);
// hoy no rompe la racha mientras no esté cerrado.
export function streak(s, today) {
  const first = firstUseDate(s);
  if (!first) return 0;
  let count = 0;
  const misses = new Map();
  for (let k = today; k >= first; k = shift(k, -1)) {
    const { pct } = dayCompletion(s, k);
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
  return shift(k, -wdOf(k));
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
  const mx = (n - 1) / 2;
  const my = mean(pts.map((p) => p.value));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (pts[i].value - my);
    den += (i - mx) ** 2;
  }
  return (num / den) * 7;
}

export const RATE_TARGET = { min: 0.12, max: 0.25 };

// --- Calorías ---
export const KCAL_PER_KG = 7700; // energía aproximada de 1 kg de peso corporal
export const ADJUST_DAYS = 14;
export const EXPENDITURE_DAYS = 28;

const kcalHabitOf = (s) => s.habits.find((h) => h.role === "kcal" && h.kind === "amount") || null;

// Gasto real: lo que comes menos lo que cambia la tendencia de peso (kcal/día).
// Solo cuentan los días apuntados con al menos la mitad del objetivo (los días a medias falsean el cálculo).
export function expenditure(s, today, days = EXPENDITURE_DAYS) {
  const kcal = kcalHabitOf(s);
  if (!kcal) return null;
  const from = shift(today, -days);
  const to = shift(today, -1);
  const intake = [];
  for (let k = from; k <= to; k = shift(k, 1)) {
    const t = amountTotal(s, k, kcal.id);
    if (t >= kcal.target * 0.5) intake.push(t);
  }
  const trend = trendSeries(s.body, "weight", to);
  const start = trend.find((p) => p.date === from);
  const end = trend.find((p) => p.date === to);
  const weighins = trend.filter((p) => p.date >= from && p.date <= to && p.raw != null).length;
  const out = { days, logged: intake.length, weighins, intake: mean(intake), tdee: null, needLogged: Math.ceil(days / 2), needWeighins: 6 };
  if (intake.length < out.needLogged || weighins < out.needWeighins || !start || !end) return out;
  out.tdee = out.intake - ((end.value - start.value) * KCAL_PER_KG) / (days - 1);
  return out;
}

const rateText = (r) => `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2).replace(".", ",")} kg/sem`;

// Consejo de calorías. Ritmo = pendiente de la tendencia (la misma que la gráfica de peso).
// Tras aplicar un ajuste espera 14 días antes de volver a aconsejar.
export function calorieAdvice(s, today) {
  const kcal = kcalHabitOf(s);
  const current = kcal?.target ?? null;
  const trend = trendSeries(s.body, "weight", today);
  const rate = weeklyRate(trend);

  const fatTrend = trendSeries(s.body, "fat", today);
  const fatThen = fatTrend.find((p) => p.date === shift(today, -28));
  const fatRecent = s.body.filter((b) => b.fat != null && b.date > shift(today, -28)).length;
  const fatDelta = fatThen && fatRecent >= MIN_WEIGHINS ? fatTrend.at(-1).value - fatThen.value : null;

  // Para decidir calorías solo cuenta cumplir lo de comer, no el resto de hábitos.
  const nutrition = (h) => h.role === "kcal" || h.role === "protein";
  const comp = s.habits.some(nutrition) ? compliance(s, shift(today, -14), shift(today, -1), nutrition) : null;
  const exp = expenditure(s, today);

  const r = { rate, fatDelta, compliance: comp, expenditure: exp, current, next: null, action: "nodata", title: "", detail: "" };

  const last = s.plan.lastAdjust;
  if (last && daysBetween(last.date, today) < ADJUST_DAYS) {
    r.action = "wait";
    r.title = "Ajuste en marcha";
    r.detail = `El ${longDay(last.date)} pasaste de ${kcalText(last.from)} a ${kcalText(last.to)} kcal. El siguiente consejo llega el ${longDay(shift(last.date, ADJUST_DAYS))}, cuando el peso haya reaccionado.`;
    return r;
  }
  if (rate == null || trend.length < 14) {
    r.title = "Faltan pesajes";
    r.detail = `Necesito 2 semanas de datos y al menos ${MIN_WEIGHINS} pesajes en las últimas 3 para medir el ritmo. Pésate en ayunas 3–4 días por semana.`;
    return r;
  }

  const rt = rateText(rate);
  if (comp != null && comp < 0.8) {
    r.action = "comply";
    r.title = "Primero, cumple el plan";
    r.detail = `Has llegado a calorías y proteína el ${Math.round(comp * 100)} % de las veces en 2 semanas. Con menos del 80 % el peso no dice si el objetivo es correcto: no cambies nada todavía.`;
    return r;
  }
  if (fatDelta != null && fatDelta > 1) {
    r.action = "down";
    r.detail = `La grasa ha subido ${fatDelta.toFixed(1).replace(".", ",")} puntos en 4 semanas (más de 1).`;
  } else if (exp?.tdee != null && current != null) {
    const surplus = (((RATE_TARGET.min + RATE_TARGET.max) / 2) * KCAL_PER_KG) / 7;
    const ideal = Math.round((exp.tdee + surplus) / 50) * 50;
    const base = `Gasto real: ${kcalText(exp.tdee)} kcal/día (${exp.logged} días apuntados). Ritmo ${rt}.`;
    if (Math.abs(ideal - current) < 100) {
      r.action = "keep";
      r.detail = `${base} Con ${kcalText(current)} kcal vas en el objetivo.`;
    } else {
      r.action = ideal > current ? "up" : "down";
      r.next = ideal;
      r.detail = `${base} Para subir 0,12–0,25 kg/sem necesitas unas ${kcalText(ideal)} kcal.`;
    }
  } else if (rate < RATE_TARGET.min) {
    r.action = "up";
    r.detail = `Ritmo ${rt} (objetivo: +0,12 a +0,25). Añade unas 200 kcal, por ejemplo medio batido casero.`;
  } else if (rate > RATE_TARGET.max) {
    r.action = "down";
    r.detail = `Ritmo ${rt} (máximo recomendado: +0,25): puede ser grasa de más.`;
  } else {
    r.action = "keep";
    r.detail = `Ritmo ${rt}: dentro del objetivo.`;
  }

  if (r.action === "keep") r.title = "Mantén el plan";
  else {
    if (r.next == null && current != null) r.next = current + (r.action === "up" ? 200 : -200);
    r.title = r.next != null ? `${r.action === "up" ? "Sube" : "Baja"} a ${kcalText(r.next)} kcal` : `${r.action === "up" ? "Sube" : "Baja"} 200 kcal al día`;
  }
  return r;
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

// Rango de repeticiones de la plantilla: "8-10" → {min: 8, max: 10}; "8" → {min: 8, max: 8}.
export function parseRange(t) {
  const m = String(t ?? "").match(/(\d+)\s*(?:[-–a]\s*(\d+))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

// Doble progresión: si todas las series efectivas de la última vez llegaron al tope del rango,
// sube `step` kg y vuelve al mínimo; si no, mismo peso y una repetición más en las que no llegaron.
// prev: series efectivas de la última vez. Devuelve { kind: "up" | "reps" | "top" | "same", sets } o null.
export function suggestSets(prev, target, step, count) {
  if (!prev.length) return null;
  const base = Array.from({ length: count }, (_, i) => prev[i] || prev[prev.length - 1]);
  const kg = (x) => Number(x.kg) || 0;
  const reps = (x) => Number(x.reps) || 0;
  const r = parseRange(target);
  const same = base.map((x) => ({ kg: x.kg, reps: x.reps }));
  if (!r) return { kind: "same", sets: same };
  const atTop = prev.every((x) => reps(x) >= r.max);
  if (atTop && step > 0 && prev.every((x) => kg(x) > 0)) {
    return { kind: "up", sets: base.map((x) => ({ kg: String(Math.round((kg(x) + step) * 100) / 100), reps: String(r.min) })) };
  }
  if (atTop) return { kind: "top", sets: same };
  return { kind: "reps", sets: base.map((x) => ({ kg: x.kg, reps: String(Math.min(r.max, reps(x) + 1)) })) };
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
export function weekSummary(s, from) {
  const to = shift(from, 6);
  const [w] = weeklyStats(s, to, 1);
  const trend = trendSeries(s.body, "weight", to);
  const inWeek = trend.filter((p) => p.date >= from && p.date <= to && p.raw != null);
  const prs = s.sessions.filter((x) => x.date >= from && x.date <= to).flatMap((x) => sessionPRs(s.sessions, x));
  const first = firstUseDate(s);
  return {
    from,
    to,
    workouts: w.workouts,
    sportMin: w.sportMin,
    avgWeight: mean(inWeek.map((p) => p.raw)),
    rate: weeklyRate(trend.filter((p) => p.date <= to)),
    compliance: first && first <= to ? compliance(s, first > from ? first : from, to) : null,
    prs,
  };
}
