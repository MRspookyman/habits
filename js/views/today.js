import { h, fmt, num, toast, dec } from "../ui.js";
import { state, dateKey, addDays, parseKey, habitsForDay, isChecked, toggleCheck, bodyEntry, setBody } from "../store.js";
import { calorieAdvice, recoveryAlerts } from "../logic.js";
import * as health from "../health.js";

const longDate = (k) =>
  parseKey(k).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

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
  const board = h("section", { class: "scoreboard", "aria-label": `${done} de ${habits.length} hábitos hechos` },
    h("div", { class: "score" },
      h("span", { class: "score-done" }, String(done)),
      h("span", { class: "score-sep" }, "/"),
      h("span", { class: "score-total" }, String(habits.length)),
    ),
    h("div", { class: "score-bar" }, h("div", { class: "score-fill", style: { width: `${pct * 100}%` } })),
    h("p", { class: "score-label" }, habits.length === 0 ? "Sin hábitos programados para este día" : done === habits.length ? "Día completo" : `Te quedan ${habits.length - done}`),
  );

  const list = h("ul", { class: "habit-list" },
    habits.map((x) => {
      const on = isChecked(day, x.id);
      return h("li", {},
        h("button", {
          class: "habit" + (on ? " on" : ""),
          "aria-pressed": String(on),
          onClick: () => { toggleCheck(day, x.id); ctx.rerender(); },
        },
          h("span", { class: "check", "aria-hidden": "true" }, on ? "✓" : ""),
          h("span", { class: "habit-text" }, h("span", { class: "habit-name" }, x.name), x.detail && h("span", { class: "habit-detail" }, x.detail)),
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
    const sleep = d.sleepMin != null ? `${Math.floor(d.sleepMin / 60)} h ${String(d.sleepMin % 60).padStart(2, "0")}` : "—";
    healthCard = h("section", { class: "card" },
      h("h2", {}, "Fitbit"),
      h("dl", { class: "stats" },
        h("div", {}, h("dt", {}, "Sueño"), h("dd", {}, sleep)),
        h("div", {}, h("dt", {}, "Pulso en reposo"), h("dd", {}, d.rhr != null ? `${d.rhr} lpm` : "—")),
        h("div", {}, h("dt", {}, "Pasos"), h("dd", {}, d.steps != null ? d.steps.toLocaleString("es-ES") : "—")),
        h("div", {}, h("dt", {}, "Kcal gastadas"), h("dd", {}, d.kcal != null ? d.kcal.toLocaleString("es-ES") : "—")),
      ),
      h("p", { class: "hint" }, "Las kcal y los pasos de la pulsera son orientativos: para ajustar calorías manda la báscula."),
    );
  }

  const sessions = state.sessions.filter((s) => s.date === day);
  const sessionCard = sessions.length
    ? h("section", { class: "card" }, h("h2", {}, "Entreno"),
        sessions.map((s) => h("a", { class: "link-row", href: `#/entreno/${s.id}` }, s.name, h("span", { class: "muted" }, `${s.exercises.length} ejercicios`))))
    : null;

  return h("frag", {}, nav, board, list, alerts.length > 0 && h("div", { class: "alerts" }, alerts), bodyForm, healthCard, sessionCard,
    entry?.weight != null && h("p", { class: "hint center" }, `Registrado: ${fmt(entry.weight)} kg${entry.fat != null ? ` · ${fmt(entry.fat)} %` : ""}`));
}
