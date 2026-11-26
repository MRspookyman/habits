import { h, sheet, field, num, qty, dec, toast, segmented, pageHead, actionButton } from "../ui.js";
import { icon } from "../icons.js";
import { state, save, dateKey, parseKey, addDays, habitsForDay, isChecked, isSkipped, toggleCheck, setSkips, bodyEntry, addAmount, undoAmount, applyKcal } from "../store.js";
import { calorieAdvice, recoveryAlerts, streak, dayCompletion, weekStart, weekSummary, firstUseDate, habitDone, amountTotal, doneInWeek } from "../logic.js";
import { weekSummaryBlock, rangeText, minutesText, ROLE_HINT, editBody } from "./shared.js";
import { editHabit, habitIcon, habitStyle } from "./habits.js";
import { calendar, longDate } from "./calendar.js";
import * as health from "../health.js";

const ui = { filter: "all", day: null, healthOpen: false };
const filters = [["all", "Todos"], ["pending", "Pendientes"], ["done", "Hechos"]];
function journalDay(key) {
  const today = dateKey();
  return key && /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= today && dateKey(parseKey(key)) === key ? key : today;
}
const fold = (key, summary, ...content) =>
  h("details", { class: "fold", open: ui[key], onToggle: (e) => (ui[key] = e.target.open) }, h("summary", {}, summary), ...content);

function notices(ctx, today, isToday) {
  // Avisos que piden hacer algo.
  const alerts = [];
  const first = firstUseDate(state);
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
          h("a", { class: "btn ghost small", href: "#/progreso/cuerpo" }, "Ver progreso"),
        ),
      ));
    }
    for (const r of recoveryAlerts(state.health, today)) alerts.push(h("div", { class: "alert warn" }, h("p", {}, r.text)));
    const b = state.backup;
    const since = b.lastExport ? Math.floor((Date.now() - b.lastExport) / 86400000) : null;
    if (!b.cloud && first && first <= addDays(today, -14) && (since == null || since > 30)) {
      alerts.push(h("a", { class: "alert warn", href: "#/ajustes/datos" },
        h("strong", {}, "Haz una copia de seguridad"),
        h("span", {}, since == null ? "Tus datos solo están en este móvil. Activa la copia automática en Ajustes." : `La última fue hace ${since} días. Activa la copia automática en Ajustes.`),
      ));
    }
  }

  // Resumen de la semana pasada, los lunes, hasta que se cierre.
  let weekly = null;
  const thisWeek = weekStart(today);
  if (isToday && first && first < thisWeek && parseKey(today).getDay() === 1 && state.ui.weeklyDismissed !== thisWeek) {
    const sum = weekSummary(state, addDays(thisWeek, -7));
    weekly = h("section", { class: "card week-card" },
      h("div", { class: "template-head" },
        h("h2", {}, `Tu semana · ${rangeText(sum.from, sum.to)}`),
        h("button", { class: "icon-btn", "aria-label": "Cerrar resumen", onClick: () => { state.ui.weeklyDismissed = thisWeek; save(); ctx.rerender(); } }, icon("x", 16)),
      ),
      weekSummaryBlock(sum),
    );
  }

  return h("frag", {}, alerts.length > 0 && h("div", { class: "alerts" }, alerts), weekly);
}

function healthSummary(day) {
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

  return healthCard;
}

