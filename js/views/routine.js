import { h, sheet, confirmSheet, toast, num, fmt, field, dec, pageHead, actionButton } from "../ui.js";
import { icon } from "../icons.js";
import { state, save, uid, dateKey, exerciseInfo, setExerciseInfo, knownExerciseNames } from "../store.js";
import { stalledExercises, lastPerformance, bestMarks, setPR, isWorkSet, plateBreakdown, sessionMinutes, sessionVolume, sessionPRs, suggestSets } from "../logic.js";
import { GROUPS, groupName } from "../exercises.js";
import * as timer from "../timer.js";
import { shortDate, setLabel, kgText, minutesText } from "./shared.js";

const datalist = () => h("datalist", { id: "exercise-names" }, knownExerciseNames().map((n) => h("option", { value: n })));
const groupSelect = (value, onChange) =>
  h("select", { "aria-label": "Grupo muscular", onChange: (e) => onChange(e.target.value || null) },
    h("option", { value: "", selected: !value }, "Sin grupo"),
    GROUPS.map((g) => h("option", { value: g.id, selected: g.id === value }, g.name)));
const volumeText = (v) => (v >= 1000 ? `${fmt(v / 1000, 1)} t` : `${Math.round(v)} kg`);
const isLiveSession = (s) => !s.finishedAt && (s.startedAt != null || s.date === dateKey());
const openSession = () => state.sessions.findLast(isLiveSession);
let historyLimit = 10;

