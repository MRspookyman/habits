import { h, sheet, confirmSheet, toast, num, fmt, field, dec } from "../ui.js";
import { state, save, uid, dateKey, exerciseInfo, setExerciseInfo, knownExerciseNames } from "../store.js";
import { stalledExercises, lastPerformance, bestMarks, setPR, isWorkSet, plateBreakdown, sessionMinutes, sessionVolume, sessionPRs } from "../logic.js";
import { GROUPS, groupName } from "../exercises.js";
import * as timer from "../timer.js";
import { shortDate, setLabel, kgText, minutesText } from "./shared.js";

const datalist = () => h("datalist", { id: "exercise-names" }, knownExerciseNames().map((n) => h("option", { value: n })));
const groupSelect = (value, onChange) =>
  h("select", { "aria-label": "Grupo muscular", onChange: (e) => onChange(e.target.value || null) },
    h("option", { value: "", selected: !value }, "Sin grupo"),
    GROUPS.map((g) => h("option", { value: g.id, selected: g.id === value }, g.name)));
const volumeText = (v) => (v >= 1000 ? `${fmt(v / 1000, 1)} t` : `${Math.round(v)} kg`);
const openSession = () => state.sessions.find((s) => !s.finishedAt && s.date === dateKey());

export function renderRoutine(ctx) {
  const stalled = stalledExercises(state.sessions);
  const sessions = state.sessions.filter((s) => s.finishedAt || s.date < dateKey()).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0));
  const live = openSession();

  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Gimnasio")),
    live && h("a", { class: "live-banner", href: `#/entreno/${live.id}` },
      h("span", {}, h("strong", {}, live.name), " en curso"),
      h("span", { class: "live-time", "data-since": live.startedAt || Date.now() }),
      h("span", { class: "btn primary small" }, "Continuar")),
    stalled.length > 0 && h("div", { class: "alert warn" },
      h("p", {}, h("strong", {}, "Estancado: "), stalled.join(", "), ". Llevas 3 sesiones sin superar tu mejor marca: revisa sueño y calorías, o cambia series y repeticiones."),
    ),
    h("section", { class: "stack" },
      state.templates.length === 0 && h("div", { class: "empty" },
        h("p", {}, "Crea tu primera plantilla, por ejemplo «Día A» con sus ejercicios. Al entrenar eliges la plantilla y solo ajustas los pesos."),
      ),
      state.templates.map((t) => h("article", { class: "card template" },
        h("div", { class: "template-head" },
          h("h2", {}, t.name),
          h("button", { class: "btn ghost small", onClick: () => editTemplate(ctx, t) }, "Editar"),
        ),
        h("ul", { class: "tpl-list" }, t.exercises.map((e) => h("li", {}, h("span", {}, e.name), h("span", { class: "muted" }, `${e.sets} × ${e.reps}`)))),
        h("button", { class: "btn primary block", disabled: !t.exercises.length || Boolean(live), onClick: () => startSession(ctx, t) }, live ? "Termina el entreno en curso primero" : "Empezar entreno"),
      )),
      h("button", { class: "btn ghost block", onClick: () => editTemplate(ctx, null) }, "Nueva plantilla"),
    ),
    sessions.length > 0 && h("section", { class: "card" },
      h("h2", {}, "Historial"),
      h("ul", { class: "history" }, sessions.slice(0, 30).map((s) => {
        const prs = sessionPRs(state.sessions, s).length;
        return h("li", {}, h("a", { class: "link-row", href: `#/entreno/${s.id}` },
          h("span", { class: "hist-main" }, h("strong", {}, s.name), h("span", { class: "muted" }, shortDate(s.date))),
          h("span", { class: "hist-meta" }, `${minutesText(sessionMinutes(s))} · ${volumeText(sessionVolume(s))}`, prs > 0 && h("span", { class: "pr-badge" }, `${prs} PR`)),
        ));
      })),
    ),
  );
}

