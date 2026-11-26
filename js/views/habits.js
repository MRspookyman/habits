import { h, sheet, confirmSheet, toast, dayPicker, field, segmented, num, qty, dec, pageHead, actionButton } from "../ui.js";
import { icon } from "../icons.js";
import { state, save, newHabit, DAY_LETTERS } from "../store.js";
import * as push from "../push.js";

const daysText = (days) =>
  days.length === 7 ? "Cada día" : days.length === 0 ? "Sin días" : days.map((d) => DAY_LETTERS[d]).join(" · ");
export const freqText = (x) => (x.perWeek ? `${x.perWeek} ${x.perWeek === 1 ? "vez" : "veces"}/semana` : daysText(x.days));

const ROLES = {
  check: [["", "No, a mano"], ["sleep", "Con el sueño de la Fitbit"], ["gym", "Al hacer un entreno o deporte"], ["weigh", "Al apuntar el peso"]],
  amount: [["", "No"], ["kcal", "Sí: objetivo de calorías"], ["protein", "Sí: objetivo de proteína"]],
};

export function editHabit(ctx, existing = null) {
  const x = existing ? structuredClone(existing) : newHabit();
  sheet(existing ? "Editar hábito" : "Nuevo hábito", (close) => {
    const name = h("input", { type: "text", value: x.name, required: true, autofocus: true, placeholder: "Ej. Salir a caminar" });
    const detail = h("input", { type: "text", value: x.detail, placeholder: "Ej. 20 minutos después de comer" });
    const remind = h("input", { type: "time", value: x.remind || "" });
    const active = h("input", { type: "checkbox", checked: x.active });

    // Tipo (casilla o cantidad) y lo que depende de él.
    const kindBox = h("div");
    const autoBox = h("div");
    const drawKind = () => {
      const roleSelect = h("select", { onChange: (e) => { x.role = e.target.value || null; if (x.role === "sleep") x.target ||= 8; drawKind(); } },
        ROLES[x.kind].map(([v, t]) => h("option", { value: v, selected: (x.role || "") === v }, t)));
      const typeField = h("div", { class: "field" }, h("span", { class: "field-label" }, "Tipo"),
        segmented([["check", "Marcar como hecho"], ["amount", "Sumar cantidades"]], x.kind, (v) => {
          x.kind = v;
          if (!ROLES[v].some(([r]) => r === (x.role || ""))) x.role = null;
          if (v === "amount" && !(x.target > 0)) x.target = null;
          drawKind();
        }, "Tipo de hábito"),
        x.kind === "amount" && h("span", { class: "hint" }, "Se completa al alcanzar el objetivo del día."),
      );
      if (x.kind === "amount") {
        const target = h("input", { type: "text", inputmode: "decimal", value: dec(x.target), placeholder: "3", onInput: (e) => (x.target = num(e.target.value)) });
        const unit = h("input", { type: "text", value: x.unit, placeholder: "L", onInput: (e) => (x.unit = e.target.value.trim()) });
        const quick = h("input", { type: "text", inputmode: "decimal", value: x.quick.map(dec).join("  "), placeholder: "0,5  1", onInput: (e) => {
          x.quick = e.target.value.split(/\s+/).map(num).filter((v) => v > 0).slice(0, 5);
        } });
        kindBox.replaceChildren(typeField,
          h("div", { class: "row field" }, h("label", { class: "mini-field" }, h("span", {}, "Objetivo al día"), target), h("label", { class: "mini-field" }, h("span", {}, "Unidad"), unit)),
          field("Cantidades rápidas", quick, "Hasta cinco cantidades separadas por espacios."),
        );
        autoBox.replaceChildren(field("Vincular al plan nutricional", roleSelect));
      } else {
        const hours = h("input", { type: "text", inputmode: "decimal", value: dec(x.target ?? 8), onInput: (e) => (x.target = num(e.target.value)) });
        kindBox.replaceChildren(typeField);
        autoBox.replaceChildren(h("frag", {},
          field("¿Se marca solo?", roleSelect),
          x.role === "sleep" && field("Horas de sueño mínimas", hours),
        ));
      }
    };
    drawKind();

    const freqBox = h("div", { class: "field" });
    const drawFreq = () => freqBox.replaceChildren(h("frag", {},
      h("span", { class: "field-label" }, "Cuándo"),
      segmented([["days", "Días fijos"], ["week", "Veces por semana"]], x.perWeek ? "week" : "days", (v) => {
        x.perWeek = v === "week" ? x.perWeek || 3 : null;
        drawFreq();
      }, "Frecuencia"),
      x.perWeek
        ? h("select", { "aria-label": "Veces por semana", onChange: (e) => (x.perWeek = Number(e.target.value)) },
            [1, 2, 3, 4, 5, 6].map((n) => h("option", { value: n, selected: n === x.perWeek }, `${n} ${n === 1 ? "vez" : "veces"} por semana`)))
        : dayPicker(x.days, (d) => (x.days = d)),
      x.perWeek && h("span", { class: "hint" }, "Aparece en el diario hasta completar la frecuencia semanal."),
    ));
    drawFreq();

    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      x.name = name.value.trim();
      x.detail = detail.value.trim();
      x.remind = remind.value || null;
      x.active = active.checked;
      if (!x.name) return toast("Ponle un nombre al hábito", "error");
      if (!x.perWeek && !x.days.length) return toast("Elige al menos un día", "error");
      if (x.kind === "amount" && !(x.target > 0)) return toast("Pon un objetivo mayor que 0", "error");
      if (x.role === "sleep" && !(x.target > 0)) return toast("Pon las horas de sueño", "error");
      if (x.kind === "check") {
        x.unit = "";
        x.quick = [];
        if (x.role !== "sleep") x.target = null;
      }
      // Cada rol lo tiene un solo hábito.
      if (x.role) for (const y of state.habits) if (y.id !== x.id && y.role === x.role) y.role = null;
      const i = state.habits.findIndex((y) => y.id === x.id);
      i >= 0 ? (state.habits[i] = x) : state.habits.push(x);
      if (!existing) library.filter = "active";
      save();
      push.syncSchedule().catch((err) => toast(`Guardado, pero el aviso no llegó al servidor: ${err.message}`, "error"));
      close();
      ctx.rerender();
      toast(existing ? "Cambios guardados" : "Hábito creado");
    } },
      field("Nombre", name),
      kindBox,
      freqBox,
      h("details", { class: "form-options", open: Boolean(existing) },
        h("summary", {}, "Detalles y recordatorios", icon("down", 16)),
        field("Descripción", detail),
        field("Recordatorio", remind, "Hora de España. Puedes activar las notificaciones en Ajustes."),
        autoBox,
        existing && h("label", { class: "switch" }, active, h("span", {}, "Hábito activo")),
      ),
      h("div", { class: "row end" },
        existing && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Borrar hábito", `Se borra «${existing.name}» y su historial. Si solo quieres dejar de verlo, desactívalo.`, "Borrar", () => {
          state.habits = state.habits.filter((y) => y.id !== existing.id);
          for (const map of [state.checks, state.skips]) {
            for (const k of Object.keys(map)) {
              map[k] = map[k].filter((id) => id !== existing.id);
              if (!map[k].length) delete map[k];
            }
          }
          for (const k of Object.keys(state.amounts)) {
            delete state.amounts[k][existing.id];
            if (!Object.keys(state.amounts[k]).length) delete state.amounts[k];
          }
          save();
          push.syncSchedule().catch(() => {});
          close();
          ctx.rerender();
        }) }, "Borrar"),
        h("button", { type: "submit", class: "btn primary" }, "Guardar hábito"),
      ),
    );
  });
}

