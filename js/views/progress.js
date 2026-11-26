import { h, fmt, num, toast, sheet, field, confirmSheet, dec } from "../ui.js";
import { state, dateKey, addDays, parseKey, setBody } from "../store.js";
import { calorieAdvice, rollingAverage, compliance, mean } from "../logic.js";
import { lineChart } from "../charts.js";
import * as health from "../health.js";

const shortDate = (k) => parseKey(k).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

function bodyChart(field, label, unit, minSpan) {
  const pts = state.body.filter((b) => b[field] != null).map((b) => ({ date: b.date, value: b[field] }));
  return h("figure", { class: "card" },
    h("figcaption", {}, h("h2", {}, label), h("span", { class: "legend" }, h("i", { class: "lg-dot" }), "día", h("i", { class: "lg-line" }), "media 7 días")),
    lineChart({ series: [{ points: pts, style: "dots" }, { points: rollingAverage(pts), style: "line", cls: "accent" }], label: `${label} (${unit})`, minSpan }),
  );
}

function editEntry(ctx, entry) {
  sheet(entry ? "Editar registro" : "Nuevo registro", (close) => {
    const d = h("input", { type: "date", value: entry?.date || dateKey(), max: dateKey(), required: true });
    const w = h("input", { type: "text", inputmode: "decimal", value: dec(entry?.weight), placeholder: "90,4" });
    const f = h("input", { type: "text", inputmode: "decimal", value: dec(entry?.fat), placeholder: "13,0" });
    return h("form", { onSubmit: (e) => {
      e.preventDefault();
      const wv = num(w.value);
      const fv = num(f.value);
      if ((w.value && wv == null) || (f.value && fv == null)) return toast("Escribe números, por ejemplo 90,4", "error");
      if (entry && entry.date !== d.value) setBody(entry.date, null, null);
      setBody(d.value, wv, fv);
      close();
      ctx.rerender();
    } },
      field("Fecha", d), field("Peso (kg)", w), field("Grasa (%)", f, "Déjalo vacío si ese día no lo mediste."),
      h("div", { class: "row end" },
        entry && h("button", { type: "button", class: "btn danger ghost", onClick: () => confirmSheet("Borrar registro", `Se borra el registro del ${shortDate(entry.date)}.`, "Borrar", () => { setBody(entry.date, null, null); close(); ctx.rerender(); }) }, "Borrar"),
        h("button", { type: "submit", class: "btn primary" }, "Guardar"),
      ),
    );
  });
}

export function renderProgress(ctx) {
  const today = dateKey();
  const a = calorieAdvice({ body: state.body, habits: state.habits, checks: state.checks, today });
  const comp14 = compliance(state.habits, state.checks, addDays(today, -14), addDays(today, -1));
  const pctText = (v) => (v == null ? "—" : `${Math.round(v * 100)} %`);
  const signed = (v, dec, unit) => (v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, dec)} ${unit}`);

  const adviceCard = h("section", { class: `card advice-card ${a.action}` },
    h("h2", {}, "Ajuste de calorías"),
    h("p", { class: "advice-title" }, a.title),
    h("p", {}, a.detail),
    h("dl", { class: "stats" },
      h("div", {}, h("dt", {}, "Media 7 días"), h("dd", {}, a.weightNow != null ? `${fmt(a.weightNow)} kg` : "—")),
      h("div", {}, h("dt", {}, "Cambio en 2 semanas"), h("dd", {}, signed(a.delta, 2, "kg"))),
      h("div", {}, h("dt", {}, "Grasa en 4 semanas"), h("dd", {}, signed(a.fatDelta, 1, "pts"))),
      h("div", {}, h("dt", {}, "Hábitos cumplidos (14 días)"), h("dd", {}, pctText(comp14))),
    ),
    h("p", { class: "hint" }, `Objetivo: +0,25 a +0,5 kg cada 2 semanas. Ahora comes ${state.plan.kcal.toLocaleString("es-ES")} kcal; cámbialo en Plan cuando apliques un ajuste.`),
  );

  const healthCharts = [];
  if (health.isConnected()) {
    const days = [];
    for (let k = addDays(today, -29); k <= today; k = addDays(k, 1)) days.push(k);
    const series = (f, conv = (v) => v) => days.filter((k) => state.health[k]?.[f] != null).map((k) => ({ date: k, value: conv(state.health[k][f]) }));
    const sleep = series("sleepMin", (v) => v / 60);
    const rhr = series("rhr");
    healthCharts.push(
      h("figure", { class: "card" },
        h("figcaption", {}, h("h2", {}, "Sueño (h)"), h("span", { class: "legend" }, `media ${fmt(mean(sleep.slice(-7).map((p) => p.value)))} h`)),
        lineChart({ series: [{ points: sleep, style: "line", cls: "accent" }], label: "Horas de sueño, últimos 30 días", minSpan: 2 }),
      ),
      h("figure", { class: "card" },
        h("figcaption", {}, h("h2", {}, "Pulso en reposo (lpm)")),
        lineChart({ series: [{ points: rhr, style: "line", cls: "accent" }], label: "Pulso en reposo, últimos 30 días", yFmt: (v) => v.toFixed(0), minSpan: 6 }),
      ),
    );
  }

  const entries = state.body.slice().reverse();
  return h("frag", {},
    h("header", { class: "page-head" }, h("h1", {}, "Progreso"), h("button", { class: "btn primary small", onClick: () => editEntry(ctx, null) }, "Añadir registro")),
    adviceCard,
    bodyChart("weight", "Peso (kg)", "kg", 1),
    bodyChart("fat", "Grasa (%)", "%", 1),
    healthCharts,
    h("section", { class: "card" },
      h("h2", {}, "Registros"),
      entries.length === 0
        ? h("p", { class: "muted" }, "Aún no hay pesajes. Pésate en ayunas 3–4 días por semana y apúntalo en Hoy.")
        : h("ul", { class: "entries" }, entries.slice(0, 60).map((b) => h("li", {},
            h("button", { class: "link-row", onClick: () => editEntry(ctx, b) },
              h("span", {}, shortDate(b.date)),
              h("span", {}, b.weight != null ? `${fmt(b.weight)} kg` : "—", h("span", { class: "muted" }, b.fat != null ? ` · ${fmt(b.fat)} %` : "")),
            )))),
    ),
  );
}
