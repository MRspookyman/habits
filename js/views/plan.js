import { h, num, toast } from "../ui.js";
import { state, save, uid } from "../store.js";

export function renderPlan(ctx) {
  const p = state.plan;
  let timer;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { save(); toast("Plan guardado"); }, 700);
  };
  const macroText = () =>
    `Proteína ${(p.protein * 4).toLocaleString("es-ES")} + hidratos ${(p.carbs * 4).toLocaleString("es-ES")} + grasa ${(p.fat * 9).toLocaleString("es-ES")} = ${(p.protein * 4 + p.carbs * 4 + p.fat * 9).toLocaleString("es-ES")} kcal.`;
  const macroHint = h("p", { class: "hint" }, macroText());

  const target = (key, label, unit) =>
    h("label", { class: "target" },
      h("span", { class: "target-label" }, label),
      h("span", { class: "target-value" },
        h("input", { type: "text", inputmode: "numeric", value: p[key], "aria-label": `${label} (${unit})`, onInput: (e) => {
          const v = num(e.target.value);
          if (v == null || v < 0) return;
          p[key] = Math.round(v);
          persist();
          macroHint.textContent = macroText();
        } }),
        h("span", { class: "unit" }, unit),
      ),
    );

  const supWrap = h("div", { class: "stack" });
  const drawSup = () => {
    supWrap.replaceChildren(...p.supplements.map((s, i) => h("div", { class: "sup" },
      h("input", { type: "text", value: s.name, placeholder: "Suplemento", "aria-label": "Suplemento", class: "sup-name", onInput: (e) => { s.name = e.target.value; persist(); } }),
      h("input", { type: "text", value: s.dose, placeholder: "Dosis", "aria-label": "Dosis", onInput: (e) => { s.dose = e.target.value; persist(); } }),
      h("input", { type: "text", value: s.when, placeholder: "Cuándo", "aria-label": "Cuándo", class: "sup-when", onInput: (e) => { s.when = e.target.value; persist(); } }),
      h("button", { class: "icon-btn", "aria-label": `Quitar ${s.name}`, onClick: () => { p.supplements.splice(i, 1); save(); drawSup(); } }, "✕"),
    )));
  };
  drawSup();

  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Plan")),
    h("section", { class: "card" },
      h("h2", {}, "Objetivos diarios"),
      h("div", { class: "targets" },
        target("kcal", "Calorías", "kcal"),
        target("protein", "Proteína", "g"),
        target("carbs", "Hidratos", "g"),
        target("fat", "Grasa", "g"),
      ),
      macroHint,
    ),
    h("section", { class: "card" },
      h("h2", {}, "Suplementos"),
      supWrap,
      h("button", { class: "btn ghost block", onClick: () => { p.supplements.push({ id: uid(), name: "", dose: "", when: "" }); save(); drawSup(); supWrap.lastChild?.querySelector("input")?.focus(); } }, "Añadir suplemento"),
    ),
    h("section", { class: "card" },
      h("h2", {}, h("label", { for: "plan-notes" }, "Notas")),
      h("textarea", { id: "plan-notes", rows: 6, value: p.notes, onInput: (e) => { p.notes = e.target.value; persist(); } }),
    ),
  );
}