function score(day, comp) {
  const percent = Math.round((comp.pct || 0) * 100);
  const days = streak(state, day);
  return h("section", { class: "day-hero", "aria-label": "Progreso diario" },
    h("div", { class: "hero-content" },
      h("div", { class: "hero-label" }, icon("sunrise", 19), "Progreso diario"),
      h("div", { class: "hero-score", "aria-label": `${comp.done} de ${comp.scheduled}` },
        h("strong", {}, String(comp.done)), comp.scheduled > 0 && h("span", { class: "score-slash" }, "/"), comp.scheduled > 0 && h("span", { class: "score-total" }, String(comp.scheduled))),
      h("p", {}, comp.scheduled ? "hábitos completados" : "hábitos previstos para este día"),
      comp.scheduled > 0 && h("div", { class: "hero-progress" },
        h("div", { class: "hero-track", role: "progressbar", "aria-label": "Hábitos completados", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent },
          h("i", { style: { width: percent + "%" } })),
        h("strong", {}, percent + " %"))),
    h("a", { class: "hero-streak", href: "#/progreso/habitos" }, icon("flame", 15), `${days} ${days === 1 ? "día" : "días"} de racha`),
  );
}

function logAmount(ctx, x, day, value) {
  if (isSkipped(day, x.id)) setSkips(day, [x.id], false);
  addAmount(day, x.id, value);
  ctx.rerender();
  toast(`+${qty(value)} ${x.unit} · ${x.name}`);
}

function amountSheet(ctx, x, day) {
  sheet(x.name, (close) => {
    const total = amountTotal(state, day, x.id);
    const unit = x.unit ? " " + x.unit : "";
    const input = h("input", { type: "text", inputmode: "decimal", placeholder: "0", required: true });
    const add = (v) => { close(); logAmount(ctx, x, day, v); };
    return h("frag", {},
      h("div", { class: "amount-summary" }, habitIcon(x), h("div", {}, h("strong", {}, qty(total) + unit), h("p", {}, `Objetivo del día · ${qty(x.target)}${unit}`))),
      x.quick.length > 0 && h("div", { class: "quick-values" }, x.quick.map((v) => h("button", { class: "btn soft", onClick: () => add(v) }, "+" + qty(v) + unit))),
      h("form", { onSubmit: (e) => {
        e.preventDefault();
        const v = num(input.value);
        if (!(v > 0)) return toast("Introduce una cantidad mayor que cero.", "error");
        add(v);
      } }, field("Otra cantidad" + (x.unit ? ` (${x.unit})` : ""), input), h("div", { class: "row end" },
        h("button", { type: "button", class: "btn ghost", disabled: !total, onClick: () => { undoAmount(day, x.id); close(); ctx.rerender(); toast("Última cantidad retirada"); } }, icon("undo", 16), "Deshacer última"),
        h("button", { class: "btn primary", type: "submit" }, "Añadir cantidad"))),
    );
  });
}

function mark(ctx, x, day) {
  if (isSkipped(day, x.id)) setSkips(day, [x.id], false);
  else if (habitDone(state, x, day) && !isChecked(day, x.id)) {
    return toast(x.kind === "amount" ? "Objetivo alcanzado. Puedes deshacer la última cantidad en el contador." : "Completado automáticamente con tus registros.");
  } else toggleCheck(day, x.id);
  ctx.rerender();
}

function optionsSheet(ctx, x, day) {
  const skipped = isSkipped(day, x.id);
  const done = habitDone(state, x, day);
  sheet(x.name, (close) => {
    const option = (symbol, label, act) => h("button", { class: "menu-option", onClick: () => { close(); act(); } }, icon(symbol), label, icon("right", 16));
    return h("div", { class: "option-list" },
      x.kind === "amount" && option("plus", "Registrar cantidad", () => amountSheet(ctx, x, day)),
      (x.kind === "amount" || x.role === "weigh") && !skipped && (!done || isChecked(day, x.id)) && option("check", done ? "Desmarcar hábito" : "Marcar como hecho", () => mark(ctx, x, day)),
      !done && option(skipped ? "undo" : "skip", skipped ? "Volver a contar este día" : "Omitir este día", () => { setSkips(day, [x.id], !skipped); ctx.rerender(); }),
      option("edit", "Editar hábito", () => editHabit(ctx, x)));
  });
}

