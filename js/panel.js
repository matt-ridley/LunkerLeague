/* Computers: the side panel on the right, with three tabs: Up next (the Fish Finder cards, stacked), Chat (the
   league chat, open beside any page) and Alerts (what the bell holds). 1280px and wider it sits beside the page;
   1024-1279px it slides out as a drawer from a button in the header. Phones and tablets never see it.
   The tab and whether it's hidden are remembered in this browser. */
import { $, el, fill } from "./ui.js";
import { store, memberName, uid } from "./cloud.js";
import { rankInput } from "./leaders.js";
import { fishFinderCards } from "./fishfinder.js";
import { renderChat, chatUnread } from "./social.js";
import { renderAlerts, bellCount } from "./alerts.js";

const WIDE = matchMedia("(min-width: 1024px)"), DOCK = matchMedia("(min-width: 1280px)");
const TAB_KEY = "lunker-panel-tab", HIDDEN_KEY = "lunker-panel-hidden";
const TABS = [["next", "Up next"], ["chat", "Chat"], ["alerts", "Alerts"]];
const getTab = () => { try { const t = localStorage.getItem(TAB_KEY); return TABS.some(x => x[0] === t) ? t : "next"; } catch { return "next"; } };
const docHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === "1"; } catch { return false; } };
const save = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };

let redraw = () => {};
let drawerOpen = false; // the drawer always starts closed
let shown = "";         // the tab on screen when last drawn
let bodies = null;      // one body per tab, built once, so the chat box keeps what's typed

/* Hooked up once at boot: `onChange` redraws the app (header, panel). */
export function initPanel(onChange) {
  redraw = onChange;
  const again = () => { drawerOpen = false; redraw(); };
  WIDE.addEventListener("change", again);
  DOCK.addEventListener("change", again);
  window.addEventListener("hashchange", () => { drawerOpen = false; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && drawerOpen && !document.querySelector(".sheet:not([hidden])")) { drawerOpen = false; redraw(); } });
}

const panelShown = inApp => inApp && WIDE.matches && (DOCK.matches ? !docHidden() : drawerOpen);

function open() { if (DOCK.matches) save(HIDDEN_KEY, null); else drawerOpen = true; redraw(); }
function close() { if (DOCK.matches) save(HIDDEN_KEY, "1"); else drawerOpen = false; redraw(); }

/* The header button that brings the panel back, when it's out of sight. A dot means new chat or alerts. */
export function panelButton(inApp) {
  if (!inApp || !WIDE.matches || panelShown(inApp)) return null;
  const news = chatUnread() + bellCount();
  return el("button", { class: "icon-btn panel-btn", type: "button", onclick: open,
    "aria-label": news ? "Show the side panel, new messages or alerts" : "Show the side panel", html: PANEL_ICON },
    news ? el("i", { class: "panel-dot", "aria-hidden": "true" }) : null);
}

export function renderPanel(inApp) {
  const panel = $("panel"), on = panelShown(inApp);
  document.body.classList.toggle("panel-docked", on && DOCK.matches);
  document.body.classList.toggle("drawer-open", on && !DOCK.matches);
  panel.hidden = !on;
  if (!on) { shown = ""; return; }
  if (!bodies) build(panel);
  const tab = getTab();
  for (const b of panel.querySelectorAll(".panel-tab")) {
    const t = b.dataset.tab, sel = t === tab;
    b.setAttribute("aria-selected", String(sel));
    const n = sel ? 0 : t === "chat" ? chatUnread() : t === "alerts" ? bellCount() : 0;
    b.querySelector(".panel-count").textContent = n ? (n > 9 ? "9+" : String(n)) : "";
  }
  for (const [t, body] of Object.entries(bodies)) body.hidden = t !== tab;
  // Opening Alerts afresh starts its screen over, so what's new is worked out from that moment (like opening the bell).
  if (tab === "alerts" && shown !== "alerts") bodies.alerts.replaceChildren();
  const opening = tab !== shown;
  shown = tab;
  if (tab === "next") fill(bodies.next, ...upNext());
  else if (tab === "chat") {
    renderChat(bodies.chat, null, bodies.chat);
    if (opening) requestAnimationFrame(() => { bodies.chat.scrollTop = bodies.chat.scrollHeight; });
  } else renderAlerts(bodies.alerts);
}

function build(panel) {
  bodies = Object.fromEntries(TABS.map(([t, label]) => [t, el("div", { class: "panel-body", role: "tabpanel", id: `panel-${t}`, "aria-label": label })]));
  const tabs = el("div", { class: "panel-tabs", role: "tablist", "aria-label": "Side panel" },
    ...TABS.map(([t, label]) => el("button", { class: "panel-tab", type: "button", role: "tab", "data-tab": t, "aria-controls": `panel-${t}`,
      onclick: () => { save(TAB_KEY, t); redraw(); } },
      el("span", { text: label }), el("b", { class: "panel-count" }))),
    el("button", { class: "panel-close", type: "button", "aria-label": "Hide the side panel", text: "×", onclick: close }));
  fill(panel, tabs, ...Object.values(bodies));
}

/* ---------- Up next: the Fish Finder cards, one under the other ---------- */
let cache = { key: null, cards: [] };
function upNext() {
  if (!store.catchesLoaded) return [el("p", { class: "loading", text: "Loading…" })];
  // Worked out again when league data changes, and once a minute for the countdowns.
  const key = [store.catches, store.derbies, store.entrants, store.scoring, store.members, store.trips, store.rsvps,
    store.challenges, store.bets, store.goals, store.skunks, store.seasons, Math.floor(Date.now() / 60000)];
  if (!cache.key || key.some((k, i) => k !== cache.key[i])) cache = { key, cards: fishFinderCards({ ...rankInput(), name: memberName }, uid()) };
  const cards = cache.cards;
  if (!cards.length) return [el("p", { class: "muted small", text: "Nothing to show yet." })];
  return [el("span", { class: "eyebrow panel-label", text: "Fish Finder" }),
    ...cards.map(c => el("a", { class: `pn-card pn-${c.kind}`, href: c.href,
      onclick: c.crowns ? () => { try { sessionStorage.setItem("lunker-leaders-tab", "crowns"); } catch {} } : null },
      el("span", { class: "pn-label", text: c.label }),
      el("b", { class: "pn-title", text: c.title }),
      c.detail ? el("span", { class: "pn-detail", text: c.detail }) : null))];
}

const PANEL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/></svg>';
