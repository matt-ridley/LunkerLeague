/* The Dock (#/dock): the way in to the league's people, gear and water. Also its own pages: the anglers list
   (#/anglers) and everyone's tackle boxes (#/tackle). Boats, the Fish Tank, the map and stats have their own pages. */
import { el, fill, field, avatar, fmtDay, fmtWeight, fmtLength } from "./ui.js";
import { store, uid } from "./cloud.js";
import { luckyLure } from "./tacklebox.js";
import { itemThumb } from "./tackleboxpage.js";
import { anglerRoster, sortRoster, rosterPlaces, tackleBoxes, ANGLER_SORTS } from "./dock.js";
import { rankInput, crownSeasonsNow } from "./leaders.js";
import { seasonTables, seasonOf, seasonName } from "./season.js";

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const active = () => [...store.members.values()].filter(m => !m.suspended);
// The map opens on whichever view it last showed; the Dock's tile always opens the league's.
const mapView = view => () => { try { sessionStorage.setItem("lunker-map-view", view); } catch {} };

export function renderDock(main) {
  const boats = [...store.fleet.values()].filter(b => !b.retired).length;
  const items = [...store.box.values()].filter(i => !i.retired).length;
  const catches = store.catchesLoaded ? store.catches.size : 0;
  const tile = (href, emoji, title, sub, onclick = null) => el("a", { class: "dock-tile", href, onclick },
    el("span", { class: "dock-icon", "aria-hidden": "true", text: emoji }),
    el("b", { text: title }), el("span", { class: "muted small", text: sub }));
  fill(main,
    el("h2", { class: "page-title", text: "The Dock" }),
    el("h3", { class: "dock-head", text: "People and gear" }),
    el("div", { class: "dock-grid" },
      tile("#/anglers", "👥", "Anglers", plural(active().length, "angler")),
      tile("#/boats", "🚤", "Boats", boats ? plural(boats, "boat") : "Add yours"),
      tile("#/tackle", "🧰", "Tackle boxes", items ? `${plural(items, "item")} of tackle` : "Fill yours")),
    el("h3", { class: "dock-head", text: "On the water" }),
    el("div", { class: "dock-grid" },
      tile("#/tank", "🐠", "Fish Tank", catches ? plural(catches, "catch", "catches") : "Every catch, your way"),
      tile("#/map", "🗺️", "Map", "The league's shared spots", mapView("league"))),
    el("h3", { class: "dock-head", text: "You" }),
    el("div", { class: "dock-grid" },
      tile(`#/stats/${uid()}`, "📊", "Your stats", "What's working for you")));
}

// The anglers list's period and sort, remembered for this visit.
const ANGLERS_KEY = "lunker-anglers";
let anglersView = { period: "season", sort: "fish" };
// Same chevron as the Fish Finder's fold button; turned over when open.
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const opened = new Set(); // anglers whose stats are showing (all folded when the app opens)
try { anglersView = { ...anglersView, ...JSON.parse(sessionStorage.getItem(ANGLERS_KEY) || "{}") }; } catch {}

/* Points, place, crowns and badges per angler for the period: this season's, or every season's added up. */
function rankExtras(period, year) {
  const input = rankInput(), tables = seasonTables(input), out = new Map();
  const rows = period === "career" ? tables.career : tables.years.get(year) || [];
  rows.forEach((r, i) => out.set(r.uid, { points: r.points, place: i + 1, crowns: 0, badges: 0 }));
  const bump = (u, k) => { if (u && out.has(u)) out.get(u)[k]++; };
  for (const [y, crowns] of crownSeasonsNow(input)) if (period === "career" || y === year) for (const s of crowns) bump(s.holder, "crowns");
  for (const b of input.badges || []) if (period === "career" || b.season == null || b.season === year) bump(b.uid, "badges");
  return out;
}

const UNITS = { fish: ["fish", "fish"], species: ["species", "species"], pbs: ["PB", "PBs"], records: ["record", "records"],
  daysOut: ["day out", "days out"], crowns: ["crown", "crowns"], badges: ["badge", "badges"] };
/* The number on the right of a row, for the sort picked. */
function sortValue(r, sort) {
  if (sort === "points") return r.place ? [String(r.points), `pts · #${r.place}`] : ["0", "pts"];
  if (sort === "biggest") return r.biggest ? [fmtWeight(r.biggest), "heaviest"] : ["–", "heaviest"];
  if (sort === "longest") return r.longest ? [fmtLength(r.longest), "longest"] : ["–", "longest"];
  if (sort === "lastAt") return r.lastAt ? [fmtDay(r.lastAt), "last fish"] : ["–", "last fish"];
  const key = UNITS[sort] ? sort : "fish", [one, many] = UNITS[key];
  return [String(r[key]), r[key] === 1 ? one : many];
}

