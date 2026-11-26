import { h, fmt, num, toast, dec } from "../ui.js";
import {
  state, save, dateKey, addDays, parseKey, habitsForDay, isChecked, toggleCheck, bodyEntry, setBody,
  proteinTotal, addProtein, undoProtein,
} from "../store.js";
import { calorieAdvice, recoveryAlerts, streak, dayCompletion, weekStart, weekSummary, isWorkSet, firstUseDate } from "../logic.js";
import { levelFromPct } from "../charts.js";
import { weekSummaryBlock, rangeText, minutesText } from "./shared.js";
import * as health from "../health.js";

const longDate = (k) => parseKey(k).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

// Las 4 últimas semanas como calendario (L…D), con hoy remarcado.
function miniMap(ctx, today, day) {
  const start = addDays(weekStart(today), -21);
  const first = firstUseDate(state.checks);
  const cells = [];
  for (let i = 0; i < 28; i++) {
    const k = addDays(start, i);
    if (k > today) {
      cells.push(h("span", { class: "mm-cell future", "aria-hidden": "true" }));
      continue;
    }
    const { pct } = dayCompletion(state.habits, state.checks, k);
    const lvl = first && k >= first ? levelFromPct(pct) : null;
    const gym = state.sessions.some((s) => s.date === k && s.exercises.some((e) => e.sets.some(isWorkSet))) || (state.health[k]?.sports || []).length > 0;
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

function proteinCard(ctx, day) {
  const target = state.plan.protein;
  const total = proteinTotal(day);
  const pct = Math.min(1, total / target);
  const add = (g) => () => { addProtein(day, g); ctx.rerender(); };
  return h("section", { class: "card protein", "aria-label": "Proteína del día" },
    h("div", { class: "protein-head" },
      h("h2", {}, "Proteína"),
      h("p", { class: "protein-num" }, h("strong", {}, String(total)), ` / ${target} g`),
    ),
    h("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": target, "aria-valuenow": total, "aria-label": "Proteína" },
      h("div", { class: "meter-fill" + (total >= target ? " full" : ""), style: { width: `${pct * 100}%` } })),
    h("div", { class: "quick" },
      h("button", { class: "btn", onClick: add(20) }, "+20"),
      h("button", { class: "btn", onClick: add(30) }, "+30"),
      h("button", { class: "btn", onClick: add(40) }, "+40"),
      h("button", { class: "btn primary", onClick: add(40) }, "Batido"),
      h("button", { class: "btn ghost", disabled: !total, "aria-label": "Deshacer la última toma", onClick: () => { undoProtein(day); ctx.rerender(); } }, "↶"),
    ),
  );
}

export function renderToday(ctx) {
  const today = dateKey();
  const day = ctx.params.day && ctx.params.day <= today ? ctx.params.day : today;
  const habits = habitsForDay(day);
  const done = habits.filter((x) => isChecked(day, x.id)).length;
  const isToday = day === today;

  const nav = h("header", { class: "day-nav" },
    h("button", { class: "icon-btn", "aria-label": "Día anterior", onClick: () => ctx.go(`#/hoy/${addDays(day, -1)}`) }, "‹"),
    h("div", { class: "day-title" },
      h("span", { class: "day-kicker" }, isToday ? "Hoy" : day === addDays(today, -1) ? "Ayer" : ""),
      h("h1", {}, longDate(day)),
    ),
    h("button", { class: "icon-btn", "aria-label": "Día siguiente", disabled: isToday, onClick: () => ctx.go(addDays(day, 1) === today ? "#/hoy" : `#/hoy/${addDays(day, 1)}`) }, "›"),
  );

  const pct = habits.length ? done / habits.length : 0;
  const days = streak(state.habits, state.checks, today);
  const board = h("section", { class: "scoreboard", "aria-label": `${done} de ${habits.length} hábitos hechos` },
    h("div", { class: "board-top" },
      h("div", { class: "score" },
        h("span", { class: "score-done" }, String(done)),
        h("span", { class: "score-sep" }, "/"),
        h("span", { class: "score-total" }, String(habits.length)),
      ),
      h("div", { class: "streak" }, h("span", { class: "streak-num" }, String(days)), h("span", { class: "streak-label" }, days === 1 ? "día de racha" : "días de racha")),
    ),
    h("div", { class: "score-bar" }, h("div", { class: "score-fill", style: { width: `${pct * 100}%` } })),
    h("p", { class: "score-label" }, habits.length === 0 ? "Sin hábitos programados para este día" : done === habits.length ? "Día completo" : `Te quedan ${habits.length - done}`),
    miniMap(ctx, today, day),
  );

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

  const list = h("ul", { class: "habit-list" },
    habits.map((x) => {
      const on = isChecked(day, x.id);
      const auto = x.id === state.plan.proteinHabitId;
      return h("li", {},
        h("button", {
          class: "habit" + (on ? " on" : ""),
          "aria-pressed": String(on),
          onClick: () => { toggleCheck(day, x.id); ctx.rerender(); },
        },
          h("span", { class: "check", "aria-hidden": "true" }, on ? "✓" : ""),
          h("span", { class: "habit-text" }, h("span", { class: "habit-name" }, x.name), x.detail && h("span", { class: "habit-detail" }, auto ? `${x.detail} · se marca al llegar con el contador` : x.detail)),
        ),
      );
    }),
  );

  const alerts = [];
  if (health.isConnected() && state.google.expired) {
    alerts.push(h("div", { class: "alert warn" },
      h("p", {}, "El permiso semanal de Google Health ha caducado."),
      h("button", { class: "btn small", onClick: () => health.connect() }, "Volver a conectar"),
    ));
  }
  for (const a of recoveryAlerts(state.health, today)) alerts.push(h("div", { class: "alert warn" }, h("p", {}, a.text)));
  const advice = calorieAdvice({ body: state.body, habits: state.habits, checks: state.checks, today });
  if (advice.action !== "nodata") {
    alerts.push(h("a", { class: `alert advice ${advice.action}`, href: "#/progreso" },
      h("strong", {}, advice.title), h("span", {}, advice.detail),
    ));
  }

  const entry = bodyEntry(day);
  const w = h("input", { type: "text", inputmode: "decimal", placeholder: "kg", value: dec(entry?.weight), "aria-label": "Peso en kg" });
  const f = h("input", { type: "text", inputmode: "decimal", placeholder: "%", value: dec(entry?.fat), "aria-label": "Grasa corporal en %" });
  const bodyForm = h("form", {
    class: "card body-form",
    onSubmit: (e) => {
      e.preventDefault();
      const wv = num(w.value);
      const fv = num(f.value);
      if ((w.value && wv == null) || (f.value && fv == null)) return toast("Escribe números, por ejemplo 90,4", "error");
      setBody(day, wv, fv);
      toast(wv == null && fv == null ? "Registro borrado" : "Peso guardado");
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

  let healthCard = null;
  if (health.isConnected()) {
    const d = state.health[day] || {};
    const sleep = d.sleepMin != null ? minutesText(d.sleepMin) : "—";
    healthCard = h("section", { class: "card" },
      h("h2", {}, "Fitbit"),
      h("dl", { class: "stats" },
        h("div", {}, h("dt", {}, "Sueño"), h("dd", {}, sleep)),
        h("div", {}, h("dt", {}, "Pulso en reposo"), h("dd", {}, d.rhr != null ? `${d.rhr} lpm` : "—")),
        h("div", {}, h("dt", {}, "Pasos"), h("dd", {}, d.steps != null ? d.steps.toLocaleString("es-ES") : "—")),
        h("div", {}, h("dt", {}, "Kcal gastadas"), h("dd", {}, d.kcal != null ? d.kcal.toLocaleString("es-ES") : "—")),
      ),
      (d.sports || []).length > 0 && h("ul", { class: "sports" }, d.sports.map((x) => h("li", {},
        h("span", {}, x.name), h("span", { class: "muted" }, `${minutesText(x.min)} · ${x.kcal.toLocaleString("es-ES")} kcal`)))),
      h("p", { class: "hint" }, "Las kcal y los pasos de la pulsera son orientativos: para ajustar calorías manda la báscula."),
    );
  }

  const sessions = state.sessions.filter((s) => s.date === day);
  const sessionCard = h("section", { class: "card" }, h("h2", {}, "Gimnasio"),
    sessions.map((s) => h("a", { class: "link-row", href: `#/entreno/${s.id}` }, s.name, h("span", { class: "muted" }, s.finishedAt ? "Terminado" : "En curso"))),
    isToday && !sessions.some((s) => !s.finishedAt) && h("a", { class: "btn ghost block", href: "#/rutina" }, sessions.length ? "Otro entreno" : "Empezar entreno"),
  );

  return h("frag", {}, nav, board, weekly, list, proteinCard(ctx, day), alerts.length > 0 && h("div", { class: "alerts" }, alerts), bodyForm, healthCard,
    (sessions.length > 0 || isToday) && sessionCard);
}
