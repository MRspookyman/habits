import { h, num, qty, toast, dec, sheet, field } from "../ui.js";
import {
  state, save, dateKey, addDays, parseKey, habitsForDay, isChecked, isSkipped, toggleCheck, setSkips,
  bodyEntry, setBody, addAmount, undoAmount, applyKcal,
} from "../store.js";
import {
  calorieAdvice, recoveryAlerts, streak, dayCompletion, weekStart, weekSummary, firstUseDate,
  habitDone, amountTotal, doneInWeek, trainedOn,
} from "../logic.js";
import { levelFromPct } from "../charts.js";
import { weekSummaryBlock, rangeText, minutesText, ROLE_HINT } from "./shared.js";
import * as health from "../health.js";

const longDate = (k) => parseKey(k).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const ui = { mapOpen: false, healthOpen: false };

// <details> que recuerda si estaba abierto entre repintados.
const fold = (key, summary, ...content) =>
  h("details", { class: "fold", open: ui[key], onToggle: (e) => (ui[key] = e.target.open) }, h("summary", {}, summary), ...content);

// Las 4 últimas semanas como calendario (L…D), con hoy remarcado.
function miniMap(ctx, today, day) {
  const start = addDays(weekStart(today), -21);
  const first = firstUseDate(state);
  const cells = [];
  for (let i = 0; i < 28; i++) {
    const k = addDays(start, i);
    if (k > today) {
      cells.push(h("span", { class: "mm-cell future", "aria-hidden": "true" }));
      continue;
    }
    const { pct } = dayCompletion(state, k);
    const lvl = first && k >= first ? levelFromPct(pct) : null;
    const gym = trainedOn(state, k);
    cells.push(h("button", {
      class: `mm-cell l${lvl ?? "x"}${k === today ? " today" : ""}${k === day && k !== today ? " sel" : ""}${gym ? " mark" : ""}`,
      "aria-current": k === day ? "date" : null,
      "aria-label": `${longDate(k)}: ${pct == null ? "sin hábitos" : `${Math.round(pct * 100)} %`}${gym ? ", con entreno" : ""}`,
      onClick: () => ctx.go(k === today ? "#/hoy" : `#/hoy/${k}`),
    }));
  }
  return h("div", { class: "minimap" },
    h("div", { class: "mm-head", "aria-hidden": "true" }, ["L", "M", "X", "J", "V", "S", "D"].map((d) => h("span", {}, d))),
    h("div", { class: "mm-grid" }, cells),
  );
}

function customAmount(ctx, x, day) {
  sheet(`Añadir a ${x.name}`, (close) => {
    const input = h("input", { type: "text", inputmode: "decimal", placeholder: x.unit || "cantidad", required: true });
    setTimeout(() => input.focus(), 50);
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      const v = num(input.value);
      if (v == null || v <= 0) return toast("Escribe una cantidad, por ejemplo 35", "error");
      addAmount(day, x.id, v);
      close();
      ctx.rerender();
    } },
      field(`Cantidad${x.unit ? ` (${x.unit})` : ""}`, input),
      h("div", { class: "row end" }, h("button", { class: "btn primary", type: "submit" }, "Añadir")),
    );
  });
}

function habitRow(ctx, x, day) {
  const done = habitDone(state, x, day);
  const manual = isChecked(day, x.id);
  const skipped = !done && isSkipped(day, x.id);
  const amount = x.kind === "amount";
  const total = amount ? amountTotal(state, day, x.id) : 0;

  const meta = [x.detail];
  if (x.perWeek) meta.push(`${doneInWeek(state, x, day)}/${x.perWeek} esta semana`);
  if (!amount && x.role && ROLE_HINT[x.role]) meta.push(ROLE_HINT[x.role](x));
  if (skipped) meta.push("omitido: no cuenta");
  const detail = meta.filter(Boolean).join(" · ");

  const toggle = h("button", {
    class: "habit" + (done ? " on" : "") + (skipped ? " skipped" : ""),
    "aria-pressed": String(done),
    onClick: () => {
      if (skipped) setSkips(day, [x.id], false);
      else if (done && !manual) return toast(amount ? "Llegó al objetivo con el contador; usa ↶ para quitar." : "Se ha marcado solo con tus datos.");
      else toggleCheck(day, x.id);
      ctx.rerender();
    },
  },
    h("span", { class: "check", "aria-hidden": "true" }, done ? "✓" : skipped ? "–" : ""),
    h("span", { class: "habit-text" }, h("span", { class: "habit-name" }, x.name), detail && h("span", { class: "habit-detail" }, detail)),
    amount && h("span", { class: "habit-amount" }, h("strong", {}, qty(total)), ` / ${qty(x.target)} ${x.unit}`),
  );
  const skipBtn = !done && h("button", {
    class: "skip-btn",
    "aria-label": skipped ? `Volver a contar ${x.name}` : `Omitir ${x.name} este día`,
    onClick: () => { setSkips(day, [x.id], !skipped); ctx.rerender(); },
  }, skipped ? "Deshacer" : "Omitir");

  if (!amount) return h("li", { class: "habit-item" }, toggle, skipBtn);

  const add = (v) => () => { addAmount(day, x.id, v); ctx.rerender(); };
  return h("li", { class: "habit-item amount" + (done ? " on" : "") },
    h("div", { class: "habit-row" }, toggle, skipBtn),
    h("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": x.target, "aria-valuenow": total, "aria-label": x.name },
      h("div", { class: "meter-fill" + (total >= x.target ? " full" : ""), style: { width: `${Math.min(1, total / x.target) * 100}%` } })),
    h("div", { class: "quick" },
      x.quick.map((v) => h("button", { class: "btn", onClick: add(v) }, `+${dec(v)}`)),
      h("button", { class: "btn ghost", onClick: () => customAmount(ctx, x, day) }, "Otra"),
      h("button", { class: "btn ghost", disabled: !total, "aria-label": `Deshacer lo último de ${x.name}`, onClick: () => { undoAmount(day, x.id); ctx.rerender(); } }, "↶"),
    ),
  );
}