export function renderAnglers(main) {
  if (!store.catchesLoaded) return fill(main, el("h2", { class: "page-title", text: "👥 Anglers" }), el("p", { class: "loading", text: "Loading…" }));
  const me = uid(), year = seasonOf(Date.now()), { period, sort } = anglersView;
  const setV = changes => {
    anglersView = { ...anglersView, ...changes };
    try { sessionStorage.setItem(ANGLERS_KEY, JSON.stringify(anglersView)); } catch {}
    renderAnglers(main);
  };
  const list = sortRoster(anglerRoster({ members: active(), catches: [...store.catches.values()], period, year, extra: rankExtras(period, year) }), sort);
  const places = rosterPlaces(list, sort);
  const sel = el("select", { "aria-label": "Sort anglers", onchange: () => setV({ sort: sel.value }) },
    ...ANGLER_SORTS.map(([k, t]) => el("option", { value: k, text: t })));
  sel.value = sort;
  // Every number as a small chip (bold number, then what it is); the one sorted on is highlighted.
  const stat = (key, n, text) => el("span", { class: "angler-stat" + (key === sort ? " on" : "") }, el("b", { text: n }), " " + text);
  const stats = r => el("div", { class: "angler-stats" },
    stat("fish", String(r.fish), "fish"), stat("species", String(r.species), "species"),
    stat("pbs", String(r.pbs), r.pbs === 1 ? "PB" : "PBs"), stat("records", String(r.records), r.records === 1 ? "record" : "records"),
    r.biggest ? stat("biggest", fmtWeight(r.biggest), "heaviest") : null, r.longest ? stat("longest", fmtLength(r.longest), "longest") : null,
    stat("daysOut", String(r.daysOut), r.daysOut === 1 ? "day out" : "days out"),
    r.place ? stat("points", `#${r.place}`, `${r.points} pts`) : null,
    r.crowns ? stat("crowns", `👑 ${r.crowns}`, r.crowns === 1 ? "crown" : "crowns") : null,
    r.badges ? stat("badges", `🏅 ${r.badges}`, r.badges === 1 ? "badge" : "badges") : null);
  fill(main,
    el("h2", { class: "page-title", text: "👥 Anglers" }),
    el("div", { class: "stack-tight" },
      el("div", { class: "seg" }, ...[["season", seasonName(year)], ["career", "Career"]].map(([k, t]) =>
        el("button", { type: "button", "aria-pressed": String(period === k), text: t, onclick: () => setV({ period: k }) }))),
      field("Sort", sel),
      el("p", { class: "hint", text: period === "career"
        ? "Every league catch. Records are league records (the best league fish ever); PBs include logbook catches."
        : "League catches this season (from the league start). Records are this season's; PBs are the ones caught this season." })),
    el("div", { class: "card-list" }, ...list.map((r, i) => {
      const [n, label] = sortValue(r, sort), id = r.member.id, open = opened.has(id), place = places[i];
      const toggle = el("button", { type: "button", class: "angler-more", "aria-expanded": String(open),
        "aria-label": `${open ? "Hide" : "Show"} ${r.member.displayName}'s stats`, html: CHEVRON,
        onclick: () => { open ? opened.delete(id) : opened.add(id); renderAnglers(main); } });
      return el("div", { class: "list-row angler-row" + (id === me ? " me" : "") },
        el("div", { class: "angler-top" },
          el("span", { class: "angler-place", text: place == null ? "–" : String(place) }),
          el("a", { class: "angler-link grow", href: `#/u/${id}` },
            avatar(id === me ? { ...r.member, ...store.me } : r.member),
            el("div", { class: "grow stack-tight" },
              el("b", { text: id === me ? `${r.member.displayName} (you)` : r.member.displayName }),
              el("span", { class: "muted small", text: r.lastAt ? `Last fish ${fmtDay(r.lastAt)}` : "No fish yet" })),
            el("span", { class: "list-row-n" + (n.length > 4 ? " long" : "") }, el("b", { text: n }), el("small", { text: label }))),
          toggle),
        open ? stats(r) : null);
    })));
}

export function renderTackleBoxes(main) {
  const me = uid();
  fill(main,
    el("h2", { class: "page-title", text: "🧰 Tackle boxes" }),
    el("div", { class: "card-list" }, ...tackleBoxes({ members: active(), items: store.box, me }).map(({ member: m, items }) => {
      const lucky = items ? luckyLure(m.id, m.luckyLure, store.box, store.catches, store.tackle) : null;
      return el("a", { class: "list-row" + (m.id === me ? " me" : ""), href: `#/box/${m.id}` },
        avatar(m.id === me ? { ...m, ...store.me } : m),
        el("div", { class: "grow stack-tight" },
          el("b", { text: m.id === me ? "Your tackle box" : `${m.displayName}'s tackle box` }),
          lucky ? el("span", { class: "small lucky-line" }, "🍀 ", itemThumb(lucky.item, "box-thumb tiny"), lucky.item.name)
            : el("span", { class: "muted small", text: items ? "No lucky lure yet" : "Empty" })),
        el("span", { class: "list-row-n" }, el("b", { text: String(items) }), el("small", { text: items === 1 ? "item" : "items" })));
    })));
}
