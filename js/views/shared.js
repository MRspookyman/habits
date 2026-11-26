// Piezas comunes a varias pantallas.
import { h, fmt, qty, sheet, toast, confirmSheet, num, field, dec } from "../ui.js";
import { parseKey, dateKey, bodyEntry, setBody } from "../store.js";
import { icon } from "../icons.js";

export const shortDate = (k) => parseKey(k).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
export const rangeText = (from, to) =>
  `${parseKey(from).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${parseKey(to).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;

// Explicación de los hábitos que se marcan solos.
export const ROLE_HINT = {
  sleep: (x) => `Objetivo de ${qty(x.target || 8)} h de sueño`,
  gym: () => "Se completa al registrar un entreno",
  weigh: () => "Se completa al registrar el peso",
};

export const rateText = (r) => (r == null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt(Math.abs(r), 2)} kg/sem`);
export const minutesText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)} min`);
export const kgText = (kg) => `${fmt(kg, Number.isInteger(kg) ? 0 : Number.isInteger(kg * 10) ? 1 : 2)} kg`;
export const setLabel = (x) => `${Number(x.kg) > 0 ? kgText(Number(x.kg)) : "Sin peso"} × ${x.reps}`;

export function editBody(ctx, entry = null, day = dateKey()) {
  const initial = entry || bodyEntry(day);
  sheet(entry ? "Editar pesaje" : "Registrar peso", (close) => {
    const weight = h("input", { type: "text", inputmode: "decimal", value: dec(initial?.weight), autofocus: true, placeholder: "Ej. 72,5" });
    const fat = h("input", { type: "text", inputmode: "decimal", value: dec(initial?.fat), placeholder: "Opcional" });
    const date = h("input", { type: "date", value: entry?.date || day, max: dateKey(), required: true, onChange: () => {
      if (entry) return;
      const selected = bodyEntry(date.value);
      weight.value = dec(selected?.weight);
      fat.value = dec(selected?.fat);
    } });
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      const w = num(weight.value);
      const f = num(fat.value);
      if (weight.value && !(w > 0)) return toast("Introduce un peso mayor que cero.", "error");
      if (fat.value && (f == null || f < 0 || f > 100)) return toast("Introduce un porcentaje entre 0 y 100.", "error");
      if (w == null && f == null) return toast("Introduce el peso o la grasa corporal.", "error");
      if (entry && date.value !== entry.date) {
        if (bodyEntry(date.value)) return toast("Ya hay un pesaje en esa fecha.", "error");
        setBody(entry.date, null, null);
      }
      setBody(date.value, w, f);
      close();
      ctx.rerender();
      toast("Pesaje guardado");
    } },
      field("Fecha", date),
      h("div", { class: "form-pair" }, field("Peso (kg)", weight), field("Grasa corporal (%)", fat)),
      h("div", { class: "row end" },
        entry && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Eliminar pesaje", `Se eliminará el registro del ${shortDate(entry.date)}.`, "Eliminar", () => { setBody(entry.date, null, null); close(); ctx.rerender(); }) }, "Eliminar"),
        h("button", { type: "submit", class: "btn primary" }, "Guardar pesaje")),
    );
  });
}

export function weekSummaryBlock(sum) {
  const metric = (label, symbol, value) => h("div", {}, h("dt", {}, icon(symbol, 16), label), h("dd", {}, value));
  return h("dl", { class: "stats week-stats" },
    metric("Hábitos", "layers", sum.compliance == null ? "—" : `${Math.round(sum.compliance * 100)} %`),
    metric("Entrenos", "gym", String(sum.workouts)), metric("Deporte", "clock", sum.sportMin ? minutesText(sum.sportMin) : "—"),
    metric("Peso medio", "scale", sum.avgWeight != null ? `${fmt(sum.avgWeight)} kg` : "—"),
    metric("Ritmo", "chart", rateText(sum.rate)), metric("Récords", "flag", String(sum.prs.length)));
}