function move(list, i, d) {
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save();
}

const appearances = [
  [/creatina|suplement|cápsula/, "pill", "mint", "Suplemento"],
  [/omega|pescado/, "fish", "peach", "Suplemento"],
  [/prote[ií]na|whey/, "protein", "lavender", "Nutrición"],
  [/calor[ií]a|comer|comida/, "flame", "apricot", "Nutrición"],
  [/batido/, "glass", "rose", "Nutrición"],
  [/ashwagandha|planta|naturaleza/, "leaf", "sage", "Bienestar"],
  [/agua|hidrat/, "drop", "sky", "Hidratación"],
  [/dormir|sueño|descans/, "moon", "lavender", "Descanso"],
  [/pes[oa]|báscula/, "scale", "peach", "Medidas"],
  [/gimnasio|entren|deporte/, "gym", "mint", "Movimiento"],
  [/leer|lectura|libro/, "book", "apricot", "Lectura"],
];
const roleKeys = { protein: "proteína", kcal: "calorías", sleep: "dormir", weigh: "peso", gym: "entrenar" };
export function habitStyle(habit) {
  const key = roleKeys[habit.role] || habit.name.toLocaleLowerCase("es");
  const match = appearances.find(([pattern]) => pattern.test(key));
  return match ? match.slice(1) : ["flag", "mint", "Hábito personal"];
}

