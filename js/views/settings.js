import { h, sheet, confirmSheet, toast, dayPicker, field, segmented, num, qty, dec } from "../ui.js";
import { state, save, newHabit, roleHabit, exportJSON, importJSON, dateKey, wipe, DAY_LETTERS } from "../store.js";
import * as push from "../push.js";
import * as health from "../health.js";
import * as backup from "../backup.js";

const daysText = (days) =>
  days.length === 7 ? "Todos los días" : days.length === 0 ? "Ningún día" : days.map((d) => DAY_LETTERS[d]).join(" ");
const freqText = (x) => (x.perWeek ? `${x.perWeek} ${x.perWeek === 1 ? "vez" : "veces"}/semana` : daysText(x.days));

const ROLES = {
  check: [["", "No, a mano"], ["sleep", "Con el sueño de la Fitbit"], ["gym", "Al hacer un entreno o deporte"], ["weigh", "Al apuntar el peso"]],
  amount: [["", "No"], ["kcal", "Sí: objetivo de calorías"], ["protein", "Sí: objetivo de proteína"]],
};

function editHabit(ctx, existing) {
  const x = existing ? structuredClone(existing) : newHabit();
  sheet(existing ? "Editar hábito" : "Nuevo hábito", (close) => {
    const name = h("input", { type: "text", value: x.name, required: true, placeholder: "Creatina" });
    const detail = h("input", { type: "text", value: x.detail, placeholder: "5 g" });
    const remind = h("input", { type: "time", value: x.remind || "" });
    const active = h("input", { type: "checkbox", checked: x.active });

    // Tipo (casilla o cantidad) y lo que depende de él.
    const kindBox = h("div");
    const drawKind = () => {
      const roleSelect = h("select", { onChange: (e) => { x.role = e.target.value || null; if (x.role === "sleep") x.target ||= 8; drawKind(); } },
        ROLES[x.kind].map(([v, t]) => h("option", { value: v, selected: (x.role || "") === v }, t)));
      const typeField = h("div", { class: "field" }, h("span", { class: "field-label" }, "Tipo"),
        segmented([["check", "Casilla"], ["amount", "Cantidad"]], x.kind, (v) => {
          x.kind = v;
          if (!ROLES[v].some(([r]) => r === (x.role || ""))) x.role = null;
          if (v === "amount" && !(x.target > 0)) x.target = null;
          drawKind();
        }, "Tipo de hábito"),
        h("span", { class: "hint" }, x.kind === "amount" ? "Sumas cantidades durante el día (agua, proteína…) y se marca al llegar al objetivo." : "Se marca con un toque."),
      );
      if (x.kind === "amount") {
        const target = h("input", { type: "text", inputmode: "decimal", value: dec(x.target), placeholder: "3", onInput: (e) => (x.target = num(e.target.value)) });
        const unit = h("input", { type: "text", value: x.unit, placeholder: "L", onInput: (e) => (x.unit = e.target.value.trim()) });
        const quick = h("input", { type: "text", inputmode: "decimal", value: x.quick.map(dec).join("  "), placeholder: "0,5  1", onInput: (e) => {
          x.quick = e.target.value.split(/\s+/).map(num).filter((v) => v > 0).slice(0, 5);
        } });
        kindBox.replaceChildren(typeField,
          h("div", { class: "row field" }, h("label", { class: "mini-field" }, h("span", {}, "Objetivo al día"), target), h("label", { class: "mini-field" }, h("span", {}, "Unidad"), unit)),
          field("Botones rápidos", quick, "Hasta 5 cantidades separadas por espacios."),
          field("¿Es un objetivo del plan?", roleSelect, "Calorías y proteína alimentan el consejo de calorías y el cálculo del gasto real."),
        );
      } else {
        const hours = h("input", { type: "text", inputmode: "decimal", value: dec(x.target ?? 8), onInput: (e) => (x.target = num(e.target.value)) });
        kindBox.replaceChildren(h("frag", {}, typeField,
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
      x.perWeek && h("span", { class: "hint" }, "Aparece cada día hasta que lo cumplas; solo cuenta como fallo cuando ya no quedan días para llegar."),
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
      save();
      push.syncSchedule().catch((err) => toast(`Guardado, pero el aviso no llegó al servidor: ${err.message}`, "error"));
      close();
      ctx.rerender();
    } },
      field("Nombre", name),
      field("Detalle", detail, "Se muestra debajo del nombre: dosis, cuándo…"),
      kindBox,
      freqBox,
      field("Aviso (hora de España)", remind, "Vacío = sin aviso. Los hábitos con la misma hora llegan en un solo aviso, que no salta si ya están hechos."),
      h("label", { class: "switch" }, active, h("span", {}, "Activo (si lo desactivas, deja de aparecer pero se guarda el historial)")),
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

function planCard() {
  const p = state.plan;
  const kcal = roleHabit("kcal");
  const protein = roleHabit("protein");
  let timer;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { save(); toast("Plan guardado"); }, 700);
  };
  const macroText = () => {
    const prot = protein?.target || 0;
    const sum = prot * 4 + p.carbs * 4 + p.fat * 9;
    return `Proteína ${qty(prot * 4)} + hidratos ${qty(p.carbs * 4)} + grasa ${qty(p.fat * 9)} = ${qty(sum)} kcal${kcal ? ` (objetivo ${qty(kcal.target)})` : ""}.`;
  };
  const macroHint = h("p", { class: "hint" }, macroText());

  const target = (label, unit, value, onSet) =>
    h("label", { class: "target" + (onSet ? "" : " off") },
      h("span", { class: "target-label" }, label),
      h("span", { class: "target-value" },
        h("input", { type: "text", inputmode: "numeric", value: value ?? "—", disabled: !onSet, "aria-label": `${label} (${unit})`, onInput: (e) => {
          const v = num(e.target.value);
          if (v == null || v <= 0) return;
          onSet(Math.round(v));
          persist();
          macroHint.textContent = macroText();
        } }),
        h("span", { class: "unit" }, unit),
      ),
    );

  return h("section", { class: "card" },
    h("h2", {}, "Plan"),
    h("div", { class: "targets" },
      target("Calorías", "kcal", kcal?.target, kcal && ((v) => (kcal.target = v))),
      target("Proteína", "g", protein?.target, protein && ((v) => (protein.target = v))),
      target("Hidratos", "g", p.carbs, (v) => (p.carbs = v)),
      target("Grasa", "g", p.fat, (v) => (p.fat = v)),
    ),
    macroHint,
    (!kcal || !protein) && h("p", { class: "hint" }, "Para tener objetivo de calorías o proteína, crea un hábito de tipo Cantidad y márcalo como objetivo del plan."),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "Notas"),
      h("textarea", { rows: 6, value: p.notes, onInput: (e) => { p.notes = e.target.value; persist(); } })),
  );
}

function codeSheet() {
  const code = backup.recoveryCode();
  sheet("Código de recuperación", () => h("frag", {},
    h("p", { class: "muted" }, "Guárdalo fuera del móvil, por ejemplo en tu gestor de contraseñas. Con él recuperas la copia en otro dispositivo; quien lo tenga puede leer tus datos."),
    h("textarea", { rows: 4, readonly: true, class: "code", value: code, "aria-label": "Código de recuperación" }),
    h("div", { class: "row end" }, h("button", { class: "btn primary", onClick: () => navigator.clipboard.writeText(code).then(() => toast("Código copiado"), () => toast("No se pudo copiar: selecciónalo a mano", "error")) }, "Copiar")),
  ));
}

function restoreSheet(ctx) {
  sheet("Restaurar desde la nube", (close) => {
    const code = h("textarea", { rows: 4, required: true, placeholder: "Pega aquí el código de recuperación del otro dispositivo" });
    const submit = h("button", { type: "submit", class: "btn primary" }, "Descargar copia");
    return h("form", { onSubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const text = await backup.download(code.value);
        close();
        confirmSheet("Restaurar copia", "Se reemplazan todos los datos de este dispositivo por los de la copia.", "Restaurar", () => {
          try {
            importJSON(text);
            toast("Copia restaurada");
            push.syncSchedule().catch(() => {});
            ctx.rerender();
          } catch (err) { toast(`No se pudo restaurar: ${err.message}`, "error"); }
        });
      } catch (err) {
        toast(err.message, "error");
        submit.disabled = false;
      }
    } }, field("Código", code), h("div", { class: "row end" }, submit));
  });
}