export function renderRoutine(ctx) {
  const stalled = stalledExercises(state.sessions);
  const live = openSession();
  const sessions = state.sessions.filter((s) => s.id !== live?.id).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0));

  return h("frag", {},
    pageHead("Entrenamiento", sessions.length ? "Última sesión · " + shortDate(sessions[0].date) : null, actionButton("Nueva plantilla", "plus", () => editTemplate(ctx, null))),
    h("section", { class: "training-feature" },
      h("div", { class: "training-copy" }, h("span", { class: "feature-icon" }, icon("gym", 23)),
        h("h2", {}, live ? live.name : "Sesión libre"),
        h("p", {}, live ? h("frag", {}, "Sesión en curso · ", h("span", { class: "live-time", "data-since": live.startedAt || Date.now() })) : "Empieza a entrenar y añade tus ejercicios sobre la marcha."),
        live ? h("a", { class: "btn primary", href: "#/entreno/" + live.id }, icon("play", 15), "Continuar sesión")
          : actionButton("Empezar sesión", "play", () => startSession(ctx)))),
    stalled.length > 0 && h("div", { class: "alert warn" },
      h("p", {}, h("strong", {}, "Estancado: "), stalled.join(", "), ". Llevas 3 sesiones sin superar tu mejor marca: revisa sueño y calorías, o cambia series y repeticiones."),
    ),
    h("div", { class: "training-columns" }, h("section", { class: "stack" },
      h("div", { class: "list-heading" }, h("h2", {}, "Mis plantillas"), h("span", { class: "count" }, String(state.templates.length))),
      state.templates.length === 0 && h("div", { class: "card empty-state" },
        h("span", { class: "tile tone-sage" }, icon("layers", 23)), h("h3", {}, "Prepara una rutina"),
        h("p", {}, "Guarda tus ejercicios y series en una plantilla para repetirlos en otra sesión."),
        actionButton("Crear plantilla", "plus", () => editTemplate(ctx, null), "ghost")),
      state.templates.map((t) => h("article", { class: "card template" },
        h("div", { class: "template-head" },
          h("h3", {}, t.name),
          h("button", { class: "btn ghost small", onClick: () => editTemplate(ctx, t) }, "Editar"),
        ),
        h("ul", { class: "tpl-list" }, t.exercises.map((e, i) => h("li", { class: e.superset && t.exercises[i + 1] ? "ss" : "" },
          h("span", {}, e.name, e.superset && t.exercises[i + 1] && h("span", { class: "muted" }, " · superserie")),
          h("span", { class: "muted" }, `${e.sets} × ${e.reps}`)))),
        h("button", { class: "btn primary block", disabled: !t.exercises.length || Boolean(live), onClick: () => startSession(ctx, t) }, live ? "Termina el entreno en curso primero" : "Empezar entreno"),
      )),
    ),
    h("section", { class: "stack" }, h("h2", {}, "Historial"),
      sessions.length === 0 ? h("div", { class: "card empty-state" }, h("span", { class: "tile tone-sand" }, icon("clock", 23)),
        h("h3", {}, "Tu primera sesión"), h("p", {}, "Aquí podrás consultar los ejercicios, la duración y los récords de cada entrenamiento."))
        : h("ul", { class: "history card" }, sessions.slice(0, historyLimit).map((s) => {
        const prs = sessionPRs(state.sessions, s).length;
        return h("li", {}, h("a", { class: "link-row", href: `#/entreno/${s.id}` },
          h("span", { class: "hist-main" }, h("strong", {}, s.name), h("span", { class: "muted" }, shortDate(s.date))),
          h("span", { class: "hist-meta" }, `${minutesText(sessionMinutes(s))} · ${volumeText(sessionVolume(s))}`, prs > 0 && h("span", { class: "pr-badge" }, `${prs} PR`)),
        ));
      })),
      sessions.length > historyLimit && h("button", { class: "btn ghost", onClick: () => { historyLimit += 10; ctx.rerender(); } }, "Ver más sesiones"),
    )),
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
          h("input", { type: "text", value: e.name, list: "exercise-names", placeholder: "Ejercicio", "aria-label": "Ejercicio", class: "ex-name", onInput: (ev) => {
            e.name = ev.target.value;
            e.group = exerciseInfo(e.name).group;
            grp.value = e.group || "";
          } }),
          h("label", { class: "ex-field" }, h("span", {}, "Series"), h("input", { type: "number", inputmode: "numeric", min: 1, max: 10, value: e.sets, class: "narrow", onInput: (ev) => (e.sets = Math.max(1, Math.min(10, Number(ev.target.value) || 1))) })),
          h("label", { class: "ex-field" }, h("span", {}, "Repeticiones objetivo"), h("input", { type: "text", value: e.reps, class: "narrow", placeholder: "8-10", onInput: (ev) => (e.reps = ev.target.value) })),
          h("div", { class: "ex-tools" },
            h("button", { type: "button", class: "icon-btn", "aria-label": "Subir", disabled: i === 0, onClick: () => { [t.exercises[i - 1], t.exercises[i]] = [t.exercises[i], t.exercises[i - 1]]; draw(); } }, "↑"),
            h("button", { type: "button", class: "icon-btn", "aria-label": "Quitar", onClick: () => { t.exercises.splice(i, 1); draw(); } }, "✕"),
          ),
          h("div", { class: "ex-extra" },
            grp,
            i < t.exercises.length - 1 && h("label", { class: "switch small" },
              h("input", { type: "checkbox", checked: Boolean(e.superset), onChange: (ev) => (e.superset = ev.target.checked) }),
              h("span", {}, "Superserie con el siguiente")),
          ),
        );
      }));
    };
    draw();
    return h("form", {
      onSubmit: (ev) => {
        ev.preventDefault();
        t.name = name.value.trim();
        const kept = t.exercises.filter((e) => e.name.trim());
        t.exercises = kept.map((e, i) => ({ id: e.id || uid(), name: e.name.trim(), sets: e.sets, reps: e.reps, superset: Boolean(e.superset) && i < kept.length - 1 }));
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

// Series con lo de la última vez y la progresión sugerida para el rango de la plantilla.
function prefilled(name, count, before, target) {
  const last = lastPerformance(state.sessions, name, before);
  const prev = last ? last.sets.filter((x) => !x.warmup) : [];
  const sug = suggestSets(prev, target, exerciseInfo(name).step, count);
  const sets = Array.from({ length: count }, (_, i) => ({ kg: sug?.sets[i].kg ?? "", reps: sug?.sets[i].reps ?? "", rir: "", done: false, warmup: false }));
  return { sets, suggest: sug && sug.kind !== "same" ? sug.kind : null };
}

function startSession(ctx, t = null) {
  const live = openSession();
  if (live) return ctx.go("#/entreno/" + live.id);
  const today = dateKey();
  const s = {
    id: uid(),
    date: today,
    templateId: t?.id || null,
    name: t?.name || "Sesión libre",
    startedAt: Date.now(),
    finishedAt: null,
    exercises: (t?.exercises || []).map((e) => ({ name: e.name, target: e.reps, superset: Boolean(e.superset), ...prefilled(e.name, e.sets, today, e.reps) })),
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
    const note = h("textarea", { rows: 2, value: info.note, placeholder: "Asiento en 4, agarre ancho…" });
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      setExerciseInfo(name, { group, rest: Math.max(0, Number(rest.value) || 0), step: Math.max(0, num(step.value) ?? 2.5), note: note.value.trim() });
      close();
      onSave();
    } },
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Grupo muscular"), groupSelect(group, (g) => (group = g))),
      field("Descanso (segundos)", rest, "0 = sin temporizador. Las series de calentamiento no lo ponen en marcha."),
      field("Salto de peso (kg)", step, "Para los botones y para sugerir cuánto subir. Por ejemplo 2,5 en barra y 2 en mancuernas."),
      field("Nota", note, "Se muestra cada vez que haces el ejercicio."),
      h("div", { class: "row end" }, h("button", { class: "btn primary", type: "submit" }, "Guardar")),
    );
  });
}