export function renderToday(ctx) {
  const today = dateKey();
  const day = ctx.params.day && ctx.params.day <= today ? ctx.params.day : today;
  const isToday = day === today;
  const habits = habitsForDay(day);
  const comp = dayCompletion(state, day);

  const nav = h("header", { class: "day-nav" },
    h("button", { class: "icon-btn", "aria-label": "Día anterior", onClick: () => ctx.go(`#/hoy/${addDays(day, -1)}`) }, "‹"),
    h("div", { class: "day-title" },
      h("span", { class: "day-kicker" }, isToday ? "Hoy" : day === addDays(today, -1) ? "Ayer" : ""),
      h("h1", {}, longDate(day)),
    ),
    h("button", { class: "icon-btn", "aria-label": "Día siguiente", disabled: isToday, onClick: () => ctx.go(addDays(day, 1) === today ? "#/hoy" : `#/hoy/${addDays(day, 1)}`) }, "›"),
  );

  const days = streak(state, today);
  const left = comp.scheduled - comp.done;
  const board = h("section", { class: "scoreboard", "aria-label": `${comp.done} de ${comp.scheduled} hábitos hechos` },
    h("div", { class: "board-top" },
      h("div", { class: "score" },
        h("span", { class: "score-done" }, String(comp.done)),
        h("span", { class: "score-sep" }, "/"),
        h("span", { class: "score-total" }, String(comp.scheduled)),
      ),
      h("div", { class: "streak" }, h("span", { class: "streak-num" }, String(days)), h("span", { class: "streak-label" }, days === 1 ? "día de racha" : "días de racha")),
    ),
    h("div", { class: "score-bar" }, h("div", { class: "score-fill", style: { width: `${(comp.pct ?? 0) * 100}%` } })),
    h("p", { class: "score-label" }, comp.scheduled === 0 ? "Nada pendiente para este día" : left === 0 ? "Día completo" : `Te quedan ${left}`),
    fold("mapOpen", "Últimas 4 semanas", miniMap(ctx, today, day)),
  );

  // Avisos que piden hacer algo.
  const alerts = [];
  if (health.isConnected() && state.google.expired) {
    alerts.push(h("div", { class: "alert warn" },
      h("p", {}, "El permiso semanal de Google Health ha caducado."),
      h("button", { class: "btn small", onClick: () => health.connect() }, "Volver a conectar"),
    ));
  }
  if (isToday) {
    const a = calorieAdvice(state, today);
    if (["up", "down", "comply"].includes(a.action)) {
      alerts.push(h("div", { class: `alert advice ${a.action}` },
        h("strong", {}, a.title), h("span", {}, a.detail),
        h("div", { class: "row" },
          a.next != null && h("button", { class: "btn primary small", onClick: () => { applyKcal(a.next, today); toast(`Objetivo: ${qty(a.next)} kcal`); ctx.rerender(); } }, "Aplicar"),
          h("a", { class: "btn ghost small", href: "#/progreso" }, "Ver progreso"),
        ),
      ));
    }
    for (const r of recoveryAlerts(state.health, today)) alerts.push(h("div", { class: "alert warn" }, h("p", {}, r.text)));
    const b = state.backup;
    const first = firstUseDate(state);
    const since = b.lastExport ? Math.floor((Date.now() - b.lastExport) / 86400000) : null;
    if (!b.cloud && first && first <= addDays(today, -14) && (since == null || since > 30)) {
      alerts.push(h("a", { class: "alert warn", href: "#/ajustes" },
        h("strong", {}, "Haz una copia de seguridad"),
        h("span", {}, since == null ? "Tus datos solo están en este móvil. Activa la copia automática en Ajustes." : `La última fue hace ${since} días. Activa la copia automática en Ajustes.`),
      ));
    }
  }

  // Resumen de la semana pasada, los lunes, hasta que se cierre.
  let weekly = null;
  const thisWeek = weekStart(today);
  if (isToday && parseKey(today).getDay() === 1 && state.ui.weeklyDismissed !== thisWeek) {
    const sum = weekSummary(state, addDays(thisWeek, -7));
    weekly = h("section", { class: "card week-card" },
      h("div", { class: "template-head" },
        h("h2", {}, `Tu semana · ${rangeText(sum.from, sum.to)}`),
        h("button", { class: "icon-btn", "aria-label": "Cerrar resumen", onClick: () => { state.ui.weeklyDismissed = thisWeek; save(); ctx.rerender(); } }, "✕"),
      ),
      weekSummaryBlock(sum),
    );
  }

  const pendingIds = habits.filter((x) => !habitDone(state, x, day)).map((x) => x.id);
  const dayOff = pendingIds.length > 0 && pendingIds.every((id) => isSkipped(day, id));
  const list = h("section", { class: "stack" },
    h("ul", { class: "habit-list" }, habits.map((x) => habitRow(ctx, x, day))),
    pendingIds.length > 0 && h("button", {
      class: "link-btn",
      onClick: () => { setSkips(day, pendingIds, !dayOff); ctx.rerender(); },
    }, dayOff ? "Quitar el día libre" : "Día libre: omitir lo pendiente (enfermo, viaje…)"),
  );

  const entry = bodyEntry(day);
  const w = h("input", { type: "text", inputmode: "decimal", placeholder: "kg", value: dec(entry?.weight), "aria-label": "Peso en kg" });
  const f = h("input", { type: "text", inputmode: "decimal", placeholder: "%", value: dec(entry?.fat), "aria-label": "Grasa corporal en %" });
  if (ctx.params.focusWeight) setTimeout(() => { w.scrollIntoView({ block: "center" }); w.focus(); }, 50);
  const bodyForm = h("form", {
    class: "card body-form",
    onSubmit: (e) => {
      e.preventDefault();
      const wv = num(w.value);
      const fv = num(f.value);
      if ((w.value && wv == null) || (f.value && fv == null)) return toast("Escribe números, por ejemplo 90,4", "error");
      setBody(day, wv, fv);
      toast(wv == null && fv == null ? "Registro borrado" : "Peso guardado");
      if (ctx.params.focusWeight) return ctx.go("#/hoy");
      ctx.rerender();
    },
  },
    h("h2", {}, "Báscula"),
    h("div", { class: "row" },
      h("label", { class: "mini-field" }, h("span", {}, "Peso"), w),
      h("label", { class: "mini-field" }, h("span", {}, "Grasa"), f),
      h("button", { class: "btn primary", type: "submit" }, entry ? "Actualizar" : "Guardar"),
    ),
  );

  const sessions = state.sessions.filter((s) => s.date === day);
  const sessionCard = (sessions.length > 0 || isToday) && h("section", { class: "card" }, h("h2", {}, "Gimnasio"),
    sessions.map((s) => h("a", { class: "link-row", href: `#/entreno/${s.id}` }, s.name, h("span", { class: "muted" }, s.finishedAt ? "Terminado" : "En curso"))),
    isToday && !sessions.some((s) => !s.finishedAt) && h("a", { class: "btn ghost block", href: "#/rutina" }, sessions.length ? "Otro entreno" : "Empezar entreno"),
  );

  let healthCard = null;
  if (health.isConnected()) {
    const d = state.health[day] || {};
    healthCard = h("section", { class: "card" },
      fold("healthOpen", h("h2", {}, "Fitbit", h("span", { class: "muted fold-meta" }, d.sleepMin != null ? ` · ${minutesText(d.sleepMin)} de sueño` : "")),
        h("dl", { class: "stats" },
          h("div", {}, h("dt", {}, "Sueño"), h("dd", {}, d.sleepMin != null ? minutesText(d.sleepMin) : "—")),
          h("div", {}, h("dt", {}, "Pulso en reposo"), h("dd", {}, d.rhr != null ? `${d.rhr} lpm` : "—")),
          h("div", {}, h("dt", {}, "Pasos"), h("dd", {}, d.steps != null ? d.steps.toLocaleString("es-ES") : "—")),
          h("div", {}, h("dt", {}, "Kcal gastadas"), h("dd", {}, d.kcal != null ? d.kcal.toLocaleString("es-ES") : "—")),
        ),
        (d.sports || []).length > 0 && h("ul", { class: "sports" }, d.sports.map((x) => h("li", {},
          h("span", {}, x.name), h("span", { class: "muted" }, `${minutesText(x.min)} · ${x.kcal.toLocaleString("es-ES")} kcal`)))),
        h("p", { class: "hint" }, "Las kcal y los pasos de la pulsera son orientativos: para ajustar calorías manda la báscula."),
      ),
    );
  }

  return h("frag", {}, nav, board, alerts.length > 0 && h("div", { class: "alerts" }, alerts), weekly, list, bodyForm, sessionCard, healthCard);
}
