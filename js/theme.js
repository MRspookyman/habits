// Tema claro u oscuro. La preferencia es del dispositivo (localStorage), no de los datos:
// index.html la aplica antes de pintar para que no haya destello.
const KEY = "habits.theme";
const COLORS = { light: "#f7f8f3", dark: "#0f1411" };
const system = matchMedia("(prefers-color-scheme: dark)");

export const getTheme = () => localStorage.getItem(KEY) || "auto";

export function applyTheme() {
  const pref = getTheme();
  const theme = pref === "dark" || (pref === "auto" && system.matches) ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLORS[theme]);
}

// pref: "auto" | "light" | "dark"
export function setTheme(pref) {
  if (pref === "auto") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme();
}

system.addEventListener("change", applyTheme);