function editTemplate(ctx, existing) {
  const t = existing ? structuredClone(existing) : { id: uid(), name: "", exercises: [] };
  sheet(existing ? "Editar plantilla" : "Nueva plantilla", (close) => {
    const list = h("ol", { class: "ex-edit" });
    const name = h("input", { type: "text", value: t.name, placeholder: "Día A", required: true });
    const draw = () => {
      list.replaceChildren(...t.exercises.map((e, i) => {
        const info = exerciseInfo(e.name || "");
        e.group ??= info.group;
        const grp = groupSelect(e.group, (g) => (e.group = g));
        return h("li", {},
          h("input", { type: "text", value: e.name, list: "exercise-names", placeholder: "Ejercicio", "aria-label": "Ejercicio", class: "ex-name", onChange: (ev) => {
            e.name = ev.target.value;
            e.group = exerciseInfo(e.name).group;
            draw();
          } }),
          h("input", { type: "number", inputmode: "numeric", min: 1, max: 10, value: e.sets, class: "narrow", "aria-label": "Series", onInput: (ev) => (e.sets = Math.max(1, Math.min(10, Number(ev.target.value) || 1))) }),
          h("input", { type: "text", value: e.reps, class: "narrow", placeholder: "8-10", "aria-label": "Repeticiones objetivo", onInput: (ev) => (e.reps = ev.target.value) }),
          h("div", { class: "ex-tools" },
            h("button", { type: "button", class: "icon-btn", "aria-label": "Subir", disabled: i === 0, onClick: () => { [t.exercises[i - 1], t.exercises[i]] = [t.exercises[i], t.exercises[i - 1]]; draw(); } }, "↑"),
            h("button", { type: "button", class: "icon-btn", "aria-label": "Quitar", onClick: () => { t.exercises.splice(i, 1); draw(); } }, "✕"),
          ),
          grp,
        );
      }));
    };
    draw();
    return h("form", {
      onSubmit: (ev) => {
        ev.preventDefault();
        t.name = name.value.trim();
        t.exercises = t.exercises.filter((e) => e.name.trim()).map((e) => ({ id: e.id || uid(), name: e.name.trim(), sets: e.sets, reps: e.reps }));
        if (!t.name) return toast("Ponle un nombre a la plantilla", "error");
        // El grupo se guarda en la biblioteca del ejercicio (sirve para todas las plantillas).
        for (const e of list.querySelectorAll("li")) {
          const nm = e.querySelector(".ex-name").value.trim();
          const g = e.querySelector("select").value || null;
          if (nm && exerciseInfo(nm).group !== g) setExerciseInfo(nm, { group: g });
        }
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
      h("button", { type: "button", class: "btn ghost block", onClick: () => { t.exercises.push({ id: uid(), name: "", sets: 3, reps: "8-10", group: null }); draw(); list.lastChild?.querySelector("input")?.focus(); } }, "Añadir ejercicio"),
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

// Crea las series con los valores de la última vez para no tener que reescribirlos.
function prefilledSets(name, count, before) {
  const last = lastPerformance(state.sessions, name, before);
  const prev = last ? last.sets.filter((x) => !x.warmup) : [];
  return Array.from({ length: count }, (_, i) => {
    const p = prev[i] || prev[prev.length - 1];
    return { kg: p?.kg ?? "", reps: p?.reps ?? "", rir: "", done: false, warmup: false };
  });
}

function startSession(ctx, t) {
  const today = dateKey();
  const s = {
    id: uid(),
    date: today,
    templateId: t.id,
    name: t.name,
    startedAt: Date.now(),
    finishedAt: null,
    exercises: t.exercises.map((e) => ({ name: e.name, target: e.reps, sets: prefilledSets(e.name, e.sets, today) })),
  };
  state.sessions.push(s);
  save();
  ctx.go(`#/entreno/${s.id}`);
}

function plateSheet(kg) {
  const total = num(kg) || 0;
  const { perSide, remainder } = plateBreakdown(total);
  sheet(`Discos para ${kgText(total)}`, () => h("frag", {},
    total < 20
      ? h("p", {}, "Menos que la barra sola (20 kg).")
      : perSide.length === 0
        ? h("p", {}, "Solo la barra de 20 kg.")
        : h("frag", {},
            h("p", { class: "muted" }, "Por cada lado de una barra de 20 kg:"),
            h("div", { class: "plates" }, perSide.map((p) => h("span", { class: `plate p${String(p).replace(".", "_")}` }, String(p).replace(".", ",")))),
          ),
    remainder > 0 && h("p", { class: "hint" }, `No se puede cargar exacto: sobran ${fmt(remainder, 2)} kg con estos discos.`),
  ));
}

function exerciseSettings(name, onSave) {
  const info = exerciseInfo(name);
  sheet(name, (close) => {
    let group = info.group;
    const rest = h("input", { type: "number", inputmode: "numeric", min: 0, max: 600, value: info.rest });
    const step = h("input", { type: "text", inputmode: "decimal", value: dec(info.step) });
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      setExerciseInfo(name, { group, rest: Math.max(0, Number(rest.value) || 0), step: Math.max(0, num(step.value) ?? 2.5) });
      close();
      onSave();
    } },
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Grupo muscular"), groupSelect(group, (g) => (group = g))),
      field("Descanso (segundos)", rest, "0 = sin temporizador."),
      field("Salto de peso de los botones (kg)", step, "Por ejemplo 2,5 en barra y 2 en mancuernas."),
      h("div", { class: "row end" }, h("button", { class: "btn primary", type: "submit" }, "Guardar")),
    );
  });
}

let active = null; // { id, ei, si }

export function renderSession(ctx) {
  const s = state.sessions.find((x) => x.id === ctx.params.id);
  if (!s) return h("div", { class: "empty" }, h("p", {}, "Este entreno ya no existe."), h("a", { class: "btn", href: "#/rutina" }, "Volver al gimnasio"));
  const live = !s.finishedAt;
  timer.keepAwake(live);

  const firstPending = () => {
    for (let ei = 0; ei < s.exercises.length; ei++) {
      const si = s.exercises[ei].sets.findIndex((x) => !x.done);
      if (si >= 0) return { id: s.id, ei, si };
    }
    return null;
  };
  if (!active || active.id !== s.id || !s.exercises[active.ei]?.sets[active.si]) active = live ? firstPending() : null;

  const wrap = h("div", { class: "stack" });

  const stepper = (label, value, step, onSet, onPlates) => {
    const input = h("input", { type: "text", inputmode: "decimal", value: dec(value), "aria-label": label, onChange: (e) => onSet(e.target.value) });
    const bump = (d) => () => {
      const v = Math.max(0, Math.round(((num(input.value) || 0) + d) * 100) / 100);
      input.value = dec(v);
      onSet(String(v));
    };
    return h("div", { class: "stepper" },
      h("span", { class: "stepper-label" }, label),
      h("div", { class: "stepper-row" },
        h("button", { class: "step-btn", "aria-label": `Bajar ${label}`, onClick: bump(-step) }, "−"),
        input,
        h("button", { class: "step-btn", "aria-label": `Subir ${label}`, onClick: bump(step) }, "+"),
      ),
      onPlates && h("button", { class: "link-btn", onClick: () => onPlates(input.value) }, "Discos"),
    );
  };

  const draw = () => {
    const marksCache = new Map();
    wrap.replaceChildren(...s.exercises.map((e, ei) => {
      const info = exerciseInfo(e.name);
      const last = lastPerformance(state.sessions, e.name, s.date, s.id);
      const prevWork = last ? last.sets.filter((x) => !x.warmup) : [];
      if (!marksCache.has(e.name)) marksCache.set(e.name, bestMarks(state.sessions.filter((x) => x.date <= s.date), e.name, s.id));
      const marks = marksCache.get(e.name);
      let workIndex = 0;

      const rows = e.sets.map((x, si) => {
        const isActive = active && active.ei === ei && active.si === si;
        const prev = x.warmup ? null : prevWork[workIndex];
        const badge = x.warmup ? "C" : String(++workIndex);
        const pr = x.done ? setPR(x, marks) : null;
        const row = h("div", { class: "set-row" + (x.done ? " done" : "") + (isActive ? " active" : "") + (x.warmup ? " warm" : "") },
          h("button", { class: "set-badge", "aria-label": x.warmup ? "Serie de calentamiento: tocar para hacerla efectiva" : `Serie ${badge}: tocar para marcarla de calentamiento`, onClick: () => { x.warmup = !x.warmup; save(); draw(); } }, badge),
          h("button", { class: "set-prev", disabled: !prev, "aria-label": prev ? `Copiar la vez anterior: ${setLabel(prev)}` : "Sin datos anteriores", onClick: () => { x.kg = prev.kg; x.reps = prev.reps; save(); draw(); } }, prev ? setLabel(prev) : "—"),
          h("button", { class: "set-main", "aria-label": `Editar serie ${badge}`, "aria-expanded": String(isActive), onClick: () => { active = isActive ? null : { id: s.id, ei, si }; draw(); } },
            h("span", { class: "set-kg" }, x.kg !== "" ? dec(x.kg) : "—"),
            h("span", { class: "set-x", "aria-hidden": "true" }, "×"),
            h("span", { class: "set-reps" }, x.reps !== "" ? String(x.reps) : "—"),
            x.rir !== "" && x.rir != null && h("span", { class: "set-rir" }, `RIR ${x.rir === "4" ? "4+" : x.rir}`),
            pr && h("span", { class: "pr-badge" }, "PR"),
          ),
          h("button", {
            class: "set-check" + (x.done ? " on" : ""),
            "aria-pressed": String(Boolean(x.done)),
            "aria-label": x.done ? `Desmarcar serie ${badge}` : `Marcar serie ${badge} como hecha`,
            disabled: !live && !x.done,
            onClick: () => {
              if (!x.done && !(Number(x.reps) > 0)) return toast("Pon las repeticiones antes de marcarla", "error");
              x.done = !x.done;
              save();
              if (x.done) {
                navigator.vibrate?.(40);
                if (live && info.rest > 0) timer.start(info.rest, e.name);
                if (setPR(x, marks)) toast(`¡Récord en ${e.name}! ${setLabel(x)}`);
                if (isActive || !active) active = firstPending();
              }
              draw();
            },
          }, "✓"),
        );
        if (!isActive) return row;
        const panel = h("div", { class: "set-panel" },
          h("div", { class: "steppers" },
            stepper("kg", x.kg, info.step || 2.5, (v) => { x.kg = v.replace(",", "."); save(); row.querySelector(".set-kg").textContent = x.kg !== "" ? dec(x.kg) : "—"; }, (v) => plateSheet(v)),
            stepper("Reps", x.reps, 1, (v) => { x.reps = String(Math.round(num(v) || 0)); save(); row.querySelector(".set-reps").textContent = x.reps; }),
          ),
          h("div", { class: "rir", role: "group", "aria-label": "Repeticiones en reserva (RIR)" },
            h("span", { class: "stepper-label" }, "RIR"),
            ["", "0", "1", "2", "3", "4"].map((v) => h("button", {
              class: "rir-btn" + (String(x.rir ?? "") === v ? " on" : ""),
              "aria-pressed": String(String(x.rir ?? "") === v),
              onClick: () => { x.rir = v; save(); draw(); },
            }, v === "" ? "—" : v === "4" ? "4+" : v)),
          ),
          h("div", { class: "row" },
            h("button", { class: "btn ghost small", onClick: () => { e.sets.splice(si, 1); active = null; save(); draw(); } }, "Quitar serie"),
            h("button", { class: "btn primary grow", disabled: !live, onClick: () => row.querySelector(".set-check").click() }, x.done ? "Desmarcar" : "Serie hecha ✓"),
          ),
        );
        return h("frag", {}, row, panel);
      });

      return h("article", { class: "card exercise" },
        h("div", { class: "template-head" },
          h("div", {},
            h("h2", {}, e.name),
            h("p", { class: "ex-meta" }, groupName(info.group), e.target && ` · objetivo ${e.target}`, info.rest > 0 && ` · descanso ${info.rest} s`),
          ),
          h("button", { class: "icon-btn", "aria-label": `Ajustes de ${e.name}`, onClick: () => exerciseSettings(e.name, draw) }, "⚙"),
        ),
        h("div", { class: "set-head", "aria-hidden": "true" }, h("span", {}, "Serie"), h("span", {}, "Anterior"), h("span", {}, "kg × reps"), h("span", {}, "✓")),
        rows,
        h("div", { class: "row" },
          h("button", { class: "btn ghost small", onClick: () => {
            const l = e.sets.filter((x) => !x.warmup).at(-1) || e.sets.at(-1);
            e.sets.push({ kg: l?.kg ?? "", reps: l?.reps ?? "", rir: "", done: false, warmup: false });
            active = { id: s.id, ei, si: e.sets.length - 1 };
            save();
            draw();
          } }, "Añadir serie"),
          h("button", { class: "btn ghost small", onClick: () => confirmSheet("Quitar ejercicio", `Se quita ${e.name} de este entreno.`, "Quitar", () => { s.exercises.splice(ei, 1); active = null; save(); draw(); }) }, "Quitar ejercicio"),
        ),
      );
    }));
  };
  draw();

  const addName = h("input", { type: "text", list: "exercise-names", placeholder: "Añadir ejercicio", "aria-label": "Nombre del ejercicio" });

  const finish = () => {
    for (const e of s.exercises) e.sets = e.sets.filter((x) => x.done);
    s.exercises = s.exercises.filter((e) => e.sets.length);
    timer.stop();
    timer.keepAwake(false);
    if (!s.exercises.length) {
      state.sessions = state.sessions.filter((x) => x.id !== s.id);
      save();
      toast("No había series hechas: el entreno no se ha guardado");
      return ctx.go("#/rutina");
    }
    s.finishedAt = Date.now();
    save();
    const prs = sessionPRs(state.sessions, s);
    const sets = s.exercises.reduce((a, e) => a + e.sets.filter(isWorkSet).length, 0);
    ctx.go("#/rutina");
    sheet("Entreno terminado", (close) => h("frag", {},
      h("dl", { class: "stats stats-3" },
        h("div", {}, h("dt", {}, "Duración"), h("dd", {}, minutesText(sessionMinutes(s)))),
        h("div", {}, h("dt", {}, "Volumen"), h("dd", {}, volumeText(sessionVolume(s)))),
        h("div", {}, h("dt", {}, "Series"), h("dd", {}, String(sets))),
      ),
      prs.length
        ? h("ul", { class: "pr-list" }, prs.map((p) => h("li", {}, h("span", { class: "pr-badge" }, "PR"), ` ${p.name}: ${setLabel(p.set)}`, h("span", { class: "muted" }, p.kind === "kg" ? " · más peso" : " · mejor 1RM estimado"))))
        : h("p", { class: "muted" }, "Sin récords hoy. La constancia también suma."),
      h("div", { class: "row end" }, h("button", { class: "btn primary", onClick: close }, "Hecho")),
    ));
  };

  return h("frag", {},
    h("header", { class: "page-head" },
      h("a", { class: "icon-btn", href: "#/rutina", "aria-label": "Volver" }, "‹"),
      h("div", {}, h("h1", {}, s.name), h("p", { class: "muted" }, shortDate(s.date), live && " · ", live && h("span", { class: "live-time", "data-since": s.startedAt || Date.now() }))),
    ),
    datalist(),
    wrap,
    h("form", { class: "row add-ex", onSubmit: (ev) => {
      ev.preventDefault();
      const n = addName.value.trim();
      if (!n) return;
      s.exercises.push({ name: n, target: "", sets: prefilledSets(n, 3, s.date) });
      active = { id: s.id, ei: s.exercises.length - 1, si: 0 };
      save();
      addName.value = "";
      draw();
    } }, addName, h("button", { class: "btn ghost", type: "submit" }, "Añadir")),
    h("div", { class: "row end" },
      h("button", { class: "btn danger ghost", onClick: () => confirmSheet(live ? "Descartar entreno" : "Borrar entreno", "Se borra este entreno y sus series.", live ? "Descartar" : "Borrar", () => {
        state.sessions = state.sessions.filter((x) => x.id !== s.id);
        timer.stop();
        timer.keepAwake(false);
        save();
        ctx.go("#/rutina");
      }) }, live ? "Descartar" : "Borrar entreno"),
      live && h("button", { class: "btn primary", onClick: finish }, "Terminar entreno"),
    ),
  );
}
