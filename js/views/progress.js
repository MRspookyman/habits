import { h, fmt, num, qty, toast, sheet, field, confirmSheet, dec, segmented } from "../ui.js";
import { state, dateKey, addDays, setBody, exerciseInfo, applyKcal, roleHabit } from "../store.js";
import {
  calorieAdvice, compliance, mean, dayCompletion, streak, trendSeries, weeklyRate, RATE_TARGET,
  exerciseHistory, setsPerGroup, weeklyStats, weekStart, weekSummary, isWorkSet, firstUseDate,
  habitRate, trainedOn, expenditure,
} from "../logic.js";
import { lineChart, barChart, heatmap, levelFromPct } from "../charts.js";
import { GROUPS } from "../exercises.js";
import { shortDate, rateText, weekSummaryBlock, rangeText, setLabel, kgText } from "./shared.js";
import * as health from "../health.js";

const ui = { tab: "cuerpo", range: 90, exercise: null, week: "last", allEntries: false };

function editEntry(ctx, entry) {
  sheet(entry ? "Editar registro" : "Nuevo registro", (close) => {
    const d = h("input", { type: "date", value: entry?.date || dateKey(), max: dateKey(), required: true });
    const w = h("input", { type: "text", inputmode: "decimal", value: dec(entry?.weight), placeholder: "90,4" });
    const f = h("input", { type: "text", inputmode: "decimal", value: dec(entry?.fat), placeholder: "13,0" });
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      const wv = num(w.value);
      const fv = num(f.value);
      if ((w.value && wv == null) || (f.value && fv == null)) return toast("Escribe números, por ejemplo 90,4", "error");
      if (entry && entry.date !== d.value) setBody(entry.date, null, null);
      setBody(d.value, wv, fv);
      close();
      ctx.rerender();
    } },
      field("Fecha", d), field("Peso (kg)", w), field("Grasa (%)", f, "Déjalo vacío si ese día no lo mediste."),
      h("div", { class: "row end" },
        entry && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Borrar registro", `Se borra el registro del ${shortDate(entry.date)}.`, "Borrar", () => { setBody(entry.date, null, null); close(); ctx.rerender(); }) }, "Borrar"),
        h("button", { type: "submit", class: "btn primary" }, "Guardar"),
      ),
    );
  });
}

// --- Hábitos ---
function heatmapCard(ctx, today) {
  const from = addDays(weekStart(today), -25 * 7);
  const first = firstUseDate(state);
  const comp = first ? compliance(state, first > from ? first : from, today) : null;
  return h("section", { class: "card heat-card" },
    h("div", { class: "template-head" },
      h("h2", {}, "26 semanas"),
      h("p", { class: "heat-stats" }, h("strong", {}, `${streak(state, today)}`), " días de racha · ", h("strong", {}, comp == null ? "—" : `${Math.round(comp * 100)} %`), " cumplido"),
    ),
    heatmap({
      today,
      weeks: 26,
      label: "Cumplimiento de hábitos de las últimas 26 semanas. Toca un día para abrirlo.",
      levelOf: (k) => (!first || k < first ? null : levelFromPct(dayCompletion(state, k).pct)),
      markOf: (k) => trainedOn(state, k),
      onPick: (k) => ctx.go(k === today ? "#/hoy" : `#/hoy/${k}`),
    }),
    h("div", { class: "heat-legend", "aria-hidden": "true" },
      h("span", {}, "0 %"), [0, 1, 2, 3, 4, 5].map((l) => h("i", { class: `hm-swatch l${l}` })), h("span", {}, "100 %"),
      h("span", { class: "legend-mark" }, h("i", { class: "hm-dot" }), "entreno o deporte"),
    ),
  );
}

// Qué hábito cuesta más: % de los últimos 30 días (sin hoy, que aún no ha terminado).
function habitRatesCard(today) {
  const to = addDays(today, -1);
  const first = firstUseDate(state);
  const from = first && first > addDays(today, -30) ? first : addDays(today, -30);
  const rows = first && first <= to
    ? state.habits.filter((x) => x.active).map((x) => ({ x, ...habitRate(state, x, from, to) })).filter((r) => r.scheduled > 0).sort((a, b) => a.pct - b.pct)
    : [];
  return h("section", { class: "card" },
    h("div", { class: "template-head" }, h("h2", {}, "Por hábito"), h("span", { class: "muted" }, "últimos 30 días")),
    rows.length === 0
      ? h("p", { class: "muted" }, "Marca hábitos un par de días y verás aquí cuáles te cuestan más.")
      : h("ul", { class: "rates" }, rows.map((r) => h("li", { class: r.pct >= 0.8 ? "in" : r.pct < 0.5 ? "low" : "" },
          h("span", { class: "g-name" }, r.x.name),
          h("span", { class: "g-track" }, h("span", { class: "g-fill", style: { width: `${r.pct * 100}%` } })),
          h("span", { class: "g-num" }, `${Math.round(r.pct * 100)} %`),
        ))),
    h("p", { class: "hint" }, "Ordenados de peor a mejor. Los días omitidos no cuentan."),
  );
}

