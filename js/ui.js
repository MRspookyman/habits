// Utilidades mínimas de DOM.
export function h(tag, props = {}, ...children) {
  const el = tag === "frag" ? document.createDocumentFragment() : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let toastTimer;
export function toast(text, kind = "info") {
  let t = document.getElementById("toast");
  if (!t) {
    t = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.append(t);
  }
  t.textContent = text;
  t.dataset.kind = kind;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), kind === "error" ? 6000 : 2600);
}

// Hoja inferior modal. `build(close)` devuelve el contenido.
export function sheet(title, build) {
  const prevFocus = document.activeElement;
  const close = () => {
    dlg.close();
    dlg.remove();
    prevFocus?.focus?.();
  };
  const dlg = h(
    "dialog",
    { class: "sheet", "aria-label": title, onCancel: (e) => { e.preventDefault(); close(); } },
    h("div", { class: "sheet-head" }, h("h2", {}, title), h("button", { class: "icon-btn", "aria-label": "Cerrar", onClick: close }, "✕")),
    h("div", { class: "sheet-body" }, build(close)),
  );
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

export function confirmSheet(title, text, okLabel, onOk, danger = true) {
  sheet(title, (close) =>
    h("frag", {},
      h("p", { class: "muted" }, text),
      h("div", { class: "row end" },
        h("button", { class: "btn ghost", onClick: close }, "Cancelar"),
        h("button", { class: danger ? "btn danger" : "btn primary", onClick: () => { close(); onOk(); } }, okLabel),
      ),
    ),
  );
}

export function dayPicker(days, onChange) {
  const letters = ["L", "M", "X", "J", "V", "S", "D"];
  const names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const set = new Set(days);
  const wrap = h("div", { class: "days", role: "group", "aria-label": "Días de la semana" });
  letters.forEach((l, i) => {
    const b = h("button", {
      type: "button",
      class: "day" + (set.has(i) ? " on" : ""),
      "aria-pressed": String(set.has(i)),
      "aria-label": names[i],
      onClick: () => {
        set.has(i) ? set.delete(i) : set.add(i);
        b.classList.toggle("on", set.has(i));
        b.setAttribute("aria-pressed", String(set.has(i)));
        onChange([...set].sort());
      },
    }, l);
    wrap.append(b);
  });
  return wrap;
}

export const fmt = (n, dec = 1) =>
  n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const num = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
// Número sin decimales sobrantes: 3 → "3", 0,5 → "0,5", 4200 → "4.200".
export const qty = (n) => (n == null ? "—" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: 2 }));

// Valor numérico para un <input> de texto, con coma decimal.
export const dec = (v) => (v == null ? "" : String(v).replace(".", ","));
export function field(label, input, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), input, hint && h("span", { class: "hint" }, hint));
}

// Botones de opción única. options: [[valor, texto], …]
export const segmented = (options, value, onPick, label) =>
  h("div", { class: "segmented", role: "group", "aria-label": label },
    options.map(([v, text]) => h("button", { type: "button", class: v === value ? "on" : "", "aria-pressed": String(v === value), onClick: () => onPick(v) }, text)));
