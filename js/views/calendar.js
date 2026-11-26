import { h } from "../ui.js";
import { icon } from "../icons.js";
import { state, dateKey, parseKey, addDays, weekday } from "../store.js";
import { trainedOn } from "../logic.js";

const dateFormat = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
export const longDate = (key) => dateFormat.format(parseKey(key));
const firstOfMonth = (key) => key.slice(0, 8) + "01";

export function calendar(selected, pick) {
  const today = dateKey();
  let month = firstOfMonth(selected);
  const root = h("div", { class: "calendar" });
  const step = (by) => {
    const d = parseKey(month);
    d.setMonth(d.getMonth() + by);
    month = dateKey(d);
    draw();
    const control = by > 0 && root.querySelector(".cal-next:not(:disabled)") || root.querySelector(".cal-prev");
    control.focus({ preventScroll: true });
  };
  const moveFocus = (key) => {
    if (key > today) return;
    if (firstOfMonth(key) !== month) {
      month = firstOfMonth(key);
      draw(key);
    } else {
      root.querySelector('.cal-day[tabindex="0"]')?.setAttribute("tabindex", "-1");
    }
    const cell = root.querySelector(`[data-date="${key}"]`);
    cell.tabIndex = 0;
    cell.focus({ preventScroll: true });
  };
  const draw = (focusDay = firstOfMonth(selected) === month ? selected : month) => {
    const next = parseKey(month);
    next.setMonth(next.getMonth() + 1);
    const firstCell = addDays(month, -weekday(month));
    const lastDay = addDays(dateKey(next), -1);
    const lastCell = addDays(lastDay, 6 - weekday(lastDay));
    const cells = [];
    for (let k = firstCell; k <= lastCell; k = addDays(k, 1)) {
      const number = String(parseKey(k).getDate());
      if (k < month || k > lastDay) {
        cells.push(h("span", { class: "cal-out", "aria-hidden": "true" }));
        continue;
      }
      const activity = Boolean(state.checks[k]?.length || Object.keys(state.amounts[k] || {}).length || state.body.some((b) => b.date === k) || trainedOn(state, k));
      const when = k;
      cells.push(h("button", {
        type: "button", class: "cal-day" + (k === selected ? " selected" : "") + (activity ? " has-activity" : ""),
        disabled: k > today, "aria-current": k === today ? "date" : null, "aria-pressed": String(k === selected),
        "aria-label": longDate(k) + (activity ? ", con actividad" : ""), "data-date": k, tabindex: k === focusDay ? 0 : -1,
        onClick: () => pick(when),
        onKeydown: (e) => {
          const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday(when), End: 6 - weekday(when) }[e.key];
          if (delta == null) return;
          e.preventDefault();
          moveFocus(addDays(when, delta));
        },
      }, number));
    }
    root.replaceChildren(
      h("div", { class: "cal-heading" }, h("strong", { "aria-live": "polite" }, monthFormat.format(parseKey(month))),
        h("div", { class: "cal-controls" },
          h("button", { class: "icon-btn cal-prev", "aria-label": "Mes anterior", onClick: () => step(-1) }, icon("left", 16)),
          h("button", { class: "icon-btn cal-next", "aria-label": "Mes siguiente", disabled: month >= firstOfMonth(today), onClick: () => step(1) }, icon("right", 16)))),
      h("div", { class: "cal-grid", role: "group", "aria-label": "Días del mes" },
        ["L", "M", "X", "J", "V", "S", "D"].map((x) => h("span", { class: "cal-weekday", "aria-hidden": "true" }, x)), cells),
      h("div", { class: "cal-footer" }, h("span", { class: "activity-key" }, h("i"), "Con actividad"),
        h("button", { class: "text-action", onClick: () => pick(today) }, "Ir a hoy", icon("arrow", 14))),
    );
  };
  draw();
  return root;
}