let active = null; // { id, ei, si }

function sessionRecord(s) {
  const sets = s.exercises.flatMap((e) => e.sets).filter(isWorkSet);
  const exercises = s.exercises.map((e) => {
    const rows = e.sets.map((set, i) => h("li", {},
      h("span", { class: "muted" }, set.warmup ? "Calentamiento" : "Serie " + (i + 1)),
      h("strong", {}, set.done ? setLabel(set) : "Sin completar"),
      set.done && set.rir !== "" && set.rir != null && h("small", {}, `RIR ${set.rir}`)));
    return h("article", { class: "card" }, h("h2", {}, e.name), h("ol", { class: "logged-sets" }, rows));
  });
  return h("frag", {},
    pageHead(s.name, shortDate(s.date), h("a", { class: "btn ghost", href: "#/entreno/" + s.id + "/editar" }, icon("edit", 16), "Editar sesión"),
      h("a", { class: "back-link", href: "#/rutina" }, icon("back", 15), "Entrenamiento")),
    h("section", { class: "card" }, h("h2", {}, "Sesión terminada"), h("dl", { class: "stats stats-3" },
      [["Duración", minutesText(sessionMinutes(s))], ["Volumen", volumeText(sessionVolume(s))], ["Series efectivas", String(sets.length)]]
        .map(([label, v]) => h("div", {}, h("dt", {}, label), h("dd", {}, v))))),
    h("div", { class: "report-grid" }, exercises),
  );
}

