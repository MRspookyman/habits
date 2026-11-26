import { h, sheet, confirmSheet, toast, dayPicker, field } from "../ui.js";
import { state, save, uid, exportJSON, importJSON, dateKey, DAY_LETTERS } from "../store.js";
import * as push from "../push.js";
import * as health from "../health.js";

const daysText = (days) =>
  days.length === 7 ? "Todos los días" : days.length === 0 ? "Ningún día" : days.map((d) => DAY_LETTERS[d]).join(" ");

function editHabit(ctx, existing) {
  const x = existing ? structuredClone(existing) : { id: uid(), name: "", detail: "", days: [0, 1, 2, 3, 4, 5, 6], active: true };
  sheet(existing ? "Editar hábito" : "Nuevo hábito", (close) => {
    const name = h("input", { type: "text", value: x.name, required: true, placeholder: "Creatina" });
    const detail = h("input", { type: "text", value: x.detail, placeholder: "5 g" });
    const active = h("input", { type: "checkbox", checked: x.active });
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      x.name = name.value.trim();
      x.detail = detail.value.trim();
      x.active = active.checked;
      if (!x.name) return toast("Ponle un nombre al hábito", "error");
      if (!x.days.length) return toast("Elige al menos un día", "error");
      const i = state.habits.findIndex((y) => y.id === x.id);
      i >= 0 ? (state.habits[i] = x) : state.habits.push(x);
      save();
      push.syncSchedule().catch(() => {});
      close();
      ctx.rerender();
    } },
      field("Nombre", name),
      field("Detalle", detail, "Se muestra debajo del nombre: dosis, cantidad…"),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Días"), dayPicker(x.days, (d) => (x.days = d))),
      h("label", { class: "switch" }, active, h("span", {}, "Activo (si lo desactivas, deja de aparecer pero se guarda el historial)")),
      h("div", { class: "row end" },
        existing && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Borrar hábito", `Se borra «${existing.name}» y sus marcas. Si solo quieres dejar de verlo, desactívalo.`, "Borrar", () => {
          state.habits = state.habits.filter((y) => y.id !== existing.id);
          for (const k of Object.keys(state.checks)) state.checks[k] = state.checks[k].filter((id) => id !== existing.id);
          for (const r of state.reminders) r.habitIds = r.habitIds.filter((id) => id !== existing.id);
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

function editReminder(ctx, existing) {
  const r = existing ? structuredClone(existing) : { id: uid(), title: "", time: "09:00", days: [0, 1, 2, 3, 4, 5, 6], habitIds: [], weigh: false, active: true };
  sheet(existing ? "Editar recordatorio" : "Nuevo recordatorio", (close) => {
    const title = h("input", { type: "text", value: r.title, required: true, placeholder: "Creatina y omega-3" });
    const time = h("input", { type: "time", value: r.time, required: true });
    const weigh = h("input", { type: "checkbox", checked: r.weigh });
    const active = h("input", { type: "checkbox", checked: r.active });
    const picks = state.habits.map((x) => h("label", { class: "switch" },
      h("input", { type: "checkbox", value: x.id, checked: r.habitIds.includes(x.id) }), h("span", {}, x.name)));
    return h("form", { onSubmit: async (e) => {
      e.preventDefault();
      r.title = title.value.trim();
      r.time = time.value;
      r.weigh = weigh.checked;
      r.active = active.checked;
      r.habitIds = picks.map((p) => p.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
      if (!r.title) return toast("Ponle un título", "error");
      if (!r.days.length) return toast("Elige al menos un día", "error");
      const i = state.reminders.findIndex((y) => y.id === r.id);
      i >= 0 ? (state.reminders[i] = r) : state.reminders.push(r);
      save();
      close();
      ctx.rerender();
      try { await push.syncSchedule(); } catch (err) { toast(`Guardado en el móvil, pero no en el servidor: ${err.message}`, "error"); }
    } },
      field("Texto del aviso", title),
      field("Hora (hora de España)", time),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Días"), dayPicker(r.days, (d) => (r.days = d))),
      h("fieldset", { class: "field" }, h("legend", { class: "field-label" }, "No avisar si ya está marcado"), picks,
        h("label", { class: "switch" }, weigh, h("span", {}, "Pesaje de hoy apuntado"))),
      h("label", { class: "switch" }, active, h("span", {}, "Activo")),
      h("div", { class: "row end" },
        existing && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Borrar recordatorio", `Se borra «${existing.title}».`, "Borrar", async () => {
          state.reminders = state.reminders.filter((y) => y.id !== existing.id);
          save();
          close();
          ctx.rerender();
          await push.syncSchedule().catch(() => {});
        }) }, "Borrar"),
        h("button", { type: "submit", class: "btn primary" }, "Guardar recordatorio"),
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

export function renderSettings(ctx) {
  const habitsCard = h("section", { class: "card" },
    h("h2", {}, "Hábitos"),
    h("ul", { class: "edit-list" }, state.habits.map((x, i) => h("li", { class: x.active ? "" : "off" },
      h("button", { class: "link-row", onClick: () => editHabit(ctx, x) },
        h("span", {}, x.name, x.active ? "" : h("span", { class: "muted" }, " (inactivo)")),
        h("span", { class: "muted" }, daysText(x.days))),
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

  const remindersCard = h("section", { class: "card" },
    h("h2", {}, "Recordatorios"),
    pushStatus,
    h("ul", { class: "edit-list" }, state.reminders.slice().sort((a, b) => a.time.localeCompare(b.time)).map((r) => h("li", { class: r.active ? "" : "off" },
      h("button", { class: "link-row", onClick: () => editReminder(ctx, r) },
        h("span", {}, h("strong", { class: "time" }, r.time), " ", r.title),
        h("span", { class: "muted" }, daysText(r.days))),
    ))),
    h("button", { class: "btn ghost block", onClick: () => editReminder(ctx, null) }, "Añadir recordatorio"),
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

  const backupCard = h("section", { class: "card" },
    h("h2", {}, "Copia de seguridad"),
    h("p", { class: "muted" }, "Tus datos viven solo en este dispositivo. Exporta una copia de vez en cuando; sirve también para pasar los datos a otro móvil o al PC."),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onClick: () => {
        const blob = new Blob([exportJSON()], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: `habits-${dateKey()}.json` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, "Exportar copia"),
      h("button", { class: "btn ghost", onClick: () => fileInput.click() }, "Importar copia"),
      fileInput,
    ),
  );

  const installCard = ctx.installPrompt && h("section", { class: "card" },
    h("h2", {}, "Instalar"),
    h("button", { class: "btn primary block", onClick: async () => { ctx.installPrompt.prompt(); await ctx.installPrompt.userChoice; ctx.installPrompt = null; ctx.rerender(); } }, "Instalar Habits en este dispositivo"),
  );

  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Ajustes")),
    installCard,
    habitsCard,
    remindersCard,
    h("section", { class: "card" }, h("h2", {}, "Google Health (Fitbit)"), googleBody),
    backupCard,
    h("section", { class: "card" },
      h("h2", {}, "Borrar datos"),
      h("button", { class: "btn danger ghost block", onClick: () => confirmSheet("Borrar todos los datos", "Se borran hábitos, marcas, entrenos, pesajes y el plan de este dispositivo. No se puede deshacer: exporta antes una copia.", "Borrar todo", async () => {
        await push.disable().catch(() => {});
        localStorage.removeItem("habits.v1");
        location.reload();
      }) }, "Borrar todos los datos"),
    ),
  );
}
