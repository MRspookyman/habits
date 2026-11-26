// Genera css/dark.css a partir de css/app.css: cada color fijo se pasa a OKLCH y se invierte su
// luminosidad (los fondos claros quedan oscuros y el texto oscuro queda claro), con el mismo tono.
// Las sombras pasan a negro. Lo que va sobre ilustraciones se ajusta a mano al final (MANUAL).
// Uso: node tools/dark-theme.mjs   (vuelve a ejecutarlo cuando cambien colores en app.css)
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const css = readFileSync(new URL("css/app.css", root), "utf8");

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklch([r, g, b]) {
  [r, g, b] = [r, g, b].map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToRgb([L, C, H]) {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toSrgb);
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const hex2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");

// Muy claros (fondos) → oscuros junto a la superficie; el resto, invertido hasta el texto claro.
const mapL = (L) => (L >= 0.9 ? 0.205 + (1 - L) * 1.2 : Math.min(0.96, 0.325 + (0.9 - L) * 1.009));

function parse(lit) {
  if (lit === "white") return [255, 255, 255, 1];
  if (lit === "black") return [0, 0, 0, 1];
  let hex = lit.slice(1);
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
}
function invert(lit) {
  const [r, g, b, a] = parse(lit);
  let [L, C, H] = rgbToOklch([r, g, b]);
  L = mapL(L);
  C *= 0.9;
  let rgb = oklchToRgb([L, C, H]);
  while (!inGamut(rgb) && C > 0.001) {
    C *= 0.95;
    rgb = oklchToRgb([L, C, H]);
  }
  return "#" + rgb.map(hex2).join("") + (a < 1 ? hex2(a) : "");
}
const shadow = (lit) => "#000000" + hex2(Math.min(0.7, parse(lit)[3] * 2.2));

const COLOR = /#[0-9a-fA-F]{3,8}\b|\bwhite\b|\bblack\b/g;
// Se copian todas las declaraciones de color, también las que no llevan un color fijo
// (transparent, var(...)): el prefijo sube la especificidad y, si no, una regla oscura general
// pisaría a una clara más concreta que solo ponía, por ejemplo, `background: transparent`.
const COLOR_PROP = /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color)$/;
// Ilustraciones (cabecera de Mi día, tarjeta de entrenar) y discos: sus colores se copian tal cual
// (para que ninguna regla oscura general los pise) y lo que haga falta se ajusta a mano al final.
const KEEP = /hero|score-|training-feature|training-copy|feature-icon|plate|\.p\d/;
const SCOPE = ':root[data-theme="dark"]';
const prefix = (sel) => sel.split(",").map((s) => (s.trim() === ":root" || s.trim() === "html" ? SCOPE : `${SCOPE} ${s.trim()}`)).join(", ");

const out = [];
function walk(src, indent = "") {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const head = src.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let depth = 1;
    let j = open + 1;
    while (depth && j < src.length) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    i = j;
    if (head.startsWith("@font-face") || head.startsWith("@keyframes")) continue;
    if (head.startsWith("@media") || head.startsWith("@supports")) {
      const start = out.length;
      out.push(`${indent}${head} {`);
      walk(body, indent + "  ");
      if (out.length === start + 1) out.pop();
      else out.push(`${indent}}`);
      continue;
    }
    const keep = KEEP.test(head);
    const picked = [];
    for (const d of body.split(";").map((x) => x.trim()).filter(Boolean)) {
      const k = d.indexOf(":");
      const prop = d.slice(0, k).trim();
      if (/url\(/.test(d) || !(d.match(COLOR) || COLOR_PROP.test(prop))) continue;
      const value = d.slice(k + 1).trim();
      picked.push(`${prop}: ${keep ? value : value.replace(COLOR, /shadow/.test(prop) ? shadow : invert)}`);
    }
    if (head === ":root") picked.push("color-scheme: dark");
    if (picked.length) out.push(`${indent}${prefix(head)} { ${picked.join("; ")}; }`);
  }
}
walk(css);

const MANUAL = `
/* --- A mano --- */
/* Fondo más oscuro que las tarjetas, para que estas se vean por encima. */
${SCOPE} { --paper: #0f1411; --surface: #171d19; --line: #2a332d; --rule: #222a25; --wash: #1c2721; --sand: #252118; }
${SCOPE} #rail { background: #121814; }
/* El velo de las hojas oscurece, no aclara. */
${SCOPE} dialog.sheet::backdrop { background: #000000b8; }
/* Tarjeta de entrenar: la ilustración es clara, se oscurece con el degradado. */
${SCOPE} .training-feature { border-color: #3a3424; background-color: #221e14; }
${SCOPE} .training-feature::before { background: linear-gradient(90deg, #1d1a12f5 0%, #1d1a12e0 34%, #1d1a1288 62%, #1d1a1260 100%); }
${SCOPE} .feature-icon { color: #a9c3a2; }
${SCOPE} .training-copy p { color: #c9d6c2; }
`;

writeFileSync(new URL("css/dark.css", root),
  "/* Tema oscuro. Generado por tools/dark-theme.mjs a partir de app.css: no editar a mano, cambia el script. */\n" +
  out.join("\n") + "\n" + MANUAL);
console.log(`css/dark.css: ${out.length} reglas`);
