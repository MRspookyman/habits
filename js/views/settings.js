import { h, sheet, confirmSheet, toast, field, num, qty, pageHead } from "../ui.js";
import { state, save, roleHabit, exportJSON, importJSON, dateKey, wipe } from "../store.js";
import { icon } from "../icons.js";
import * as push from "../push.js";
import * as health from "../health.js";
import * as backup from "../backup.js";

function planCard() {
  const kcal = roleHabit("kcal");
  const protein = roleHabit("protein");
  const targets = [
    ["kcal", "Calorías", "kcal", kcal?.target, "flame", "apricot"],
    ["protein", "Proteína", "g", protein?.target, "protein", "lavender"],
    ["carbs", "Hidratos", "g", state.plan.carbs, "bowl", "sand"],
    ["fat", "Grasa", "g", state.plan.fat, "drop", "sage"],
  ];
  const inputs = {};
  const total = h("p", { class: "hint", "aria-live": "polite" });
  const updateTotal = () => {
    const sum = (num(inputs.protein.value) || 0) * 4 + (num(inputs.carbs.value) || 0) * 4 + (num(inputs.fat.value) || 0) * 9;
    total.textContent = "Energía de los macronutrientes · " + qty(sum) + " kcal al día";
  };
  const cards = targets.map(([key, label, unit, value, symbol, tone]) => {
    const locked = (key === "kcal" && !kcal) || (key === "protein" && !protein);
    const input = h("input", { type: "number", min: 1, step: 1, required: !locked, disabled: locked, value: value ?? "", placeholder: "—", "aria-label": label + " (" + unit + ")", onInput: updateTotal });
    inputs[key] = input;
    return h("label", { class: "target" }, h("span", { class: "tile tone-" + tone }, icon(symbol, 19)),
      h("span", { class: "target-label" }, label), h("span", { class: "target-value" }, input, h("span", {}, unit)));
  });
  updateTotal();
  const notes = h("textarea", { rows: 5, value: state.plan.notes });
  return h("form", { class: "plan-form stack", onInput: (e) => { e.currentTarget.dataset.dirty = "true"; }, onSubmit: (e) => {
    e.preventDefault();
    for (const role of ["kcal", "protein"]) {
      const habit = roleHabit(role);
      if (habit && !inputs[role].disabled) habit.target = Number(inputs[role].value);
    }
    state.plan.carbs = Number(inputs.carbs.value);
    state.plan.fat = Number(inputs.fat.value);
    state.plan.notes = notes.value;
    save();
    delete e.currentTarget.dataset.dirty;
    toast("Plan nutricional guardado");
  } },
    h("section", { class: "card" }, h("h2", {}, "Objetivos diarios"), h("div", { class: "targets" }, cards), total,
      (!kcal || !protein) && h("p", { class: "hint" }, "Para fijar calorías o proteína, vincula un hábito de cantidad desde ", h("a", { href: "#/habitos" }, "Mis hábitos"), ".")),
    h("section", { class: "card" }, h("label", { class: "field" }, h("span", { class: "field-heading" }, "Notas del plan"), notes)),
    h("div", { class: "row end" }, h("button", { class: "btn primary", type: "submit" }, "Guardar plan")));
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
    h("span", { class: "tile tone-mint" }, icon("drive")),
    h("h2", {}, "Copia de seguridad"),
    h("p", { class: "muted" }, "Exporta tu diario, pásalo a otro dispositivo o recupera una copia anterior."),
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
        ctx.rerender();
      } }, "Exportar archivo"),
      h("button", { class: "btn ghost", onClick: () => fileInput.click() }, "Importar archivo"),
      fileInput,
    ),
    b.lastExport && h("p", { class: "hint" }, `Último archivo exportado: ${when(b.lastExport)}`),
  );
}

export function renderSettings(ctx) {
  const section = ctx.params.section;
  const isPlan = section === "plan";
  const isData = section === "datos";
  const header = pageHead(isPlan ? "Plan nutricional" : "Ajustes", isPlan ? "Los objetivos de calorías y proteína se aplican también a tu diario." : null);
  const links = [["#/ajustes", "Conexiones", !isPlan && !isData], ["#/plan", "Plan nutricional", isPlan], ["#/ajustes/datos", "Datos y copias", isData]];
  const nav = h("nav", { class: "sub-nav", "aria-label": "Secciones de ajustes" }, links.map(([href, label, current]) =>
    h("a", { href, "aria-current": current ? "page" : null }, label)));
  if (isPlan) return h("frag", {}, header, nav, planCard());
  if (isData) return h("frag", {}, header, nav, h("div", { class: "settings-stack" }, backupCard(ctx),
    h("section", { class: "card danger-zone" }, h("h2", {}, "Restablecer la aplicación"),
      h("p", { class: "muted" }, "Elimina los registros guardados en este dispositivo."),
      h("button", { class: "btn danger ghost", onClick: () => confirmSheet("Borrar todos los datos", "Se eliminarán los hábitos, entrenamientos, pesajes y objetivos de este dispositivo. Esta acción es permanente.", "Borrar todo", async () => {
        if (state.push.enabled) await push.disable().catch(() => {});
        await wipe();
        location.reload();
      }) }, "Borrar todos los datos"))));
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let pushStatus;
  if (!push.isConfigured()) pushStatus = h("p", { class: "muted" }, "El servidor de avisos aún no está configurado en esta versión.");
  else if (appleMobile && !installed) pushStatus = h("p", { class: "hint" }, "Para activar los avisos, abre Habits desde el icono de la pantalla de inicio.");
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
    } }, "Activar notificaciones");
  }
  const reminded = state.habits.filter((x) => x.active && x.remind).length;
  const pushCard = h("section", { class: "card" },
    h("span", { class: "tile tone-apricot" }, icon("bell")),
    h("h2", {}, "Recordatorios"),
    h("p", { class: "muted" }, "Recibe un aviso a la hora que elijas para cada hábito y márcalo desde la notificación."),
    h("a", { class: "text-action", href: "#/habitos" }, `${reminded} ${reminded === 1 ? "hábito con recordatorio" : "hábitos con recordatorio"}`, icon("right", 15)),
    pushStatus,
  );

  let googleBody;
  if (!health.isConfigured()) {
    googleBody = h("p", { class: "muted" }, "La conexión con Google Health aún no está configurada en esta versión.");
  } else if (!health.isConnected()) {
    googleBody = h("frag", {},
      h("p", { class: "muted" }, "Importa el sueño, el pulso, los pasos y el gasto energético de tu Fitbit de los últimos 14 días."),
      h("p", { class: "hint" }, "El permiso de Google se renueva cada siete días."),
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

  const installCard = !installed && (ctx.installPrompt || appleMobile) && h("section", { class: "card" },
    h("h2", {}, "Pantalla de inicio"),
    ctx.installPrompt
      ? h("button", { class: "btn primary", onClick: async () => {
          const prompt = ctx.installPrompt;
          ctx.installPrompt = null;
          try { await prompt.prompt(); await prompt.userChoice; }
          catch { toast("No se pudo abrir la instalación.", "error"); }
          finally { ctx.rerender(); }
        } }, "Instalar Habits")
      : h("p", { class: "muted" }, "En Safari, abre Compartir y elige «Añadir a pantalla de inicio». Si aparece «Abrir como app web», actívalo antes de añadirla."),
  );

  return h("frag", {},
    header, nav, h("div", { class: "settings-grid" }, pushCard,
      h("section", { class: "card" }, h("span", { class: "tile tone-sky" }, icon("heart")), h("h2", {}, "Google Health"), googleBody),
      installCard),
  );
}