function backupCard(ctx) {
  const b = state.backup;
  const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onChange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = "";
    confirmSheet("Importar copia", "Se reemplazan todos los datos de este dispositivo por los de la copia.", "Importar", () => {
      try {
        importJSON(text);
        toast("Copia importada");
        push.syncSchedule().catch(() => {});
        ctx.rerender();
      } catch (err) { toast(`No se pudo importar: ${err.message}`, "error"); }
    });
  } });
  const when = (t) => new Date(t).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

  let cloud = null;
  if (backup.isAvailable()) {
    const toggle = h("input", { type: "checkbox", checked: b.cloud, onChange: async (e) => {
      if (!e.target.checked) {
        b.cloud = false;
        save();
        return ctx.rerender();
      }
      e.target.disabled = true;
      try {
        await backup.upload();
        state.backup.cloud = true;
        save();
        toast("Copia automática activada");
      } catch (err) { toast(`No se pudo subir la copia: ${err.message}`, "error"); }
      ctx.rerender();
    } });
    cloud = h("frag", {},
      h("label", { class: "switch" }, toggle, h("span", {}, "Copia automática diaria en tu servidor, cifrada en el móvil")),
      b.lastCloud && h("p", { class: "hint" }, `Última copia en la nube: ${when(b.lastCloud)}`),
      h("div", { class: "row" },
        b.cloud && h("button", { class: "btn ghost small", onClick: async (e) => {
          e.target.disabled = true;
          try { await backup.upload(); toast("Copia subida"); } catch (err) { toast(err.message, "error"); }
          ctx.rerender();
        } }, "Subir ahora"),
        b.cloud && h("button", { class: "btn ghost small", onClick: codeSheet }, "Código de recuperación"),
        h("button", { class: "btn ghost small", onClick: () => restoreSheet(ctx) }, "Restaurar desde la nube"),
      ),
    );
  }

  return h("section", { class: "card" },
    h("h2", {}, "Copia de seguridad"),
    h("p", { class: "muted" }, "Tus datos viven en este dispositivo. Haz copias para no perderlos y para pasarlos a otro móvil o al PC."),
    cloud,
    h("div", { class: "row" },
      h("button", { class: "btn primary", onClick: () => {
        const blob = new Blob([exportJSON()], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: `habits-${dateKey()}.json` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        b.lastExport = Date.now();
        save();
      } }, "Exportar archivo"),
      h("button", { class: "btn ghost", onClick: () => fileInput.click() }, "Importar archivo"),
      fileInput,
    ),
    b.lastExport && h("p", { class: "hint" }, `Último archivo exportado: ${when(b.lastExport)}`),
  );
}

