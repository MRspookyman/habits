import { h, sheet, confirmSheet, toast, num, fmt, field } from "../ui.js";
import { state, save, uid, dateKey, parseKey } from "../store.js";
import { stalledExercises, lastPerformance } from "../logic.js";

const shortDate = (k) => parseKey(k).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const knownExercises = () => {
  const names = new Map();
  for (const t of state.templates) for (const e of t.exercises) names.set(e.name.toLowerCase(), e.name);
  for (const s of state.sessions) for (const e of s.exercises) names.set(e.name.toLowerCase(), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
};
const datalist = () => h("datalist", { id: "exercise-names" }, knownExercises().map((n) => h("option", { value: n })));
const setText = (x) => `${x.kg ? `${fmt(num(x.kg), num(x.kg) % 1 ? 1 : 0)} kg` : "Sin peso"} × ${x.reps}${x.rir !== "" && x.rir != null ? ` (RIR ${x.rir})` : ""}`;

export function renderRoutine(ctx) {
  const stalled = stalledExercises(state.sessions);
  const sessions = state.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Rutina")),
    stalled.length > 0 && h("div", { class: "alert warn" },
      h("p", {}, h("strong", {}, "Estancado: "), stalled.join(", "), ". Llevas 3 sesiones sin superar tu mejor marca: revisa sueño y calorías, o cambia series y repeticiones."),
    ),
    h("section", { class: "stack" },
      state.templates.length === 0 && h("div", { class: "empty" },
        h("p", {}, "Crea tu primera plantilla, por ejemplo «Día A» con sus ejercicios. Al entrenar eliges la plantilla y solo apuntas los pesos."),
      ),
      state.templates.map((t) => h("article", { class: "card template" },
        h("div", { class: "template-head" },
          h("h2", {}, t.name),
          h("button", { class: "btn ghost small", onClick: () => editTemplate(ctx, t) }, "Editar"),
        ),
        h("p", { class: "muted" }, t.exercises.length ? t.exercises.map((e) => e.name).join(", ") : "Sin ejercicios"),
        h("button", { class: "btn primary block", disabled: !t.exercises.length, onClick: () => startSession(ctx, t) }, "Empezar entreno"),
      )),
      h("button", { class: "btn ghost block", onClick: () => editTemplate(ctx, null) }, "Nueva plantilla"),
    ),
    sessions.length > 0 && h("section", { class: "card" },
      h("h2", {}, "Historial"),
      sessions.slice(0, 30).map((s) => h("a", { class: "link-row", href: `#/entreno/${s.id}` },
        h("span", {}, s.name), h("span", { class: "muted" }, shortDate(s.date)))),
    ),
  );
}

function editTemplate(ctx, existing) {
  const t = existing ? structuredClone(existing) : { id: uid(), name: "", exercises: [] };
  sheet(existing ? "Editar plantilla" : "Nueva plantilla", (close) => {
    const list = h("ol", { class: "ex-edit" });
    const name = h("input", { type: "text", value: t.name, placeholder: "Día A", required: true });
    const draw = () => {
      list.replaceChildren(...t.exercises.map((e, i) => h("li", {},
        h("input", { type: "text", value: e.name, list: "exercise-names", placeholder: "Ejercicio", "aria-label": "Ejercicio", onInput: (ev) => (e.name = ev.target.value) }),
        h("input", { type: "number", min: 1, max: 10, value: e.sets, class: "narrow", "aria-label": "Series", onInput: (ev) => (e.sets = Math.max(1, Math.min(10, Number(ev.target.value) || 1))) }),
        h("input", { type: "text", value: e.reps, class: "narrow", placeholder: "8-10", "aria-label": "Repeticiones objetivo", onInput: (ev) => (e.reps = ev.target.value) }),
        h("div", { class: "ex-tools" },
          h("button", { type: "button", class: "icon-btn", "aria-label": "Subir", disabled: i === 0, onClick: () => { [t.exercises[i - 1], t.exercises[i]] = [t.exercises[i], t.exercises[i - 1]]; draw(); } }, "↑"),
          h("button", { type: "button", class: "icon-btn", "aria-label": "Quitar", onClick: () => { t.exercises.splice(i, 1); draw(); } }, "✕"),
        ),
      )));
    };
    draw();
    return h("form", {
      onSubmit: (ev) => {
        ev.preventDefault();
        t.name = name.value.trim();
        t.exercises = t.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim() }));
        if (!t.name) return toast("Ponle un nombre a la plantilla", "error");
        const i = state.templates.findIndex((x) => x.id === t.id);
        i >= 0 ? (state.templates[i] = t) : state.templates.push(t);
        save();
        close();
        ctx.rerender();
      },
    },
      datalist(),
      field("Nombre", name),
      h("div", { class: "ex-edit-head", "aria-hidden": "true" }, h("span", {}, "Ejercicio"), h("span", {}, "Series"), h("span", {}, "Reps"), h("span", {})),
      list,
      h("button", { type: "button", class: "btn ghost block", onClick: () => { t.exercises.push({ id: uid(), name: "", sets: 3, reps: "8-10" }); draw(); list.lastChild?.querySelector("input")?.focus(); } }, "Añadir ejercicio"),
      h("div", { class: "row end" },
        existing && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Borrar plantilla", `Se borra «${existing.name}». Los entrenos ya guardados se conservan.`, "Borrar", () => {
          state.templates = state.templates.filter((x) => x.id !== existing.id);
          save();
          close();
          ctx.rerender();
        }) }, "Borrar"),
        h("button", { type: "submit", class: "btn primary" }, "Guardar plantilla"),
      ),
    );
  });
}

