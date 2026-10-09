/* The Fish Tank (#/tank): every catch in the league as a photo wall (or the feed's cards), with filters and sorts of
   its own. fishtank.js does the filtering. */
import { el, fill, field, icon, openSheet, closeSheet, fmtWeight } from "./ui.js";
import { store, uid, memberName } from "./cloud.js";
import { catchCard, shownSize } from "./catches.js";
import { isPersonalBest, recordOf } from "./stats.js";

const REC_ICON = { past: "📜", league: "🏛️", season: "👑" };
const REC_TITLE = { past: "All-time record", league: "League record", season: "Season record" };
import { WHEN } from "./feedfilter.js";
import { NO_TANK, TANK_SHOW, RELEASED, TANK_SORT, tankActive, filterTank, tankStats, reactionCount, topReaction } from "./fishtank.js";
import { focusStyle } from "./thumbfocus.js";
import { browseFrom, returningTo, scrollBackTo } from "./browse.js";

// Filters last for the session (until the app is closed); grid or list is remembered on this phone.
const KEY = "lunker-tank-filters", VIEW = "lunker-tank-view", PAGE = 60;
let f = { ...NO_TANK }, limit = PAGE, redraw = () => {};
try { const v = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (v) f = { ...NO_TANK, ...v }; } catch {}
const setF = changes => { f = { ...f, ...changes }; limit = PAGE; try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch {} redraw(); };
const clearF = () => setF({ ...NO_TANK });
const view = () => { try { return localStorage.getItem(VIEW) === "list" ? "list" : "grid"; } catch { return "grid"; } };
const setView = v => { try { localStorage.setItem(VIEW, v); } catch {} redraw(); };

const label = (pairs, k) => (pairs.find(p => p[0] === k) || [k, k])[1];
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function renderTank(main) {
  const head = el("div", { class: "tank-head" }), tools = el("div", { class: "feed-tools" }), results = el("div", { class: "tank-results" });
  // Back from stepping through catches: show enough of the tank to scroll to the last one viewed.
  let ids = [], back = returningTo("tank");
  browseFrom(results, "tank", () => ids);
  redraw = () => {
    const n = tankActive(f), all = [...store.catches.values()], v = view();
    fill(head,
      el("h2", { class: "page-title grow", text: "🐠 Fish Tank" }),
      el("div", { class: "seg tank-view", role: "group", "aria-label": "Show as" },
        ...[["grid", "▦", "Photo grid"], ["list", "☰", "List"]].map(([k, t, aria]) =>
          el("button", { type: "button", "aria-pressed": String(v === k), "aria-label": aria, text: t, onclick: () => setView(k) }))),
      el("button", { class: "filter-btn", type: "button", "aria-pressed": String(n > 0), "aria-label": n ? `Filters, ${n} on` : "Filters",
        html: icon.filter, onclick: () => tankSheet(all) }, n ? el("b", { class: "nav-badge", text: String(n) }) : null));
    tools.hidden = !n;
    fill(tools, ...chips(), n > 1 ? el("button", { class: "chip removable clear", type: "button", text: "Clear all", onclick: clearF }) : null);
    if (!store.catchesLoaded) return fill(results, el("p", { class: "loading", text: "Loading catches…" }));
    const list = filterTank({ catches: all, f, reactions: store.reactions, comments: store.comments, tackle: store.tackle });
    ids = list.map(c => c.id);
    if (back) { const i = ids.indexOf(back); if (i >= limit) limit = Math.ceil((i + 1) / PAGE) * PAGE; }
    const shown = list.slice(0, limit);
    fill(results,
      list.length ? el("p", { class: "muted small result-count", text: statsText(tankStats(list)) }) : null,
      !list.length ? el("div", { class: "card empty" },
          el("p", { text: n ? "No catches match." : "No catches yet. Be the first to put a fish in the tank!" }),
          n ? el("button", { class: "btn block", type: "button", text: "Clear filters", onclick: clearF }) : null)
        : v === "list" ? el("div", { class: "card-list" }, ...shown.map(c => catchCard(c, all)))
        : el("div", { class: "tank-grid" }, ...shown.map(c => tile(c, all))),
      list.length > limit ? el("button", { class: "btn block", type: "button", text: "Show more", onclick: () => { limit += PAGE; redraw(); } }) : null);
  };
  redraw();
  fill(main, head, tools, results);
  scrollBackTo(back);
  back = null;
}

/* "47 fish · 9 species · heaviest 6 lb 2 oz" */
function statsText(s) {
  return [plural(s.fish, "fish", "fish"), plural(s.species, "species", "species"),
    s.heaviest ? `heaviest ${fmtWeight(s.heaviest.weightOz)} (${s.heaviest.species})` : null].filter(Boolean).join(" · ");
}