// --- Cuerpo ---
function weightCard(ctx, today) {
  const trend = trendSeries(state.body, "weight", today);
  const rate = weeklyRate(trend);
  const status = rate == null ? "Necesito al menos 3 pesajes en 3 semanas para calcular el ritmo."
    : rate < RATE_TARGET.min ? "Por debajo del objetivo: come un poco más."
    : rate > RATE_TARGET.max ? "Por encima del objetivo: puede ser grasa de más."
    : "Dentro del objetivo.";
  const from = ui.range ? addDays(today, -ui.range + 1) : trend[0]?.date || today;
  const shown = trend.filter((p) => p.date >= from);
  const start = shown[0];
  return h("section", { class: "card" },
    h("div", { class: "template-head" }, h("h2", {}, "Peso"), segmented([[30, "1M"], [90, "3M"], [0, "Todo"]], ui.range, (v) => { ui.range = v; ctx.rerender(); }, "Periodo")),
    h("div", { class: "rate" },
      h("span", { class: "rate-num" + (rate != null && rate >= RATE_TARGET.min && rate <= RATE_TARGET.max ? " in" : "") }, rateText(rate)),
      h("span", { class: "rate-meta" }, `Tendencia ${trend.length ? `${fmt(trend.at(-1).value)} kg` : "—"} · objetivo +0,12 a +0,25`),
    ),
    h("p", { class: "muted" }, status),
    lineChart({
      label: "Peso: puntos diarios y tendencia",
      series: [
        { points: shown.filter((p) => p.raw != null).map((p) => ({ date: p.date, value: p.raw })), style: "dots", cls: "raw" },
        { points: shown.map((p) => ({ date: p.date, value: p.value })), style: "line", cls: "accent" },
      ],
      corridor: start && shown.length > 1 ? { from: { date: start.date, value: start.value }, to: shown.at(-1).date, min: RATE_TARGET.min, max: RATE_TARGET.max } : null,
      minSpan: 1,
    }),
    h("div", { class: "legend" }, h("i", { class: "lg-dot" }), "pesaje", h("i", { class: "lg-line" }), "tendencia", h("i", { class: "lg-band" }), "ritmo objetivo"),
  );
}

function adviceCard(ctx, today) {
  const a = calorieAdvice(state, today);
  const kcal = roleHabit("kcal");
  return h("section", { class: `card advice-card ${a.action}` },
    h("h2", {}, "Ajuste de calorías"),
    h("p", { class: "advice-title" }, a.title),
    h("p", {}, a.detail),
    a.next != null && h("div", { class: "row" },
      h("button", { class: "btn primary", onClick: () => { applyKcal(a.next, today); toast(`Objetivo: ${qty(a.next)} kcal`); ctx.rerender(); } }, `Aplicar ${qty(a.next)} kcal`)),
    h("p", { class: "hint" }, kcal
      ? `Objetivo actual: ${qty(kcal.target)} kcal. Tras aplicar un ajuste espero 2 semanas antes de aconsejar otro.`
      : "Crea un hábito de calorías (tipo Cantidad, objetivo del plan) para poder aplicar los ajustes."),
  );
}

function expenditureCard(today) {
  const kcal = roleHabit("kcal");
  if (!kcal || kcal.kind !== "amount") return null;
  const e = expenditure(state, today);
  return h("section", { class: "card" },
    h("h2", {}, "Gasto real"),
    e.tdee != null
      ? h("frag", {},
          h("p", { class: "rate-num" }, `${qty(Math.round(e.tdee / 10) * 10)} kcal/día`),
          h("p", { class: "muted" }, `Comes de media ${qty(Math.round(e.intake))} kcal (${e.logged} de ${e.days} días apuntados) y la tendencia de peso dice cuánto sobra o falta.`))
      : h("p", { class: "muted" }, `Para calcular tu gasto real me falta: ${[
          e.logged < e.needLogged && `apuntar lo que comes en «${kcal.name}» al menos ${e.needLogged} de los últimos ${e.days} días (llevas ${e.logged})`,
          e.weighins < e.needWeighins && `${e.needWeighins} pesajes en ese tiempo (llevas ${e.weighins})`,
        ].filter(Boolean).join(" y ") || "un pesaje de hace 4 semanas"}. Con eso el consejo de calorías será exacto.`),
    h("p", { class: "hint" }, "No cuentan los días con menos de la mitad del objetivo: suelen ser días apuntados a medias."),
  );
}