function habitRow(ctx, x, day) {
  const done = habitDone(state, x, day);
  const skipped = !done && isSkipped(day, x.id);
  const amount = x.kind === "amount";
  const total = amount ? amountTotal(state, day, x.id) : 0;
  const base = amount ? `${qty(total)} de ${qty(x.target)} ${x.unit}`.trim() : x.detail || ROLE_HINT[x.role]?.(x) || habitStyle(x)[2];
  const detail = [skipped ? "Omitido este día" : base, x.perWeek && `${doneInWeek(state, x, day)}/${x.perWeek} esta semana`].filter(Boolean).join(" · ");
  const weigh = x.role === "weigh" && !skipped && !isChecked(day, x.id);
  const toggle = () => {
    if (weigh) return editBody(ctx, bodyEntry(day), day);
    if (amount && !skipped) return amountSheet(ctx, x, day);
    mark(ctx, x, day);
  };
  const actionLabel = skipped ? "Retomar " : weigh ? "Registrar peso para " : amount ? "Ver contador de " : done ? "Desmarcar " : "Completar ";
  const check = h("span", { class: "check-ring" }, (done || skipped) && icon(done ? "check" : "skip", 16));
  const quick = x.quick?.[0];
  return h("li", { class: "daily-item" + (done ? " done" : "") + (skipped ? " skipped" : "") },
    h("button", { class: "habit-main", "data-focus": "habit-" + x.id, "aria-label": actionLabel + x.name,
      "aria-pressed": !amount && !skipped && !weigh ? String(done) : null, "aria-haspopup": !skipped && (weigh || amount) ? "dialog" : null, onClick: toggle },
      habitIcon(x), h("span", { class: "habit-copy" }, h("strong", {}, x.name), h("span", { class: "habit-detail" }, detail),
        amount && !skipped && h("span", { class: "amount-track", "aria-hidden": "true" }, h("i", { style: { width: Math.min(100, total / x.target * 100) + "%" } }))),
      !amount && x.remind && !skipped && h("span", { class: "reminder-tag" }, icon("clock", 13), x.remind),
      (!amount || skipped || done) && check),
    amount && !skipped && h("button", { class: "quick-add", "data-focus": "add-" + x.id, "aria-label": quick ? `Añadir ${qty(quick)} ${x.unit} a ${x.name}` : "Añadir cantidad a " + x.name, onClick: () => quick ? logAmount(ctx, x, day, quick) : amountSheet(ctx, x, day) }, icon("plus", 14), quick && (qty(quick) + " " + x.unit).trim()),
    h("button", { class: "icon-btn habit-more", "data-focus": "more-" + x.id, "aria-label": "Opciones de " + x.name, onClick: () => optionsSheet(ctx, x, day) }, icon("more", 17)),
  );
}

function dailyHabits(ctx, day, habits) {
  const pending = habits.filter((x) => !habitDone(state, x, day));
  const visible = habits.filter((x) => {
    if (ui.filter === "done") return habitDone(state, x, day);
    if (ui.filter === "pending") return !habitDone(state, x, day) && !isSkipped(day, x.id);
    return true;
  });
  const off = pending.length > 0 && pending.every((x) => isSkipped(day, x.id));
  const selectFilter = (v) => { ui.filter = v; ctx.rerender(); };
  return h("section", { class: "card daily-list" },
    h("div", { class: "list-heading" }, h("h2", {}, "Hábitos del día"), h("span", { class: "count" }, String(habits.length)),
      h("label", { class: "mobile-filter" }, h("select", { "aria-label": "Filtrar hábitos", "data-focus": "daily-filter", onChange: (e) => selectFilter(e.target.value) },
        filters.map(([v, name]) => h("option", { value: v, selected: ui.filter === v }, name))), icon("down", 13))),
    segmented(filters, ui.filter, selectFilter, "Filtrar hábitos"),
    visible.length ? h("ul", { class: "habit-list" }, visible.map((x) => habitRow(ctx, x, day)))
      : h("div", { class: "empty-list" }, icon(ui.filter === "pending" ? "check" : "layers", 24),
          h("p", {}, !habits.length ? "Sin hábitos programados para este día." : ui.filter === "pending" ? "Has resuelto todos los hábitos del día." : "Los hábitos que completes aparecerán aquí.")),
    pending.length > 0 && h("button", { class: "day-off", "data-focus": "day-off", onClick: () => { setSkips(day, pending.map((x) => x.id), !off); ctx.rerender(); } },
      icon(off ? "undo" : "moon", 16), off ? "Retomar hábitos omitidos" : "Tomar el día libre"),
  );
}