export function renderSession(ctx) {
  const s = state.sessions.find((x) => x.id === ctx.params.id);
  if (!s) return h("frag", {}, pageHead("Entrenamiento"), h("section", { class: "card empty-state" },
    h("span", { class: "tile tone-sage" }, icon("gym")), h("h2", {}, "Sesión no disponible"),
    h("p", {}, "Este entrenamiento ya no está en tu diario."), h("a", { class: "btn ghost", href: "#/rutina" }, "Ver entrenamientos")));
  const live = isLiveSession(s);
  timer.keepAwake(live);
  if (!live && !ctx.params.edit) return sessionRecord(s);

  const firstPending = () => {
    for (let ei = 0; ei < s.exercises.length; ei++) {
      const si = s.exercises[ei].sets.findIndex((x) => !x.done);
      if (si >= 0) return { id: s.id, ei, si };
    }
    return null;
  };
  if (!active || active.id !== s.id || !s.exercises[active.ei]?.sets[active.si]) active = live ? firstPending() : null;

  const wrap = h("div", { class: "stack exercise-stack" });
  const status = h("strong", { "aria-live": "polite" });
  const fill = h("i");
  const finishButton = actionButton("Terminar sesión", "check", () => {
    const pending = s.exercises.some((e) => e.sets.some((x) => !x.done));
    if (pending) confirmSheet("Terminar sesión", "Se guardarán las series completadas. Las pendientes se retirarán de esta sesión.", "Terminar sesión", finish, false);
    else finish();
  });
  const dockName = h("strong");
  const dockDetail = h("small");
  const dockAction = h("button", { class: "btn primary" });
  const nextSet = () => {
    const set = active && s.exercises[active.ei]?.sets[active.si];
    return set && !set.done ? active : firstPending();
  };
  const updateDock = () => {
    if (!live) return;
    const next = nextSet();
    const exercise = next && s.exercises[next.ei];
    const logged = s.exercises.some((e) => e.sets.some((x) => x.done));
    dockName.textContent = exercise?.name || (logged ? "Series completadas" : "Sesión en curso");
    dockDetail.textContent = next ? `Serie ${next.si + 1} de ${exercise.sets.length}` : logged ? "Guarda tu entrenamiento" : "Añade un ejercicio para empezar";
    dockAction.textContent = next ? Number(exercise.sets[next.si].reps) > 0 ? "Serie hecha" : "Anotar reps" : logged ? "Terminar sesión" : "Añadir ejercicio";
  };
  dockAction.addEventListener("click", () => {
    const next = nextSet();
    if (!next) {
      if (!finishButton.disabled) finishButton.click();
      else addName.focus();
      return;
    }
    active = next;
    draw();
    if (Number(s.exercises[next.ei].sets[next.si].reps) > 0) wrap.querySelector(".set-row.active .set-check").click();
    else wrap.querySelector('.set-panel input[aria-label="Reps"]')?.focus();
  });

  const stepper = (label, value, step, onSet, onPlates) => {
    const input = h("input", { type: "text", inputmode: label === "Reps" ? "numeric" : "decimal", value: dec(value), placeholder: label === "Reps" ? "—" : "0", "aria-label": label, onInput: (e) => onSet(e.target.value) });
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
    const sets = s.exercises.flatMap((e) => e.sets);
    const done = sets.filter((x) => x.done).length;
    status.textContent = `${done} de ${sets.length} series hechas`;
    fill.style.width = (sets.length ? done / sets.length * 100 : 0) + "%";
    finishButton.disabled = done === 0;
    updateDock();
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
            onClick: () => {
              if (!x.done && !(Number(x.reps) > 0)) return toast("Pon las repeticiones antes de marcarla", "error");
              x.done = !x.done;
              save();
              if (x.done) {
                navigator.vibrate?.(40);
                // Superserie: tras una serie va la del siguiente ejercicio sin descanso;
                // al acabar la del último del grupo, descanso y vuelta al primero.
                const pendingFrom = (from, to) => {
                  for (let j = from; j <= to; j++) {
                    const k = s.exercises[j]?.sets.findIndex((y) => !y.done) ?? -1;
                    if (k >= 0) return { id: s.id, ei: j, si: k };
                  }
                  return null;
                };
                let first = ei;
                while (first > 0 && s.exercises[first - 1].superset) first--;
                const next = e.superset ? pendingFrom(ei + 1, ei + 1) : null;
                const back = !next && first < ei ? pendingFrom(first, ei) : null;
                if (live && !x.warmup && !next && info.rest > 0) timer.start(info.rest, e.name);
                if (setPR(x, marks)) toast(`¡Récord en ${e.name}! ${setLabel(x)}`);
                if (isActive || !active) active = next || back || firstPending();
              }
              draw();
            },
          }, "✓"),
        );
        if (!isActive) return row;
        const panel = h("div", { class: "set-panel" },
          h("div", { class: "steppers" },
            stepper("kg", x.kg, info.step || 2.5, (v) => { x.kg = v.replace(",", "."); save(); row.querySelector(".set-kg").textContent = x.kg !== "" ? dec(x.kg) : "—"; }, (v) => plateSheet(v)),
            stepper("Reps", x.reps, 1, (v) => { x.reps = String(Math.round(num(v) || 0)); save(); row.querySelector(".set-reps").textContent = x.reps; updateDock(); }),
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
            h("button", { class: "btn primary grow", onClick: () => row.querySelector(".set-check").click() }, x.done ? "Desmarcar" : "Serie hecha ✓"),
          ),
        );
        return h("frag", {}, row, panel);
      });

      const suggestText = { up: `Sugerido: +${dec(info.step)} kg y vuelve al mínimo de reps`, reps: "Sugerido: +1 rep en las series que no llegaron al tope", top: "Ya llegas al tope del rango: sube la dificultad" }[e.suggest];
      const partner = e.superset && s.exercises[ei + 1];
      return h("article", { class: "card exercise" + (partner ? " ss-link" : "") + (s.exercises[ei - 1]?.superset ? " ss-tail" : "") },
        h("div", { class: "template-head" },
          h("div", {},
            h("h2", {}, e.name),
            h("p", { class: "ex-meta" }, groupName(info.group), e.target && ` · objetivo ${e.target}`, info.rest > 0 && ` · descanso ${info.rest} s`),
            partner && h("p", { class: "ex-meta ss" }, `Superserie con ${partner.name}: sin descanso entre los dos`),
            live && suggestText && h("p", { class: "ex-suggest" }, suggestText),
            info.note && h("p", { class: "ex-note" }, info.note),
          ),
          h("button", { class: "icon-btn", "aria-label": `Ajustes de ${e.name}`, onClick: () => exerciseSettings(e.name, ctx.rerender) }, icon("settings", 18)),
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

  const addName = h("input", { id: "add-exercise", type: "text", list: "exercise-names", required: true, placeholder: "Busca o escribe un ejercicio" });

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
        : null,
      h("div", { class: "row end" }, h("button", { class: "btn primary", onClick: close }, "Hecho")),
    ));
  };

  return h("frag", {},
    pageHead(s.name, shortDate(s.date), live ? finishButton : h("a", { class: "btn primary", href: "#/entreno/" + s.id }, icon("check", 16), "Listo"),
      h("a", { class: "back-link", href: "#/rutina" }, icon("back", 15), "Entrenamiento")),
    datalist(),
    h("section", { class: "card session-status" }, h("div", { class: "template-head" }, status,
      live ? h("span", { class: "session-clock" }, icon("clock", 17), h("span", { class: "live-time", "data-since": s.startedAt || Date.now() }, "0:00")) : h("span", {}, minutesText(sessionMinutes(s)))),
      h("div", { class: "session-track" }, fill)),
    wrap,
    h("form", { class: "card add-ex", onSubmit: (ev) => {
      ev.preventDefault();
      const n = addName.value.trim();
      if (!n) return;
      s.exercises.push({ name: n, target: "", superset: false, ...prefilled(n, 3, s.date, "") });
      active = { id: s.id, ei: s.exercises.length - 1, si: 0 };
      save();
      addName.value = "";
      addName.blur();
      draw();
      wrap.lastElementChild?.scrollIntoView({ block: "start" });
    } }, h("label", { class: "field-label", for: "add-exercise" }, "Añadir ejercicio"),
      h("div", { class: "add-ex-row" }, addName, h("button", { class: "btn soft", type: "submit" }, icon("plus", 16), "Añadir"))),
    live && h("aside", { class: "session-dock", "aria-label": "Controles de la sesión" },
      h("a", { class: "dock-back icon-btn", href: "#/rutina", "aria-label": "Volver a entrenamiento" }, icon("back", 19)),
      h("div", { class: "dock-copy" }, dockName, dockDetail), dockAction),
    h("div", { class: "row end" },
      h("button", { class: "btn danger ghost", onClick: () => confirmSheet(live ? "Descartar entreno" : "Borrar entreno", "Se borra este entreno y sus series.", live ? "Descartar" : "Borrar", () => {
        state.sessions = state.sessions.filter((x) => x.id !== s.id);
        timer.stop();
        timer.keepAwake(false);
        save();
        ctx.go("#/rutina");
      }) }, live ? "Descartar" : "Borrar entreno"),
    ),
  );
}