function fatCard(today) {
  const trend = trendSeries(state.body, "fat", today);
  if (!trend.length) return null;
  const shown = trend.filter((p) => p.date >= addDays(today, -89));
  return h("section", { class: "card" },
    h("div", { class: "template-head" }, h("h2", {}, "Grasa"), h("span", { class: "muted" }, `Tendencia ${fmt(trend.at(-1).value)} %`)),
    lineChart({
      label: "Grasa corporal: puntos y tendencia",
      series: [
        { points: shown.filter((p) => p.raw != null).map((p) => ({ date: p.date, value: p.raw })), style: "dots", cls: "raw" },
        { points: shown.map((p) => ({ date: p.date, value: p.value })), style: "line", cls: "accent" },
      ],
      minSpan: 1,
      height: 140,
    }),
  );
}

function entriesCard(ctx) {
  const entries = state.body.slice().reverse();
  return h("section", { class: "card" },
    h("h2", {}, "Pesajes"),
    entries.length === 0
      ? h("p", { class: "muted" }, "Aún no hay pesajes. Pésate en ayunas 3–4 días por semana y apúntalo en Hoy.")
      : h("ul", { class: "entries" }, entries.slice(0, ui.allEntries ? entries.length : 10).map((b) => h("li", {},
          h("button", { class: "link-row", onClick: () => editEntry(ctx, b) },
            h("span", {}, shortDate(b.date)),
            h("span", {}, b.weight != null ? `${fmt(b.weight)} kg` : "—", h("span", { class: "muted" }, b.fat != null ? ` · ${fmt(b.fat)} %` : "")),
          )))),
    entries.length > 10 && h("button", { class: "btn ghost block", onClick: () => { ui.allEntries = !ui.allEntries; ctx.rerender(); } }, ui.allEntries ? "Ver menos" : `Ver los ${entries.length}`),
  );
}

function recoveryCards(today) {
  if (!health.isConnected()) return [];
  const days = [];
  for (let k = addDays(today, -29); k <= today; k = addDays(k, 1)) days.push(k);
  const series = (f, conv = (v) => v) => days.filter((k) => state.health[k]?.[f] != null).map((k) => ({ date: k, value: conv(state.health[k][f]) }));
  const sleep = series("sleepMin", (v) => v / 60);
  const rhr = series("rhr");
  return [
    h("section", { class: "card" },
      h("div", { class: "template-head" }, h("h2", {}, "Sueño"), h("span", { class: "muted" }, `media 7 días ${fmt(mean(sleep.slice(-7).map((p) => p.value)))} h`)),
      lineChart({ series: [{ points: sleep, style: "line", cls: "accent" }], label: "Horas de sueño, últimos 30 días", minSpan: 2, height: 140 }),
    ),
    h("section", { class: "card" },
      h("h2", {}, "Pulso en reposo"),
      lineChart({ series: [{ points: rhr, style: "line", cls: "accent" }], label: "Pulso en reposo, últimos 30 días", yFmt: (v) => v.toFixed(0), minSpan: 6, height: 140 }),
    ),
  ];
}

