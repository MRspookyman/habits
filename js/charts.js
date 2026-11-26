// Gráficas en SVG, sin librerías. Fechas en formato YYYY-MM-DD.
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const text = (attrs, content) => {
  const t = s("text", attrs);
  t.textContent = content;
  return t;
};
const dayNum = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000;
const short = (k) => `${+k.slice(8, 10)}/${+k.slice(5, 7)}`;
const addDays = (k, n) => {
  const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
};
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function empty(svg, W, H, msg) {
  svg.append(text({ x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart-empty" }, msg));
  return svg;
}

// series: [{ points: [{date, value}], style: "dots" | "line", cls }]
// corridor: { from: {date, value}, to: date, min, max } → franja de objetivo (pendiente en unidades/semana)
export function lineChart({ series, label, yFmt = (v) => v.toFixed(1), height = 180, minSpan = 1, corridor, emptyText = "Hacen falta al menos 2 registros" }) {
  const W = 340;
  const H = height;
  const pad = { l: 40, r: 10, t: 12, b: 24 };
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": label });
  const all = series.flatMap((x) => x.points).filter((p) => p.value != null);
  if (all.length < 2) return empty(svg, W, H, emptyText);

  const corr = corridor && [
    { date: corridor.from.date, lo: corridor.from.value, hi: corridor.from.value },
    { date: corridor.to, lo: corridor.from.value + ((dayNum(corridor.to) - dayNum(corridor.from.date)) / 7) * corridor.min, hi: corridor.from.value + ((dayNum(corridor.to) - dayNum(corridor.from.date)) / 7) * corridor.max },
  ];
  const ys = all.map((p) => p.value).concat(corr ? corr.flatMap((c) => [c.lo, c.hi]) : []);
  const xs = all.map((p) => dayNum(p.date)).concat(corr ? corr.map((c) => dayNum(c.date)) : []);
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  if (x1 === x0) x1 = x0 + 1;
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y1 - y0 < minSpan) {
    const mid = (y0 + y1) / 2;
    y0 = mid - minSpan / 2;
    y1 = mid + minSpan / 2;
  }
  const m = (y1 - y0) * 0.1;
  y0 -= m;
  y1 += m;
  const X = (k) => pad.l + ((dayNum(k) - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);

  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3;
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: "chart-grid" }));
    svg.append(text({ x: pad.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "chart-axis" }, yFmt(v)));
  }
  const firstDate = all.reduce((a, b) => (a.date < b.date ? a : b)).date;
  const lastDate = all.reduce((a, b) => (a.date > b.date ? a : b)).date;
  svg.append(text({ x: X(firstDate), y: H - 6, "text-anchor": "start", class: "chart-axis" }, short(firstDate)));
  svg.append(text({ x: X(lastDate), y: H - 6, "text-anchor": "end", class: "chart-axis" }, short(lastDate)));

  if (corr) {
    const pts = [`${X(corr[0].date)},${Y(corr[0].lo)}`, `${X(corr[1].date)},${Y(corr[1].lo)}`, `${X(corr[1].date)},${Y(corr[1].hi)}`];
    svg.append(s("polygon", { points: pts.join(" "), class: "chart-corridor" }));
  }

  for (const ser of series) {
    const pts = ser.points.filter((p) => p.value != null).sort((a, b) => a.date.localeCompare(b.date));
    if (ser.style === "line" && pts.length > 1) {
      svg.append(s("polyline", { points: pts.map((p) => `${X(p.date)},${Y(p.value)}`).join(" "), class: `chart-line ${ser.cls || ""}` }));
    } else {
      for (const p of pts) svg.append(s("circle", { cx: X(p.date), cy: Y(p.value), r: ser.r || 2.6, class: `chart-dot ${ser.cls || ""}` }));
    }
  }
  return svg;
}

