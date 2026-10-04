/* Day / Dusk / Auto. Auto leaves the choice to the phone's light or dark setting. Stored per phone. */
const KEY = "lunker-theme";

export function getTheme() {
  try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; }
}
export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch {}
  applyTheme();
}
export function applyTheme() {
  const t = getTheme();
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const dusk = t === "dusk" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dusk ? "#0D1B2A" : "#0B4F5C");
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