// --- Gimnasio ---
function exerciseCard(ctx) {
  const names = new Map();
  for (const s of state.sessions) for (const e of s.exercises) if (e.sets.some(isWorkSet)) names.set(e.name.toLowerCase(), e.name);
  const list = [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
  if (!list.length) return h("section", { class: "card" }, h("h2", {}, "Ejercicios"), h("p", { class: "muted" }, "Cuando termines tu primer entreno verás aquí la evolución de cada ejercicio."));
  if (!ui.exercise || !list.includes(ui.exercise)) ui.exercise = list[0];
  const hist = exerciseHistory(state.sessions, ui.exercise);
  const best = hist.reduce((a, b) => (b.e1rm > a.e1rm ? b : a), hist[0]);
  return h("section", { class: "card" },
    h("div", { class: "template-head" },
      h("h2", {}, "Ejercicio"),
      h("select", { class: "ex-select", "aria-label": "Ejercicio", onChange: (e) => { ui.exercise = e.target.value; ctx.rerender(); } },
        list.map((n) => h("option", { value: n, selected: n === ui.exercise }, n))),
    ),
    h("dl", { class: "stats stats-3" },
      h("div", {}, h("dt", {}, "1RM estimado"), h("dd", {}, best ? kgText(Math.round(best.e1rm * 2) / 2) : "—")),
      h("div", {}, h("dt", {}, "Mejor serie"), h("dd", { class: "small-dd" }, best ? setLabel(best.best) : "—")),
      h("div", {}, h("dt", {}, "Sesiones"), h("dd", {}, String(hist.length))),
    ),
    lineChart({
      label: `1RM estimado de ${ui.exercise} por sesión`,
      series: [{ points: hist.map((x) => ({ date: x.date, value: x.e1rm })), style: "line", cls: "accent" }, { points: hist.map((x) => ({ date: x.date, value: x.e1rm })), style: "dots", cls: "accent", r: 3 }],
      yFmt: (v) => v.toFixed(0),
      minSpan: 5,
      height: 150,
      emptyText: "Hacen falta al menos 2 sesiones",
    }),
  );
}

function groupsCard(today) {
  const from = addDays(today, -6);
  const counts = setsPerGroup(state.sessions, from, today, (n) => exerciseInfo(n).group);
  const max = Math.max(22, ...Object.values(counts));
  return h("section", { class: "card" },
    h("div", { class: "template-head" }, h("h2", {}, "Series por grupo"), h("span", { class: "muted" }, "últimos 7 días")),
    h("ul", { class: "groups" }, GROUPS.map((g) => {
      const n = counts[g.id] || 0;
      return h("li", { class: n >= 10 && n <= 20 ? "in" : n > 20 ? "over" : "" },
        h("span", { class: "g-name" }, g.name),
        h("span", { class: "g-track" },
          h("span", { class: "g-band", style: { left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` } }),
          h("span", { class: "g-fill", style: { width: `${(n / max) * 100}%` } })),
        h("span", { class: "g-num" }, String(n)),
      );
    })),
    h("p", { class: "hint" }, "Franja: 10–20 series efectivas por semana, lo habitual para hipertrofia. Las de calentamiento no cuentan."),
  );
}

function weeklyCards(today) {
  const weeks = weeklyStats(state, today, 12);
  const label = (w) => `${+w.week.slice(8, 10)}/${+w.week.slice(5, 7)}`;
  return [
    h("section", { class: "card" },
      h("div", { class: "template-head" }, h("h2", {}, "Carga semanal"), h("span", { class: "legend" }, h("i", { class: "lg-sq a" }), "gimnasio", h("i", { class: "lg-sq b" }), "deporte")),
      barChart({ label: "Horas de gimnasio y de deporte por semana", bars: weeks.slice(-8).map((w) => ({ label: label(w), values: [w.gymMin / 60, w.sportMin / 60] })), yFmt: (v) => `${fmt(v, v < 10 ? 1 : 0)} h` }),
      h("p", { class: "hint" }, `Entrenos por semana: ${weeks.slice(-8).map((w) => w.workouts).join(" · ")}`),
    ),
    h("section", { class: "card" },
      h("h2", {}, "Volumen semanal"),
      barChart({ label: "Volumen (kg × repeticiones) por semana", bars: weeks.map((w) => ({ label: label(w), values: [w.volume / 1000] })), yFmt: (v) => `${fmt(v, v < 10 ? 1 : 0)} t` }),
    ),
  ];
}

const TABS = [["cuerpo", "Cuerpo"], ["gimnasio", "Gimnasio"], ["habitos", "Hábitos"]];

export function renderProgress(ctx) {
  const today = dateKey();
  const wk = weekStart(today);
  const sum = weekSummary(state, ui.week === "last" ? addDays(wk, -7) : wk);
  const weekCard = h("section", { class: "card" },
    h("div", { class: "template-head" }, h("h2", {}, rangeText(sum.from, sum.to)), segmented([["last", "Pasada"], ["this", "Esta"]], ui.week, (v) => { ui.week = v; ctx.rerender(); }, "Semana")),
    weekSummaryBlock(sum),
  );

  const sections = {
    cuerpo: () => [weightCard(ctx, today), adviceCard(ctx, today), expenditureCard(today), fatCard(today), recoveryCards(today), entriesCard(ctx)],
    gimnasio: () => [exerciseCard(ctx), groupsCard(today), weeklyCards(today)],
    habitos: () => [heatmapCard(ctx, today), habitRatesCard(today)],
  };

  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Progreso"), h("button", { class: "btn primary small", onClick: () => editEntry(ctx, null) }, "Añadir pesaje")),
    weekCard,
    h("div", { class: "section-tabs" }, segmented(TABS, ui.tab, (v) => { ui.tab = v; ctx.rerender(); }, "Sección")),
    sections[ui.tab](),
  );
}