// Barras verticales. bars: [{ label, values: [n, …] }] (apiladas). band: { min, max } franja horizontal.
export function barChart({ bars, label, yFmt = (v) => String(Math.round(v)), height = 160, band, classes = ["bar-a", "bar-b"] }) {
  const W = 340;
  const H = height;
  const pad = { l: 36, r: 6, t: 10, b: 22 };
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": label });
  const totals = bars.map((b) => b.values.reduce((a, v) => a + v, 0));
  const max = Math.max(...totals, band?.max || 0);
  if (!(max > 0)) return empty(svg, W, H, "Aún no hay datos");
  const top = max * 1.1;
  const Y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  for (let i = 0; i <= 2; i++) {
    const v = (top * i) / 2;
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: "chart-grid" }));
    svg.append(text({ x: pad.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "chart-axis" }, yFmt(v)));
  }
  if (band) svg.append(s("rect", { x: pad.l, width: W - pad.l - pad.r, y: Y(band.max), height: Y(band.min) - Y(band.max), class: "chart-corridor" }));
  const slot = (W - pad.l - pad.r) / bars.length;
  const bw = Math.max(4, slot * 0.62);
  bars.forEach((b, i) => {
    let acc = 0;
    const x = pad.l + i * slot + (slot - bw) / 2;
    b.values.forEach((v, j) => {
      if (v <= 0) return;
      svg.append(s("rect", { x, width: bw, y: Y(acc + v), height: Y(acc) - Y(acc + v), rx: 2, class: classes[j] || "bar-a" }));
      acc += v;
    });
    if (b.label && (bars.length <= 8 || (bars.length - 1 - i) % 2 === 0)) {
      svg.append(text({ x: x + bw / 2, y: H - 6, "text-anchor": "middle", class: "chart-axis" }, b.label));
    }
  });
  return svg;
}

// Mapa tipo GitHub: columnas = semanas (lunes arriba), filas = días.
// levelOf(k) → 0..5 o null (sin datos); markOf(k) → bool (punto de entreno/deporte).
export function heatmap({ today, weeks = 26, levelOf, markOf, onPick, label }) {
  const cell = 11;
  const gap = 2;
  const left = 16;
  const topPad = 14;
  const W = left + weeks * (cell + gap);
  const H = topPad + 7 * (cell + gap);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "heatmap", role: "group", "aria-label": label });
  const todayWd = (new Date(today + "T12:00:00").getDay() + 6) % 7;
  const start = addDays(today, -todayWd - (weeks - 1) * 7);
  ["L", "X", "V"].forEach((l, i) => svg.append(text({ x: 0, y: topPad + (i * 2) * (cell + gap) + cell - 2, class: "hm-label" }, l)));
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const colStart = addDays(start, w * 7);
    const month = +colStart.slice(5, 7) - 1;
    if (month !== lastMonth && +colStart.slice(8, 10) <= 7) {
      svg.append(text({ x: left + w * (cell + gap), y: 9, class: "hm-label" }, MONTHS[month]));
      lastMonth = month;
    }
    for (let d = 0; d < 7; d++) {
      const k = addDays(colStart, d);
      if (k > today) continue;
      const x = left + w * (cell + gap);
      const y = topPad + d * (cell + gap);
      const lvl = levelOf(k);
      const r = s("rect", { x, y, width: cell, height: cell, rx: 2.5, class: `hm-cell l${lvl ?? "x"}${k === today ? " today" : ""}`, "data-date": k });
      const title = s("title");
      title.textContent = k;
      r.append(title);
      if (onPick) r.addEventListener("click", () => onPick(k));
      svg.append(r);
      if (markOf?.(k)) svg.append(s("circle", { cx: x + cell / 2, cy: y + cell / 2, r: 1.8, class: "hm-mark", "pointer-events": "none" }));
    }
  }
  return svg;
}

// Nivel 0..5 a partir de un porcentaje (null = sin hábitos ese día).
export const levelFromPct = (pct) => (pct == null ? null : pct <= 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.8 ? 3 : pct < 1 ? 4 : 5);