function startSession(ctx, t) {
  const s = {
    id: uid(),
    date: dateKey(),
    templateId: t.id,
    name: t.name,
    exercises: t.exercises.map((e) => ({ name: e.name, target: e.reps, sets: Array.from({ length: e.sets }, () => ({ kg: "", reps: "", rir: "" })) })),
  };
  state.sessions.push(s);
  save();
  ctx.go(`#/entreno/${s.id}`);
}

export function renderSession(ctx) {
  const s = state.sessions.find((x) => x.id === ctx.params.id);
  if (!s) return h("div", { class: "empty" }, h("p", {}, "Este entreno ya no existe."), h("a", { class: "btn", href: "#/rutina" }, "Volver a la rutina"));

  const persist = () => save();
  const wrap = h("div", { class: "stack" });

  const draw = () => {
    wrap.replaceChildren(...s.exercises.map((e, ei) => {
      const last = lastPerformance(state.sessions, e.name, s.date, s.id);
      return h("article", { class: "card exercise" },
        h("div", { class: "template-head" },
          h("h2", {}, e.name),
          e.target && h("span", { class: "chip" }, `${e.target} reps`),
        ),
        h("p", { class: "hint" }, last ? `Última vez (${shortDate(last.date)}): ${last.sets.filter((x) => x.reps).map(setText).join(" · ")}` : "Primera vez con este ejercicio"),
        h("div", { class: "set-head", "aria-hidden": "true" }, h("span", {}, "#"), h("span", {}, "kg"), h("span", {}, "Reps"), h("span", {}, "RIR"), h("span", {})),
        e.sets.map((x, si) => {
          const prev = last?.sets[si];
          return h("div", { class: "set-row" },
            h("span", { class: "set-n" }, String(si + 1)),
            h("input", { type: "text", inputmode: "decimal", value: x.kg, placeholder: prev?.kg || "kg", "aria-label": `Serie ${si + 1}: kg`, onInput: (ev) => { x.kg = ev.target.value.replace(",", "."); persist(); } }),
            h("input", { type: "number", inputmode: "numeric", min: 0, value: x.reps, placeholder: prev?.reps || "reps", "aria-label": `Serie ${si + 1}: repeticiones`, onInput: (ev) => { x.reps = ev.target.value; persist(); } }),
            h("select", { "aria-label": `Serie ${si + 1}: RIR`, onChange: (ev) => { x.rir = ev.target.value; persist(); } },
              ["", "0", "1", "2", "3", "4"].map((v) => h("option", { value: v, selected: String(x.rir) === v }, v === "" ? "—" : v === "4" ? "4+" : v))),
            h("button", { class: "icon-btn", "aria-label": `Quitar serie ${si + 1}`, onClick: () => { e.sets.splice(si, 1); persist(); draw(); } }, "✕"),
          );
        }),
        h("div", { class: "row" },
          h("button", { class: "btn ghost small", onClick: () => { const l = e.sets[e.sets.length - 1]; e.sets.push({ kg: l?.kg || "", reps: "", rir: "" }); persist(); draw(); } }, "Añadir serie"),
          h("button", { class: "btn ghost small", onClick: () => confirmSheet("Quitar ejercicio", `Se quita ${e.name} de este entreno.`, "Quitar", () => { s.exercises.splice(ei, 1); persist(); draw(); }) }, "Quitar ejercicio"),
        ),
      );
    }));
  };
  draw();

  const addName = h("input", { type: "text", list: "exercise-names", placeholder: "Añadir ejercicio", "aria-label": "Nombre del ejercicio" });

  return h("frag", {},
    h("header", { class: "page-head" },
      h("a", { class: "icon-btn", href: "#/rutina", "aria-label": "Volver" }, "‹"),
      h("div", {}, h("h1", {}, s.name), h("p", { class: "muted" }, shortDate(s.date))),
    ),
    datalist(),
    wrap,
    h("form", { class: "row add-ex", onSubmit: (ev) => {
      ev.preventDefault();
      const n = addName.value.trim();
      if (!n) return;
      s.exercises.push({ name: n, target: "", sets: [{ kg: "", reps: "", rir: "" }] });
      persist();
      addName.value = "";
      draw();
    } }, addName, h("button", { class: "btn ghost", type: "submit" }, "Añadir")),
    h("div", { class: "row end" },
      h("button", { class: "btn danger ghost", onClick: () => confirmSheet("Borrar entreno", "Se borra este entreno y sus series.", "Borrar", () => {
        state.sessions = state.sessions.filter((x) => x.id !== s.id);
        save();
        ctx.go("#/rutina");
      }) }, "Borrar entreno"),
      h("button", { class: "btn primary", onClick: () => {
        for (const e of s.exercises) e.sets = e.sets.filter((x) => x.reps !== "" || x.kg !== "");
        s.exercises = s.exercises.filter((e) => e.sets.length);
        if (!s.exercises.length) state.sessions = state.sessions.filter((x) => x.id !== s.id);
        save();
        toast(s.exercises.length ? "Entreno guardado" : "Entreno vacío: no se ha guardado");
        ctx.go("#/rutina");
      } }, "Terminar entreno"),
    ),
  );
}