export function habitIcon(habit) {
  const [symbol, color] = habitStyle(habit);
  return h("span", { class: "tile tone-" + color }, icon(symbol, 22));
}

const library = { filter: "active", ordering: false };
export function renderHabits(ctx) {
  const all = state.habits;
  const active = all.filter((x) => x.active);
  const visible = library.ordering ? all : all.filter((x) => library.filter === "active" ? x.active : !x.active);
  const reminders = active.filter((x) => x.remind).length;
  const counters = active.filter((x) => x.kind === "amount").length;
  const header = pageHead("Mis hábitos", all.length ? `${reminders} con recordatorio · ${counters} con contador` : null, actionButton("Nuevo hábito", "plus", () => editHabit(ctx)));
  const controls = h("div", { class: "view-controls" },
    library.ordering ? h("h2", {}, "Orden en el diario") : segmented([
      ["active", `Activos (${active.length})`], ["paused", `En pausa (${all.length - active.length})`],
    ], library.filter, (v) => { library.filter = v; ctx.rerender(); }, "Estado de los hábitos"),
    all.length > 1 && actionButton(library.ordering ? "Listo" : "Reordenar", library.ordering ? "check" : "list", () => { library.ordering = !library.ordering; ctx.rerender(); }, "ghost small"),
  );
  const items = visible.map((x, i) => {
    if (library.ordering) return h("li", { class: "order-item" },
      habitIcon(x), h("strong", {}, x.name),
      [-1, 1].map((d) => h("button", { class: "icon-btn", disabled: !all[i + d], "aria-label": (d < 0 ? "Subir " : "Bajar ") + x.name, "data-focus": x.id + d, onClick: () => { move(all, i, d); ctx.rerender(); } }, icon(d < 0 ? "up" : "down", 17))),
    );
    return h("li", {}, h("button", { class: "library-item", "data-focus": x.id, onClick: () => editHabit(ctx, x), "aria-label": "Editar " + x.name },
      h("span", { class: "library-top" }, habitIcon(x), h("span", { class: "chip" }, x.kind === "amount" ? "Cantidad" : "Casilla")),
      h("strong", {}, x.name),
      h("span", { class: "muted library-detail" }, x.kind === "amount" ? `Objetivo de ${qty(x.target)} ${x.unit}` : x.detail || habitStyle(x)[2]),
      h("span", { class: "library-foot" }, icon("calendar", 15), freqText(x), icon("edit", 15)),
    ));
  });
  return h("frag", {}, header, controls, items.length
    ? h("ul", { class: library.ordering ? "order-list card" : "library-grid" }, items)
    : h("div", { class: "empty-state card" }, h("span", { class: "tile tone-mint" }, icon(library.filter === "active" ? "layers" : "pause")),
        h("h2", {}, library.filter === "active" ? "Tu lista está vacía" : "Sin hábitos en pausa"),
        h("p", {}, library.filter === "active" ? "Crea un hábito para verlo en tu diario." : "Puedes pausar un hábito desde su ficha y retomarlo cuando quieras."),
        library.filter === "active" && actionButton("Nuevo hábito", "plus", () => editHabit(ctx))),
  );
}
