/* Boot, routing, header and bottom navigation. */
import { VERSION } from "./config.js";
import { $, el, avatar, icon, initToast, closeSheet, sheetOpen, toast, fill } from "./ui.js";
import { cloud, store, subscribe, gate, syncStatus, initCloud, uid } from "./cloud.js";
import { renderGate } from "./gate.js";
import { renderProfile } from "./profile.js";
import { renderAdmin } from "./admin.js";
import { renderFeed, renderCatch, renderLog, maybeShowRejected } from "./catches.js";
import { renderLeaders } from "./leaders.js";
import { applyTheme } from "./theme.js";

/* Each route renders into <main>. `live` routes re-render when league data changes; forms don't, so typing isn't lost. */
const ROUTES = {
  feed: { tab: "feed", live: true, render: renderFeed },
  leaders: { tab: "leaders", live: true, render: renderLeaders },
  log: { tab: "log", live: false, render: renderLog },
  c: { tab: null, live: true, render: renderCatch },
  derbies: { tab: "derbies", live: true, render: main => soon(main, "Derbies", "Set up fishing derbies with live leaderboards. Coming soon.") },
  chat: { tab: "chat", live: true, render: main => soon(main, "Chat", "League chat, comments and emoji reactions are coming soon.") },
  me: { tab: null, live: true, render: main => renderProfile(main) },
  u: { tab: null, live: true, render: (main, id) => renderProfile(main, id) },
  admin: { tab: null, live: true, render: renderAdmin },
};

function parseRoute() {
  const [name, arg, arg2] = location.hash.replace(/^#\/?/, "").split("/");
  return ROUTES[name] ? { name, arg, arg2, ...ROUTES[name] } : { name: "feed", ...ROUTES.feed };
}

let lastKey = "";
function render(force = false) {
  const g = gate(), main = $("main"), r = parseRoute();
  const inApp = g === "in";
  document.body.classList.toggle("gated", !inApp);
  renderHeader(inApp);
  renderNav(inApp, r.tab);
  const key = inApp ? `in:${r.name}:${r.arg || ""}:${r.arg2 || ""}` : `gate:${g}`;
  if (!force && key === lastKey && !(inApp && r.live)) return;
  const changed = key !== lastKey;
  lastKey = key;
  if (inApp) r.render(main, r.arg, r.arg2); else renderGate(main);
  if (changed) window.scrollTo(0, 0);
  if (inApp && !sheetOpen()) maybeShowRejected();
}

function renderHeader(inApp) {
  const head = $("top");
  head.hidden = !inApp;
  if (!inApp) return;
  const s = syncStatus(), r = parseRoute();
  const sub = r.tab ? null : el("a", { class: "icon-btn", href: "#/feed", "aria-label": "Back", html: icon.back });
  fill(head, 
    sub || el("span", { class: "brand-mark", html: icon.fish }),
    el("div", { class: "brand" },
      el("div", { class: "brand-name", text: (store.league && store.league.name) || "Lunker League" })),
    el("span", { class: `sync ${s.kind}`, role: "status", text: s.label }),
    el("a", { class: "me-btn", href: "#/me", "aria-label": "Your profile" }, avatar({ ...store.me, id: uid() }, "sm")));
}

function renderNav(inApp, active) {
  const nav = $("nav");
  nav.hidden = !inApp;
  if (!inApp) return;
  const item = (tab, label, svg, cls = "") => el("a", { class: "nav-item " + cls, href: `#/${tab}`,
    "aria-current": active === tab ? "page" : null, html: svg }, el("span", { text: label }));
  fill(nav, 
    item("feed", "Feed", icon.feed),
    item("leaders", "Leaders", icon.trophy),
    item("log", "Log", icon.plus, "log"),
    item("derbies", "Derbies", icon.flag),
    item("chat", "Chat", icon.chat));
}

function soon(main, title, text) {
  fill(main, el("h2", { class: "page-title", text: title }),
    el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.fish }), el("p", { text })));
}

/* ---------- Service worker: lets the app open with no signal ---------- */
function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(e => console.warn("Service worker failed", e));
  // A new version took over while the app was open: offer a reload rather than swapping it mid-entry.
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (had) toast("A new version is ready.", { label: "Update", run: () => location.reload(), sticky: true });
    had = true;
  });
}

/* ---------- Boot ---------- */
applyTheme();
initToast();
$("scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape" && sheetOpen()) closeSheet(); });
window.addEventListener("hashchange", () => { closeSheet(); render(true); });
subscribe(() => render());
// Ask the phone not to clear saved data (catches waiting for signal live there) when storage runs low.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
registerWorker();
render(true);
initCloud();
document.documentElement.dataset.version = VERSION;

// Handy when testing locally: window.__ll in the console.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__ll = { cloud, store, render };
