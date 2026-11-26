// Piezas comunes a varias pantallas.
import { h, fmt } from "../ui.js";
import { parseKey } from "../store.js";

export const shortDate = (k) => parseKey(k).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
export const rangeText = (from, to) =>
  `${parseKey(from).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${parseKey(to).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;

export const rateText = (r) => (r == null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt(Math.abs(r), 2)} kg/sem`);
export const minutesText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)} min`);
export const kgText = (kg) => `${fmt(kg, Number.isInteger(kg) ? 0 : Number.isInteger(kg * 10) ? 1 : 2)} kg`;
export const setLabel = (x) => `${Number(x.kg) > 0 ? kgText(Number(x.kg)) : "Sin peso"} × ${x.reps}`;

export function weekSummaryBlock(sum) {
  return h("dl", { class: "stats stats-3" },
    h("div", {}, h("dt", {}, "Entrenos"), h("dd", {}, String(sum.workouts))),
    h("div", {}, h("dt", {}, "Deporte"), h("dd", {}, sum.sportMin ? minutesText(sum.sportMin) : "—")),
    h("div", {}, h("dt", {}, "Hábitos"), h("dd", {}, sum.compliance == null ? "—" : `${Math.round(sum.compliance * 100)} %`)),
    h("div", {}, h("dt", {}, "Peso medio"), h("dd", {}, sum.avgWeight != null ? `${fmt(sum.avgWeight)} kg` : "—")),
    h("div", {}, h("dt", {}, "Ritmo"), h("dd", {}, rateText(sum.rate))),
    h("div", {}, h("dt", {}, "Récords"), h("dd", {}, String(sum.prs.length))),
  );
}
