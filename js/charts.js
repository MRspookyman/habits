// Gráfica de líneas en SVG, sin librerías. Eje X por fecha (YYYY-MM-DD).
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const dayNum = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000;
const short = (k) => `${+k.slice(8, 10)}/${+k.slice(5, 7)}`;

// series: [{ points: [{date, value}], style: "dots" | "line", cls }]
export function lineChart({ series, label, yFmt = (v) => v.toFixed(1), height = 180, minSpan = 1 }) {
  const all = series.flatMap((x) => x.points).filter((p) => p.value != null);
  const W = 340;
  const H = height;
  const pad = { l: 40, r: 10, t: 12, b: 24 };
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": label });
  if (all.length < 2) {
    const t = s("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart-empty" });
    t.textContent = "Hacen falta al menos 2 registros";
    svg.append(t);
    return svg;
  }
  const xs = all.map((p) => dayNum(p.date));
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  if (x1 === x0) x1 = x0 + 1;
  let y0 = Math.min(...all.map((p) => p.value));
  let y1 = Math.max(...all.map((p) => p.value));
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
    const y = Y(v);
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "chart-grid" }));
    const t = s("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", class: "chart-axis" });
    t.textContent = yFmt(v);
    svg.append(t);
  }
  const first = all.reduce((a, b) => (a.date < b.date ? a : b)).date;
  const last = all.reduce((a, b) => (a.date > b.date ? a : b)).date;
  for (const [k, anchor] of [[first, "start"], [last, "end"]]) {
    const t = s("text", { x: X(k), y: H - 6, "text-anchor": anchor, class: "chart-axis" });
    t.textContent = short(k);
    svg.append(t);
  }

  for (const ser of series) {
    const pts = ser.points.filter((p) => p.value != null).sort((a, b) => a.date.localeCompare(b.date));
    if (ser.style === "line" && pts.length > 1) {
      svg.append(s("polyline", { points: pts.map((p) => `${X(p.date)},${Y(p.value)}`).join(" "), class: `chart-line ${ser.cls || ""}` }));
    } else {
      for (const p of pts) svg.append(s("circle", { cx: X(p.date), cy: Y(p.value), r: 2.6, class: `chart-dot ${ser.cls || ""}` }));
    }
  }
  return svg;
}
