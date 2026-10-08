/* Boot, routing, header and bottom navigation. */
import { VERSION } from "./config.js";
import { $, el, avatar, icon, initToast, closeSheet, sheetOpen, toast, fill } from "./ui.js";
import { cloud, store, subscribe, gate, syncStatus, initCloud, uid } from "./cloud.js";
import { renderGate } from "./gate.js";
import { renderProfile } from "./profile.js";
import { renderStats } from "./statspage.js";
import { renderMap } from "./mappage.js";
import { renderBite } from "./bitepage.js";
import { renderAdmin } from "./admin.js";
import { renderFeed, renderCatch, renderLog, maybeShowRejected } from "./catches.js";
import { renderLeaders } from "./leaders.js";
import { renderChat, chatUnread } from "./social.js";
import { renderDerbies, renderDerby, renderDerbyForm } from "./derbies.js";
import { renderSeries, renderSeriesForm } from "./seriespage.js";
import { renderScoring } from "./scoring.js";
import { renderTrip, renderTripForm } from "./trips.js";
import { renderChallenge, renderChallengeForm } from "./h2hpage.js";
import { renderBet, renderBetForm } from "./betspage.js";
import { renderAlerts, bellCount } from "./alerts.js";
import { applyTheme } from "./theme.js";
import * as cloudApi from "./cloud.js";
import { startWeather } from "./weather.js";

/* Each route renders into <main>. `live` routes re-render when league data changes; forms don't, so typing isn't lost. */
const ROUTES = {
  feed: { tab: "feed", live: true, render: renderFeed },
  leaders: { tab: "leaders", live: true, render: renderLeaders },
  log: { tab: "log", live: false, render: renderLog },
  c: { tab: null, live: true, render: renderCatch },
  derbies: { tab: "derbies", live: true, render: renderDerbies },
  d: { tab: "derbies", live: true, render: renderDerby },
  dnew: { tab: "derbies", live: false, render: main => renderDerbyForm(main) },
  dedit: { tab: "derbies", live: false, render: renderDerbyForm },
  dcopy: { tab: "derbies", live: false, render: (main, id) => renderDerbyForm(main, null, id) },
  dchat: { tab: "derbies", live: true, inPlace: true, render: renderChat },
  enter: { tab: "log", live: false, render: (main, derbyId) => renderLog(main, null, derbyId) },
  chat: { tab: "chat", live: true, inPlace: true, render: renderChat },
  me: { tab: null, live: true, render: main => renderProfile(main) },
  u: { tab: null, live: true, render: (main, id) => renderProfile(main, id) },
  stats: { tab: null, live: true, render: (main, id) => renderStats(main, id) },
  map: { tab: null, live: false, render: main => renderMap(main) },
  bite: { tab: null, live: true, render: main => renderBite(main) },
  admin: { tab: null, live: true, render: renderAdmin },
  scoring: { tab: "leaders", live: false, render: renderScoring },
  t: { tab: "derbies", live: true, render: renderTrip },
  tnew: { tab: "derbies", live: false, render: main => renderTripForm(main) },
  s: { tab: "derbies", live: true, render: renderSeries },
  snew: { tab: "derbies", live: false, render: main => renderSeriesForm(main) },
  sedit: { tab: "derbies", live: false, render: renderSeriesForm },
  tedit: { tab: "derbies", live: false, render: renderTripForm },
  h: { tab: "derbies", live: true, render: renderChallenge },
  hnew: { tab: "derbies", live: false, render: (main, who) => renderChallengeForm(main, who) },
  hcounter: { tab: "derbies", live: false, render: (main, id) => renderChallengeForm(main, null, id) },
  hrematch: { tab: "derbies", live: false, render: (main, id) => renderChallengeForm(main, null, null, id) },
  b: { tab: "derbies", live: true, render: renderBet },
  bnew: { tab: "derbies", live: false, render: main => renderBetForm(main) },
  bedit: { tab: "derbies", live: false, render: renderBetForm },
  alerts: { tab: null, live: true, render: renderAlerts },
};

function parseRoute() {
  const [name, arg, arg2] = location.hash.replace(/^#\/?/, "").split("/");
  return ROUTES[name] ? { name, arg, arg2, ...ROUTES[name] } : { name: "feed", ...ROUTES.feed };
}

/* Redraws wait while someone is typing in a box on the page, so a new reaction from a friend can't wipe a
   half-written comment. Screens that update in place (chat) are exempt. */
let pendingRender = false;
const typing = () => {
  const a = document.activeElement;
  return !!(a && $("main").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};
const flushPending = () => { if (pendingRender && !typing()) { pendingRender = false; render(); } };
document.addEventListener("focusout", () => setTimeout(flushPending, 0));
setInterval(flushPending, 2000); // backup: focus events don't always fire (e.g. when the app is in the background)
// Countdowns and "x min ago" times: refresh live screens once a minute.
setInterval(() => { if (!document.hidden && parseRoute().live && !parseRoute().inPlace) render(); }, 60000);

let lastKey = "";
function render(force = false) {
  const g = gate(), main = $("main"), r = parseRoute();
  const inApp = g === "in";
  document.body.classList.toggle("gated", !inApp);
  renderHeader(inApp);
  renderNav(inApp, r.tab);
  const key = inApp ? `in:${r.name}:${r.arg || ""}:${r.arg2 || ""}` : `gate:${g}`;
  if (!force && key === lastKey && !(inApp && r.live)) return;
  if (!force && key === lastKey && !r.inPlace && typing()) { pendingRender = true; return; }
  const changed = key !== lastKey;
  if (changed && r.inPlace) $("main").replaceChildren(); // start the in-place screen fresh
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
    bell(r.name === "alerts"),
    el("a", { class: "me-btn", href: "#/me", "aria-label": "Your profile" }, avatar({ ...store.me, id: uid() }, "sm")));
}

function bell(open) {
  const n = open ? 0 : bellCount();
  return el("a", { class: "icon-btn bell", href: "#/alerts", "aria-label": n ? `What's new, ${n} new` : "What's new", html: icon.bell },
    n ? el("b", { class: "nav-badge", text: n > 9 ? "9+" : String(n) }) : null);
}

function renderNav(inApp, active) {
  const nav = $("nav");
  nav.hidden = !inApp;
  if (!inApp) return;
  const item = (tab, label, svg, cls = "", badge = 0) => el("a", { class: "nav-item " + cls, href: `#/${tab}`,
    "aria-current": active === tab ? "page" : null, "aria-label": badge ? `${label}, ${badge} new` : null, html: svg },
    el("span", { text: label }), badge ? el("b", { class: "nav-badge", text: badge > 9 ? "9+" : String(badge) }) : null);
  fill(nav,
    item("feed", "Feed", icon.feed),
    item("leaders", "Leaders", icon.trophy),
    item("log", "Log", icon.plus, "log"),
    item("derbies", "Events", icon.flag),
    item("chat", "Chat", icon.chat, "", active === "chat" ? 0 : chatUnread()));
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
startWeather(cloudApi); // fills in weather on your catches when there's signal
// Ask the phone not to clear saved data (catches waiting for signal live there) when storage runs low.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
registerWorker();
render(true);
initCloud();
document.documentElement.dataset.version = VERSION;

// Handy when testing locally: window.__ll in the console.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__ll = { cloud, store, render };