const access = (tag, props, symbol, tone, label, detail) => h(tag, { class: "access-row", ...props },
  h("span", { class: "tile tone-" + tone }, icon(symbol, 19)),
  h("span", { class: "access-copy" }, h("strong", {}, label), h("small", {}, detail)), icon("right", 16));

function recordRows(ctx, day, today, leave = () => {}) {
  const entry = bodyEntry(day);
  const sessions = state.sessions.filter((s) => s.date === day);
  return h("frag", {},
    access("button", { onClick: () => { leave(); editBody(ctx, entry, day); } }, "scale", "sand", entry ? "Editar pesaje" : "Registrar peso", entry?.weight != null ? qty(entry.weight) + " kg" : "Peso y grasa corporal"),
    sessions.map((s) => access("a", { href: "#/entreno/" + s.id, onClick: leave }, "gym", "sage", s.name, s.finishedAt ? "Entrenamiento terminado" : "Sesión en curso")),
    day === today && !sessions.some((s) => !s.finishedAt) && access("a", { href: "#/rutina", onClick: leave }, "gym", "sage", "Entrenar", "Sesión libre o plantilla"));
}

export function showCapture(ctx) {
  const day = journalDay(ctx.params.day);
  sheet("Registrar", (close) => h("div", { class: "capture-list" }, h("p", { class: "capture-date" }, longDate(day)),
    recordRows(ctx, day, dateKey(), close),
    habitsForDay(day).filter((x) => x.kind === "amount").map((x) => {
      const [symbol, tone] = habitStyle(x);
      return access("button", { onClick: () => { close(); amountSheet(ctx, x, day); } }, symbol, tone, x.name, `${qty(amountTotal(state, day, x.id))} de ${qty(x.target)} ${x.unit}`);
    }),
    access("button", { onClick: () => { close(); editHabit(ctx); } }, "plus", "mint", "Nuevo hábito", "Añadir al diario desde hoy")));
}

export function renderToday(ctx) {
  const today = dateKey();
  const day = journalDay(ctx.params.day);
  if (ui.day !== day) { ui.filter = "all"; ui.day = day; }
  const pick = (d) => ctx.go(d === today ? "#/hoy" : "#/hoy/" + d);
  const dateButton = h("button", { class: "date-button", "aria-label": "Elegir fecha, " + longDate(day), onClick: () => {
    sheet("Elegir fecha", (close) => calendar(day, (d) => { close(); pick(d); }));
  } }, icon("calendar", 15), h("span", { class: "date-long" }, longDate(day)), h("span", { class: "date-short" }, parseKey(day).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })), icon("down", 13));
  return h("frag", {},
    pageHead(day === today ? "Mi día" : "Mi diario", null, actionButton("Nuevo hábito", "plus", () => editHabit(ctx)), dateButton),
    score(day, dayCompletion(state, day)),
    notices(ctx, today, day === today),
    h("div", { class: "day-layout" }, dailyHabits(ctx, day, habitsForDay(day)),
      h("div", { class: "day-aside" },
        h("section", { class: "card calendar-card" }, h("div", { class: "aside-heading" }, h("h2", {}, "Calendario"), icon("calendar", 19)), calendar(day, pick)),
        h("section", { class: "card quick-records" }, h("h2", {}, "Registro rápido"), recordRows(ctx, day, today)), healthSummary(day))),
  );
}
