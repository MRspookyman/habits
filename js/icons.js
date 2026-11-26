// Pictogramas de la interfaz. Heredan el color y el tamaño de su control.
const paths = {
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  sunrise: "M2 17h20M5 21h14M7 17a5 5 0 0 1 10 0M12 3v4M3.8 8.8l2.4 2.4M20.2 8.8l-2.4 2.4",
  layers: "M12 3 2.5 8 12 13l9.5-5L12 3ZM3 12l9 5 9-5M3 16.5l9 5 9-5",
  gym: "M2 9.5h3v-3h3v4h8v-4h3v3h3v5h-3v3h-3v-4H8v4H5v-3H2zM5 9.5v5m14-5v5",
  chart: "M4 3v17h17M8 15l4-5 3 2 5-6",
  settings: "M10 3h4l.6 2.5 2.2 1.3 2.5-.7 2 3.5-1.9 1.8v2.5l1.9 1.8-2 3.5-2.5-.7-2.2 1.3-.6 2.2h-4l-.6-2.2-2.2-1.3-2.5.7-2-3.5 1.9-1.8v-2.5L2.7 9.6l2-3.5 2.5.7 2.2-1.3L10 3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2-3v6m10-6v6M3 10h18",
  plus: "M12 5v14M5 12h14", check: "m5 12 4.5 4.5L19 7", x: "m6 6 12 12M18 6 6 18",
  left: "m14 6-6 6 6 6", right: "m9 6 6 6-6 6", down: "m6 9 6 6 6-6", up: "m6 15 6-6 6 6",
  arrow: "M4 12h15m-6-6 6 6-6 6", back: "M20 12H5m6-6-6 6 6 6",
  flame: "M13 2c1 5-3 6.5-2 10 2-1 3-3 4-5 3 3 5 5.5 5 8.5a8 8 0 0 1-16 0c0-4.5 3-7.5 5.5-10-.2 3 0 4 1 5 1-3 3-5 2.5-8.5Z",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3.5 2",
  pill: "m9.1 4.7-5 5a6.3 6.3 0 0 0 8.9 8.9l5.1-5.1a6.3 6.3 0 1 0-9-8.8ZM7.3 6.5l9 9",
  fish: "M3 12c2.2-4.1 4.8-6 8-6s5.7 2.1 7 4l3-2v8l-3-2c-1.3 1.9-3.9 4-7 4s-5.8-1.9-8-6ZM8.7 10.5h.1",
  protein: "m7 3 1-1h8l1 1v2H7V3ZM6 5h12l1 3-2 12a2 2 0 0 1-2 1.5H9A2 2 0 0 1 7 20L5 8l1-3Zm.1 5.5h11.8",
  bowl: "M3 12h18a9 9 0 0 1-18 0Zm3.5 8.8h11M8 8c-.7-1.4 1.1-1.8.4-3.2M12.5 8c-.8-1.6 1.3-2.7.5-4.5M18 11.8l3-6",
  glass: "M5.5 7h13l-1.7 13h-9.6L5.5 7ZM6.5 11c3.5 2.5 6-2.5 11 0M13 7l1.5-5h4",
  leaf: "M4 19c-3-8 4-15 16-15 0 12-6 18-14 14M4 21c3-5 7-9 12-13",
  drop: "M12 2c-1.8 3.5-7 8.2-7 12a7 7 0 0 0 14 0c0-3.8-5.2-8.5-7-12ZM8.5 14.5a3.5 3.5 0 0 0 3.5 3.5",
  moon: "M20.6 14.7A8.9 8.9 0 0 1 9.4 3.4a9.1 9.1 0 1 0 11.2 11.3Z",
  scale: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 8a8 8 0 0 1 10 0l-3.5 4h-3L7 8Zm5.5 2.5L14 8",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  more: "M5 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  edit: "m14.5 5.5 4 4M4 20l4.8-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z",
  skip: "m5 5 10 7-10 7V5Zm14 0v14", undo: "M4 5v6h6M4 11a8 8 0 1 1 1.8 7.5",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2.8 7.5 2.8 7.5H3.2S6 14 6 9Zm3.5 10a3 3 0 0 0 5 0",
  drive: "M5 4h14l3 10v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4L5 4ZM2 14h20m-5 3h1",
  heart: "M20.8 4.8a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z",
  book: "M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h5V4Z",
  play: "m7 4 13 8-13 8V4Z", flag: "M5 21V4c5-3 9 3 15 0v10c-6 3-10-3-15 0",
  list: "M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1",
  folder: "M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
};

export function icon(name, size = 20) {
  const base = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(base, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  const path = document.createElementNS(base, "path");
  path.setAttribute("d", paths[name]);
  if (name === "gym") path.setAttribute("transform", "rotate(-32 12 12)");
  svg.append(path);
  return svg;
}