/* A photo with the species, size, angler and reactions under it; a crown or PB on the photo's corner. */
function tile(c, all) {
  const rec = recordOf(c, all), pb = !rec && isPersonalBest(c, all);
  const n = reactionCount(store.reactions, c.id), m = store.members.get(c.uid);
  return el("a", { class: "tank-tile", href: `#/c/${c.id}` },
    el("span", { class: "tank-photo" },
      c.thumb ? el("img", { src: c.thumb, alt: `${c.species} photo`, loading: "lazy", style: focusStyle(c) }) : el("span", { class: "tank-nophoto", html: icon.fish }),
      rec ? el("span", { class: "tank-flair", title: REC_TITLE[rec.level], text: REC_ICON[rec.level] })
        : pb ? el("span", { class: "tank-flair pb", title: "Personal best", text: "PB" }) : null),
    el("span", { class: "tank-cap" },
      el("b", { text: c.species }),
      el("span", { class: "tank-size", text: shownSize(c) || "Not measured" }),
      el("span", { class: "tank-who" },
        el("span", { class: "grow", text: m ? m.displayName : memberName(c.uid) }),
        n ? el("span", { class: "tank-react", text: `${topReaction(store.reactions, c.id)} ${n}` }) : null)));
}

/* One removable chip per filter in use. */
function chips() {
  const me = uid();
  const chip = (text, reset) => el("button", { class: "chip removable", type: "button", "aria-label": `Remove filter: ${text}`, onclick: () => setF(reset) },
    el("span", { text }), el("span", { "aria-hidden": "true", text: "✕" }));
  const item = f.lure && store.box.get(f.lure), boat = f.boat && store.fleet.get(f.boat);
  return [
    f.angler ? chip(f.angler === me ? "Me" : memberName(f.angler), { angler: "" }) : null,
    f.species ? chip(f.species, { species: "" }) : null,
    f.show !== "all" ? chip(label(TANK_SHOW, f.show), { show: "all" }) : null,
    f.when !== "any" ? chip(label(WHEN, f.when), { when: "any" }) : null,
    f.derby ? chip(`🏁 ${(store.derbies.get(f.derby) || {}).name || "Derby"}`, { derby: "" }) : null,
    f.boat ? chip(`🚤 ${boat ? boat.name : "Boat"}`, { boat: "" }) : null,
    f.lure ? chip(`🪝 ${item ? item.name : "Lure"}`, { lure: "" }) : null,
    f.released !== "any" ? chip(label(RELEASED, f.released), { released: "any" }) : null,
    f.measuredOnly ? chip("Measured", { measuredOnly: false }) : null,
    f.notesOnly ? chip("Has notes", { notesOnly: false }) : null,
    f.q.trim() ? chip(`“${f.q.trim()}”`, { q: "" }) : null,
    f.sort !== "new" ? chip(`Sort: ${label(TANK_SORT, f.sort)}`, { sort: "new" }) : null,
  ];
}

/* The filter sheet: each choice applies straight away, so the tank behind it updates as you go. */
function tankSheet(all) {
  const me = uid(), byName = (a, b) => a[1].localeCompare(b[1]);
  const select = (key, pairs) => {
    const s = el("select", { onchange: () => setF({ [key]: s.value }) }, ...pairs.map(([v, t]) => el("option", { value: v, text: t })));
    s.value = f[key];
    if (s.value !== f[key]) s.value = pairs[0][0]; // e.g. a species no longer in the league
    return s;
  };
  const check = (key, text) => el("label", { class: "check" },
    el("input", { type: "checkbox", checked: f[key], onchange: e => setF({ [key]: e.target.checked }) }), el("span", { text }));
  const others = [...store.members.values()].filter(m => m.id !== me).map(m => [m.id, m.displayName]).sort(byName);
  const species = [...new Set(all.map(c => c.species))].sort().map(s => [s, s]);
  const derbies = [...store.derbies.values()].filter(d => !d.cancelled).sort((a, b) => (b.start || 0) - (a.start || 0)).map(d => [d.id, d.name]);
  // Only boats and lures that some catch here used.
  const usedBoats = new Set(all.map(c => c.boatId).filter(Boolean));
  const boats = [...store.fleet.values()].filter(b => usedBoats.has(b.id)).map(b => [b.id, b.name]).sort(byName);
  const usedItems = new Set([...store.tackle.values()].map(t => t.itemId).filter(Boolean));
  const lures = [...store.box.values()].filter(i => usedItems.has(i.id))
    .map(i => [i.id, i.uid === me ? i.name : `${i.name} (${memberName(i.uid)})`]).sort(byName);
  const words = el("input", { type: "text", value: f.q, placeholder: "e.g. jig, dam", enterkeyhint: "done",
    oninput: () => setF({ q: words.value }), onkeydown: e => { if (e.key === "Enter") closeSheet(); } });
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "Filter the Fish Tank" }),
    field("Sort", select("sort", TANK_SORT), "Heaviest and Longest list measured fish only."),
    field("Angler", select("angler", [["", "Everyone"], [me, "Me"], ...others])),
    field("Species", select("species", [["", "All species"], ...species])),
    field("Show", select("show", TANK_SHOW)),
    field("When caught", select("when", WHEN)),
    derbies.length ? field("Derby", select("derby", [["", "Any or none"], ...derbies])) : null,
    boats.length ? field("Boat", select("boat", [["", "Any or none"], ...boats])) : null,
    lures.length ? field("Lure", select("lure", [["", "Any"], ...lures]), "From tackle boxes. Secret tackle never shows.") : null,
    field("Kept or released", select("released", RELEASED)),
    check("measuredOnly", "Measured fish only"),
    check("notesOnly", "Only catches with notes"),
    field("Notes or spot contains", words),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "Clear", onclick: () => { clearF(); closeSheet(); } }),
      el("button", { class: "btn primary", type: "button", text: "Done", onclick: closeSheet })))));
}