export function renderSettings(ctx) {
  const habitsCard = h("section", { class: "card" },
    h("h2", {}, "Hábitos"),
    h("ul", { class: "edit-list" }, state.habits.map((x, i) => h("li", { class: x.active ? "" : "off" },
      h("button", { class: "link-row", onClick: () => editHabit(ctx, x) },
        h("span", {}, x.name, x.active ? "" : h("span", { class: "muted" }, " (inactivo)")),
        h("span", { class: "muted right" }, [x.kind === "amount" && `${qty(x.target)} ${x.unit}`.trim(), freqText(x), x.remind && `aviso ${x.remind}`].filter(Boolean).join(" · "))),
      h("button", { class: "icon-btn", "aria-label": `Subir ${x.name}`, disabled: i === 0, onClick: () => { move(state.habits, i, -1); ctx.rerender(); } }, "↑"),
    ))),
    h("button", { class: "btn ghost block", onClick: () => editHabit(ctx, null) }, "Añadir hábito"),
  );

  let pushStatus;
  if (!push.isConfigured()) pushStatus = h("p", { class: "muted" }, "El servidor de avisos aún no está configurado en esta versión.");
  else if (!push.isSupported()) pushStatus = h("p", { class: "muted" }, "Este navegador no admite avisos. En Android, instala la app desde Chrome.");
  else if (state.push.enabled) {
    pushStatus = h("div", { class: "row" },
      h("span", { class: "chip ok" }, "Avisos activados"),
      h("button", { class: "btn ghost small", onClick: async () => { try { await push.sendTest(); toast("Aviso de prueba enviado"); } catch (e) { toast(e.message, "error"); } } }, "Enviar prueba"),
      h("button", { class: "btn ghost small", onClick: async () => { await push.disable(); ctx.rerender(); toast("Avisos desactivados"); } }, "Desactivar"),
    );
  } else {
    pushStatus = h("button", { class: "btn primary block", onClick: async () => {
      try { await push.enable(); toast("Avisos activados"); ctx.rerender(); } catch (e) { toast(e.message, "error"); }
    } }, "Activar avisos en este móvil");
  }
  const reminded = state.habits.filter((x) => x.active && x.remind).length;
  const pushCard = h("section", { class: "card" },
    h("h2", {}, "Avisos"),
    pushStatus,
    h("p", { class: "hint" }, `La hora de aviso se pone en cada hábito (${reminded} con aviso). En la notificación, «Hecho» lo marca sin abrir la app.`),
  );

  let googleBody;
  if (!health.isConfigured()) {
    googleBody = h("p", { class: "muted" }, "La conexión con Google Health aún no está configurada en esta versión.");
  } else if (!health.isConnected()) {
    googleBody = h("frag", {},
      h("p", {}, "Trae de tu Fitbit Air el sueño, el pulso en reposo, los pasos y las kcal gastadas de los últimos 14 días. El permiso se guarda solo en este móvil."),
      h("p", { class: "hint" }, "Google pide volver a conectar cada 7 días; te llegará un aviso."),
      h("button", { class: "btn primary block", onClick: () => health.connect() }, "Conectar Google Health"),
    );
  } else {
    const g = state.google;
    const until = new Date(g.consentAt + 7 * 86400000).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
    googleBody = h("frag", {},
      h("p", {}, g.expired ? h("span", { class: "chip warn" }, "Permiso caducado") : h("span", { class: "chip ok" }, `Conectado hasta el ${until}`)),
      h("p", { class: "hint" }, g.lastSync ? `Última sincronización: ${new Date(g.lastSync).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}` : "Aún sin sincronizar"),
      h("div", { class: "row" },
        g.expired
          ? h("button", { class: "btn primary small", onClick: () => health.connect() }, "Volver a conectar")
          : h("button", { class: "btn ghost small", onClick: async (e) => {
              e.target.disabled = true;
              try {
                const errors = await health.sync();
                toast(errors.length ? `Sincronizado con avisos: ${errors.join("; ")}` : "Datos de Fitbit actualizados", errors.length ? "error" : "info");
              } catch (err) { toast(err.message, "error"); }
              ctx.rerender();
            } }, "Sincronizar ahora"),
        h("button", { class: "btn ghost small", onClick: () => confirmSheet("Desconectar Google Health", "Se borra el permiso de este móvil. Los datos ya traídos se conservan.", "Desconectar", () => { health.disconnect(); push.syncState().catch(() => {}); ctx.rerender(); }) }, "Desconectar"),
      ),
    );
  }

  const installCard = ctx.installPrompt && h("section", { class: "card" },
    h("h2", {}, "Instalar"),
    h("button", { class: "btn primary block", onClick: async () => { ctx.installPrompt.prompt(); await ctx.installPrompt.userChoice; ctx.installPrompt = null; ctx.rerender(); } }, "Instalar Habits en este dispositivo"),
  );

  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Ajustes")),
    installCard,
    habitsCard,
    planCard(),
    pushCard,
    h("section", { class: "card" }, h("h2", {}, "Google Health (Fitbit)"), googleBody),
    backupCard(ctx),
    h("section", { class: "card" },
      h("h2", {}, "Borrar datos"),
      h("button", { class: "btn danger ghost block", onClick: () => confirmSheet("Borrar todos los datos", "Se borran hábitos, marcas, entrenos, pesajes y el plan de este dispositivo. No se puede deshacer: exporta antes una copia.", "Borrar todo", async () => {
        await push.disable().catch(() => {});
        await wipe();
        location.reload();
      }) }, "Borrar todos los datos"),
    ),
  );
}
