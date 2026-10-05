/* Catches: logging and editing, the feed, a catch's own page, and the personal-best wall. */
import { el, field, avatar, fmtDate, fmtDay, fmtAgo, fmtWeight, fmtLength, toast, confirmButton, icon, openSheet, closeSheet, fill } from "./ui.js";
import { store, uid, memberName, isAdmin, setDisqualified, newCatchId, saveCatch, deleteCatch, loadPhoto, cachedPhoto, retryRejected, discardRejected } from "./cloud.js";
import { pickImage, catchPhoto } from "./photos.js";
import { photoTakenAt } from "./exif.js";
import { pickOnMap } from "./mappick.js";
import { SPECIES, normalizeSpecies } from "./species.js";
import { reactionBar, commentsSection, reactionSummary } from "./social.js";
import { derbyStatus, entryProblem, PROOF } from "./derby.js";
import { crewText } from "./derbies.js";
import { personalBests, isPersonalBest, checkNewPB, recordKinds, anglerStats, isStringer, pastCatch, loggedLate, leagueStartOf, DEFAULT_GRACE_DAYS } from "./stats.js";
import { leagueEvents, postedAt } from "./events.js";
import { NO_FILTERS, SHOW, WHEN, SORT, filterFeed, activeCount, isFiltered } from "./feedfilter.js";
import { rankInput } from "./leaders.js";

const allCatches = () => [...store.catches.values()];
const byNewest = (a, b) => (b.caughtAt || 0) - (a.caughtAt || 0);
const sizeText = c => isStringer(c) ? `Stringer of ${c.fishCount}`
  : [fmtWeight(c.weightOz), fmtLength(c.lengthIn)].filter(Boolean).join(" · ");
// Logged well after it was caught (within the grace days): the card says when it was posted too, since the feed
// orders by that.
const postedLate = c => !c.past && (c.createdAt || 0) - c.caughtAt > 12 * 3600 * 1000;
const mapsUrl = s => `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;

/* ---------- Cards ---------- */
/* `news`: league news this catch caused (badges, records, crowns), shown on the card instead of as cards of their own. */
export function catchCard(c, all = allCatches(), news = []) {
  const pb = isPersonalBest(c, all), rec = recordKinds(c, all);
  const m = store.members.get(c.uid) || { id: c.uid, displayName: memberName(c.uid) };
  return el("a", { class: "catch-card", href: `#/c/${c.id}` },
    el("img", { class: "thumb", src: c.thumb, alt: `${c.species} photo`, loading: "lazy" }),
    el("div", { class: "catch-info" },
      el("div", { class: "catch-species", text: c.species }),
      el("div", { class: "catch-size" + (sizeText(c) ? "" : " unmeasured"), text: sizeText(c) || "Not measured" }),
      el("div", { class: "catch-who" }, avatar(m, "xs"), el("span", { text: `${m.displayName} · ${c.past ? fmtDay(c.caughtAt) : fmtAgo(c.caughtAt)}` })),
      postedLate(c) ? el("div", { class: "catch-posted", text: `Posted ${fmtAgo(c.createdAt)}` }) : null,
      // Chips for what matters (records, PBs, limits, derbies, problems); the rest goes in the quiet line below.
      el("div", { class: "badges" },
        rec.length ? el("span", { class: "badge record", text: c.past ? "📜 All-time record" : "👑 League record" }) : null,
        pb ? el("span", { class: "badge pb", text: "PB" }) : null,
        c.past && !rec.length ? el("span", { class: "badge past", text: "📜 Past catch" }) : null,
        isStringer(c) && c.limit ? el("span", { class: "badge limit", text: "🪝 Limit" }) : null,
        c.derbyId && store.derbies.get(c.derbyId) ? el("span", { class: "badge derby", text: `🏁 ${store.derbies.get(c.derbyId).name}` }) : null,
        c.dq ? el("span", { class: "badge dq", text: "Disqualified" }) : null,
        store.pending.has(c.id) ? el("span", { class: "badge wait", text: "⏳ Waiting for signal" }) : null),
      cardNews(news),
      metaLine(c)));
}

/* News on a catch card: one line each for records and crowns, and all its badges together on one line. */
function cardNews(news) {
  if (!news.length) return null;
  const badges = news.filter(e => e.badge), lines = news.filter(e => !e.badge).map(e => [e.icon, e.short]);
  if (badges.length === 1) lines.push([badges[0].icon, badges[0].short]);
  else if (badges.length) lines.push(["🏅", `Earned ${badges.length} badges: ${badges.map(e => `${e.badge.icon} ${e.badge.name}`).join(" · ")}`]);
  return el("ul", { class: "catch-news" }, ...lines.map(([i, t]) =>
    el("li", {}, el("span", { class: "catch-news-icon", text: i }), el("span", { text: t }))));
}

/* Reactions, comments, released and spot, in one quiet line. */
function metaLine(c) {
  const r = reactionSummary(c.id), n = (store.comments.get(c.id) || []).length;
  const bits = [
    r ? el("span", { text: r }) : null,
    n ? el("span", { text: `💬 ${n}` }) : null,
    c.released ? el("span", { class: "meta", text: "Released" }) : null,
    c.hasSpot ? el("span", { class: "meta", text: c.locShared ? "📍 Spot" : "🔒 Secret spot" }) : null,
  ].filter(Boolean);
  return bits.length ? el("div", { class: "social-line" }, ...bits) : null;
}

/* ---------- Feed ---------- */
// Everyone/Mine, search and filters last for the session (until the app is closed).
const FEED_KEY = "lunker-feed-filters";
let feedFilter = "all", feedLimit = 30, filters = { ...NO_FILTERS }, redrawFeed = () => {};
try { const v = JSON.parse(sessionStorage.getItem(FEED_KEY) || "null"); if (v) { feedFilter = v.feedFilter || "all"; filters = { ...NO_FILTERS, ...v.filters }; } } catch {}
const saveFilters = () => { try { sessionStorage.setItem(FEED_KEY, JSON.stringify({ feedFilter, filters })); } catch {} };
const setFilters = changes => { filters = { ...filters, ...changes }; feedLimit = 30; saveFilters(); redrawFeed(); };

export function renderFeed(main) {
  const all = allCatches();
  // Hero counts are league catches; past catches (logbook) only count toward PBs.
  const me = uid(), stats = anglerStats(all.filter(c => !c.past), me), pbs = personalBests(all, me).size;
  // Catches mixed with league news (records stolen, badges, derby results), newest first.
  const news = store.catchesLoaded ? leagueEvents({ ...rankInput(), name: memberName }) : [];
  const hero = el("section", { class: "hero" },
    el("p", { class: "eyebrow", text: (store.league && store.league.name) || "Lunker League" }),
    el("h2", { text: `${store.me.displayName}, tight lines!` }),
    el("div", { class: "hero-stats" },
      stat(stats.catches, "catches"), stat(stats.species, "species"), stat(pbs, "PBs")),
    stats.catches ? null : el("a", { class: "btn lime block", href: "#/log", html: icon.plus }, "Log your first catch"));
  const seg = el("div", { class: "seg" }, ...[["all", "Everyone"], ["mine", "Mine"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(feedFilter === k), text: label,
      onclick: () => { feedFilter = k; feedLimit = 30; saveFilters(); renderFeed(main); } })));

  // Typing redraws only the results, so the search box keeps focus. A live redraw of the whole page puts it back.
  const typing = document.activeElement && document.activeElement.id === "feed-search";
  const search = el("input", { id: "feed-search", type: "search", value: filters.q, placeholder: "Search species, angler, notes…",
    "aria-label": "Search the feed", enterkeyhint: "search",
    oninput: () => { filters.q = search.value; feedLimit = 30; saveFilters(); redrawFeed(); } });
  const filterBtn = el("button", { class: "btn filter-btn", type: "button", onclick: () => filterSheet(all) });
  const chips = el("div", { class: "filter-chips" });
  const results = el("div", { class: "feed-results" });
  const clearAll = () => { search.value = ""; setFilters({ ...NO_FILTERS }); };

  redrawFeed = () => {
    const n = activeCount(filters), filtered = isFiltered(filters);
    filterBtn.textContent = n ? `Filters · ${n}` : "Filters";
    filterBtn.setAttribute("aria-pressed", String(n > 0));
    fill(chips, ...activeChips(), filtered ? el("button", { class: "chip removable clear", type: "button", text: "Clear all", onclick: clearAll }) : null);
    const { catches, onCard, loose } = filterFeed({ catches: all, news, f: filters, me, mine: feedFilter === "mine", name: memberName,
      derbyName: id => (store.derbies.get(id) || {}).name || "" });
    // Newest: ordered by when each catch was posted, so a fish logged late, or a throwback, still shows up at the top.
    const list = filters.sort !== "new" ? catches.map(c => ({ c }))
      : [...catches.map(c => ({ at: postedAt(c), c })), ...loose.map(e => ({ at: e.at, e }))].sort((a, b) => b.at - a.at);
    // Grouped under a header for each day (by when it was posted); a size sort is one ranked list.
    const cards = [];
    let day = null;
    for (const x of list.slice(0, feedLimit)) {
      if (filters.sort === "new") {
        const d = new Date(x.at).toDateString();
        if (d !== day) { day = d; cards.push(el("h3", { class: "day-head", text: dayLabel(x.at) })); }
      }
      cards.push(x.c ? catchCard(x.c, all, onCard.get(x.c.id)) : newsCard(x.e));
    }
    fill(results,
      filtered && store.catchesLoaded ? el("p", { class: "muted small result-count", text: countText(catches.length, loose.length) }) : null,
      !store.catchesLoaded ? el("p", { class: "loading", text: "Loading catches…" })
        : cards.length ? el("div", { class: "card-list" }, ...cards)
        : filtered ? el("div", { class: "card empty" }, el("p", { text: "Nothing matches." }),
            el("button", { class: "btn block", type: "button", text: "Clear search and filters", onclick: clearAll }))
        : el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.fish }),
            el("p", { text: feedFilter === "mine" ? "You haven't logged a catch yet." : "No catches yet. Be the first to put a fish on the board!" })),
      list.length > feedLimit ? el("button", { class: "btn block", type: "button", text: "Show more",
        onclick: () => { feedLimit += 30; redrawFeed(); } }) : null);
  };
  redrawFeed();
  fill(main, hero, seg, el("div", { class: "feed-tools" }, search, filterBtn), chips, results);
  if (typing) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
}

const countText = (c, n) => [`${c} ${c === 1 ? "catch" : "catches"}`, n ? `${n} news` : null].filter(Boolean).join(" · ");
const choiceLabel = (pairs, k) => (pairs.find(p => p[0] === k) || [k, k])[1];

/* One removable chip per filter in use. */
function activeChips() {
  const chip = (text, reset) => el("button", { class: "chip removable", type: "button", "aria-label": `Remove filter: ${text}`, onclick: () => setFilters(reset) },
    el("span", { text }), el("span", { "aria-hidden": "true", text: "✕" }));
  return [
    filters.angler && feedFilter !== "mine" ? chip(memberName(filters.angler), { angler: "" }) : null,
    filters.species ? chip(filters.species, { species: "" }) : null,
    filters.show !== "all" ? chip(choiceLabel(SHOW, filters.show), { show: "all" }) : null,
    filters.when !== "any" ? chip(choiceLabel(WHEN, filters.when), { when: "any" }) : null,
    filters.derby ? chip(`🏁 ${(store.derbies.get(filters.derby) || {}).name || "Derby"}`, { derby: "" }) : null,
    filters.sort !== "new" ? chip(`Sort: ${choiceLabel(SORT, filters.sort)}`, { sort: "new" }) : null,
  ];
}

/* The filter sheet: each choice applies straight away, so the feed behind it updates as you go. */
function filterSheet(all) {
  const select = (key, pairs) => {
    const s = el("select", { onchange: () => setFilters({ [key]: s.value }) },
      ...pairs.map(([v, t]) => el("option", { value: v, text: t })));
    s.value = filters[key];
    if (s.value !== filters[key]) s.value = pairs[0][0]; // e.g. a species no longer in the league
    return s;
  };
  const anglers = [...store.members.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)).map(m => [m.id, m.displayName]);
  const species = [...new Set(all.map(c => c.species))].sort().map(s => [s, s]);
  const derbies = [...store.derbies.values()].filter(d => !d.cancelled).sort((a, b) => (b.start || 0) - (a.start || 0)).map(d => [d.id, d.name]);
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "Filter the feed" }),
    feedFilter === "mine" ? null : field("Angler", select("angler", [["", "Everyone"], ...anglers])),
    field("Species", select("species", [["", "All species"], ...species])),
    field("Show", select("show", SHOW)),
    field("When caught", select("when", WHEN)),
    derbies.length ? field("Derby", select("derby", [["", "Any or none"], ...derbies])) : null,
    field("Sort", select("sort", SORT), "Heaviest and Longest list measured fish only, biggest first."),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "Clear", onclick: () => { setFilters({ ...NO_FILTERS, q: filters.q }); closeSheet(); } }),
      el("button", { class: "btn primary", type: "button", text: "Done", onclick: closeSheet })))));
}
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(t) {
  const d = new Date(t), today = new Date(), yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return `${WEEKDAY[d.getDay()]} ${fmtDay(t)}`;
}
const newsCard = e => el("a", { class: "news-card", href: e.href },
  el("span", { class: "news-icon", text: e.icon }), el("span", { class: "grow", text: e.text }), el("span", { class: "muted small", text: fmtAgo(e.at) }));
const stat = (n, label) => el("div", { class: "stat" }, el("b", { text: String(n) }), el("span", { text: label }));

/* ---------- One catch ---------- */
let celebrate = null; // { id, previous } after saving a new personal best

export function renderCatch(main, id) {
  const c = store.catches.get(id);
  if (!c) {
    return fill(main, el("div", { class: "card empty" },
      el("p", { text: store.catchesLoaded ? "This catch has been deleted." : "Loading…" })));
  }
  const all = allCatches(), mine = c.uid === uid();
  const m = store.members.get(c.uid) || { id: c.uid, displayName: memberName(c.uid) };
  const pb = isPersonalBest(c, all), rec = recordKinds(c, all), spot = store.spots.get(c.id);

  const img = el("img", { class: "catch-photo", src: cachedPhoto(c.id) || c.thumb, alt: `${c.species} caught by ${m.displayName}` });
  const note = el("p", { class: "photo-note hint" });
  const photoBox = el("button", { class: "photo-box", type: "button", "aria-label": "View photo full screen", onclick: () => viewer(img.src) }, img);
  loadPhoto(c.id).then(src => { if (src) img.src = src; })
    .catch(() => { note.textContent = "Showing a small copy. The full photo loads when you have signal."; });

  const parts = [];
  // Shown for a minute after saving, so it survives the redraw when the server confirms the catch.
  if (celebrate && celebrate.id === c.id && Date.now() - celebrate.at < 60000) {
    const prev = celebrate.previous;
    parts.push(el("section", { class: "celebrate" },
      el("div", { class: "celebrate-emoji", text: "🎉🐟🎉" }),
      el("h2", { text: prev ? "New personal best!" : `First ${c.species}!` }),
      el("p", { text: prev ? `Beats your old best of ${sizeText(prev)}.` : "That's your PB to beat." })));
  }
  parts.push(photoBox, note,
    el("section", { class: "catch-head" },
      el("h2", { text: c.species }),
      sizeText(c) ? el("div", { class: "catch-size big", text: sizeText(c) }) : el("div", { class: "muted", text: "Not measured" }),
      el("div", { class: "badges" },
        rec.includes("weight") ? el("span", { class: "badge record", text: c.past ? "📜 All-time heaviest" : "👑 Heaviest in the league" }) : null,
        rec.includes("length") ? el("span", { class: "badge record", text: c.past ? "📜 All-time longest" : "👑 Longest in the league" }) : null,
        pb ? el("span", { class: "badge pb", text: `${mine ? "Your" : "Their"} PB` }) : null,
        isStringer(c) && c.limit ? el("span", { class: "badge limit", text: "🪝 Limited out" }) : null,
        store.pending.has(c.id) ? el("span", { class: "badge wait", text: "⏳ Waiting for signal" }) : null)),
    derbyBox(c),
    el("a", { class: "member-row card", href: `#/u/${c.uid}` }, avatar(m),
      el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }), el("div", { class: "muted small", text: "View profile" }))),
    el("dl", { class: "facts card" },
      fact("Caught", fmtDate(c.caughtAt)),
      c.past ? fact("Counts for", "📜 Past catch: personal bests and the all-time record boards. No points, badges or crowns.") : null,
      c.photoTakenAt ? fact("Photo taken", fmtDate(c.photoTakenAt)) : null,
      ...(isStringer(c) ? [
        fact("Fish", String(c.fishCount)),
        fact("Limit", c.limit ? "Yes" : "No"),
      ] : [
        fact("Weight", fmtWeight(c.weightOz) || "Not weighed"),
        fact("Length", fmtLength(c.lengthIn) || "Not measured"),
        fact("Released", c.released ? "Yes" : "No"),
      ]),
      c.notes ? fact("Notes", c.notes) : null,
      c.captain || c.netman ? fact("Boat crew", crewText(c)) : null,
      c.enteredBy ? fact("Entered by", `${memberName(c.enteredBy)} (organiser)`) : null,
      fact("Spot", spotView(c, spot, mine))));

  parts.push(reactionBar(c.id), commentsSection(c));
  if (mine || isAdmin() || c.enteredBy === uid()) {
    parts.push(el("div", { class: "row" },
      (mine || c.enteredBy === uid()) && !lockedEntry(c) ? el("a", { class: "btn", href: `#/log/${c.id}`, text: "Edit" }) : null,
      confirmButton("Delete", "Tap again to delete", () => { deleteCatch(c); location.hash = "#/feed"; toast("Catch deleted."); })));
  }
  fill(main, ...parts);
}

/* A derby entry can't be changed once that derby's final entries have closed. */
function lockedEntry(c) {
  const d = c.derbyId && store.derbies.get(c.derbyId);
  return !!d && ["ended", "cancelled"].includes(derbyStatus(d));
}

/* A derby entry: which derby, and any disqualification (with the organiser's controls). */
function derbyBox(c) {
  const d = c.derbyId && store.derbies.get(c.derbyId);
  if (!d) return null;
  const organiser = d.organiserUid === uid() || isAdmin();
  return el("section", { class: "card stack derby-entry" + (c.dq ? " out" : "") },
    el("a", { href: `#/d/${d.id}`, class: "derby-link" }, el("span", { text: "🏁 Derby entry" }), el("b", { text: d.name })),
    c.dq ? el("p", { class: "entry-problem", text: `Disqualified${c.dqReason ? ": " + c.dqReason : ""}` }) : null,
    lockedEntry(c) && c.uid === uid() ? el("p", { class: "hint", text: "🔒 The derby is over, so this entry can't be changed." }) : null,
    organiser ? (c.dq
      ? el("button", { class: "btn small", type: "button", text: "Reinstate entry", onclick: () => setDisqualified(c.id, false) })
      : el("a", { class: "btn small", href: `#/d/${d.id}`, text: "Organiser: review entries" })) : null);
}

const fact = (k, v) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", {}, v));

function spotView(c, spot, mine) {
  if (!c.hasSpot) return "Not tagged";
  if (!spot) return "🔒 Secret spot";
  const link = el("a", { href: mapsUrl(spot), target: "_blank", rel: "noopener", text: navigator.onLine ? "Open in Maps" : "Open in Maps (needs signal)" });
  return el("span", { class: "stack-tight" },
    el("span", { text: spot.shared ? `📍 ${spot.name || "Shared with the league"}` : `🔒 Private${mine ? ": only you can see it" : ""}${spot.name ? ` (${spot.name})` : ""}` }),
    link);
}

/* Full-screen photo; pinch to zoom in on the scale or measuring board. */
function viewer(src) {
  const box = el("div", { class: "viewer", role: "dialog", "aria-label": "Photo" },
    el("img", { src, alt: "" }),
    el("button", { class: "viewer-close", type: "button", text: "Close", onclick: () => box.remove() }));
  document.body.append(box);
}

/* ---------- Personal-best wall (profile) ---------- */
/* The three stats double as filters: catches (PBs and recent catches), species (each with how many were caught)
   and records (the league records this angler holds). The choice is kept while the profile redraws live. */
let wall = { member: null, view: "catches" };
export function pbWall(memberId) {
  if (wall.member !== memberId) wall = { member: memberId, view: "catches" };
  const box = el("div", { class: "stack" });
  const draw = () => fill(box, ...wallParts(memberId, view => { wall.view = view; draw(); }));
  draw();
  return [box];
}

function wallParts(memberId, choose) {
  const all = allCatches(), view = wall.view;
  const mine = all.filter(c => c.uid === memberId);
  const st = anglerStats(all.filter(c => !c.past), memberId); // league catches; past ones are noted below
  const pastN = mine.filter(c => c.past && !c.dq).length;
  const records = mine.filter(c => recordKinds(c, all).length).sort(byNewest);
  const filter = (key, n, label) => el("button", { type: "button", class: "stat", "aria-pressed": String(view === key),
    "aria-label": `Show ${label}`, onclick: () => choose(key) }, el("b", { text: String(n) }), el("span", { text: label }));
  const parts = [el("div", { class: "hero-stats plain filters" },
    filter("catches", st.catches, "catches"), filter("species", st.species, "species"), filter("records", records.length, "records")),
    pastN ? el("p", { class: "hint", text: `Plus ${pastN} past catch${pastN === 1 ? "" : "es"} (📜 logbook): they count for PBs and the all-time records only.` }) : null];

  if (view === "species") {
    const counts = new Map();
    for (const c of mine) if (!c.dq && !c.past) counts.set(c.species, (counts.get(c.species) || 0) + (isStringer(c) ? c.fishCount : 1));
    const list = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    parts.push(el("section", { class: "stack" }, el("h3", { text: "Species" }),
      list.length ? el("ul", { class: "species-list card" }, ...list.map(([sp, n]) => el("li", {},
        el("a", { class: "species-row", href: `#/leaders/${encodeURIComponent(sp)}` },
          el("span", { class: "grow", text: sp }), el("b", { text: `${n} caught` })))))
        : el("p", { class: "muted", text: "No catches yet." })));
  } else if (view === "records") {
    parts.push(el("section", { class: "stack" }, el("h3", { text: "Records" }),
      records.length ? el("div", { class: "card-list" }, ...records.map(c => catchCard(c, all)))
        : el("p", { class: "muted", text: "No league records held right now." })));
  } else {
    const pbs = [...personalBests(all, memberId).values()].sort((a, b) => a.species.localeCompare(b.species));
    const recent = [...mine].sort(byNewest).slice(0, 10);
    parts.push(el("section", { class: "stack" },
      el("h3", { text: "Personal bests" }),
      pbs.length ? el("div", { class: "pb-wall" }, ...pbs.map(c => el("a", { class: "pb-tile", href: `#/c/${c.id}` },
        el("img", { src: c.thumb, alt: "", loading: "lazy" }),
        el("div", { class: "pb-text" }, el("b", { text: c.species }), el("span", { text: sizeText(c) })))))
        : el("p", { class: "muted", text: "No catches yet." })),
    recent.length ? el("section", { class: "stack" }, el("h3", { text: "Recent catches" }),
      el("div", { class: "card-list" }, ...recent.map(c => catchCard(c, all)))) : null);
  }
  return parts;
}

/* ---------- Log or edit a catch ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const num = s => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; };

export function renderLog(main, editId, derbyArg) {
  const editing = editId ? store.catches.get(editId) : null;
  if (editId && (!editing || (editing.uid !== uid() && editing.enteredBy !== uid()))) {
    return fill(main, el("div", { class: "card" }, el("p", { text: "You can only edit your own catches." })));
  }
  const oldSpot = editing && store.spots.get(editing.id);
  const st = {
    full: null, thumb: editing ? editing.thumb : null, takenAt: editing ? editing.photoTakenAt || null : null,
    spot: oldSpot ? { lat: oldSpot.lat, lng: oldSpot.lng, acc: oldSpot.acc } : null,
    share: editing ? !!editing.locShared : false,
    // "one" fish, or a "stringer": one photo of many fish, with a yes/no on whether it was a limit.
    mode: editing && isStringer(editing) ? "stringer" : "one",
    limit: editing && isStringer(editing) ? !!editing.limit : null,
  };

  // Photo
  // The photo area itself opens the camera too (the same as the Camera button), or retakes the photo.
  const preview = el("button", { type: "button", class: "photo-pick", onclick: () => takePhoto(true) });
  const photoMsg = el("p", { class: "msg" });
  const drawPreview = () => {
    preview.setAttribute("aria-label", st.thumb ? "Retake the photo with the camera" : "Take a photo with the camera");
    fill(preview, st.thumb
    ? el("img", { src: st.thumb, alt: "Catch photo" })
    : el("div", { class: "photo-empty" }, el("span", { html: icon.camera }),
        el("span", { text: st.mode === "stringer" ? "Tap to take a photo of your stringer" : "Tap to take a photo of your catch" })));
  };
  const takePhoto = async camera => {
    const file = await pickImage({ camera });
    if (!file) return;
    photoMsg.className = "msg ok"; photoMsg.textContent = "Preparing photo…";
    try {
      const [p, t] = await Promise.all([catchPhoto(file), photoTakenAt(file)]);
      st.full = p.full; st.thumb = p.thumb;
      st.takenAt = t || (file.inAppCamera ? file.lastModified : null); // in-app photos are taken right now
      photoMsg.textContent = "";
      drawPreview(); drawTimeHint();
    } catch {
      photoMsg.className = "msg err"; photoMsg.textContent = "That file couldn't be opened as a photo. Try another.";
    }
  };
  drawPreview();

  // Fields
  const species = el("input", { type: "text", list: "species-list", autocapitalize: "words", autocomplete: "off", maxlength: 40,
    placeholder: "e.g. Walleye", value: editing ? editing.species : "" });
  const datalist = el("datalist", { id: "species-list" }, ...SPECIES.map(s => el("option", { value: s })));
  const w = editing && editing.weightOz ? editing.weightOz : 0;
  const lb = el("input", { type: "text", inputmode: "numeric", placeholder: "0", "aria-label": "Pounds", value: w ? String(Math.floor(w / 16)) : "" });
  const oz = el("input", { type: "text", inputmode: "decimal", placeholder: "0", "aria-label": "Ounces", value: w ? String(Math.round((w % 16) * 10) / 10) : "" });
  const L = editing && editing.lengthIn ? editing.lengthIn : 0;
  const inches = el("input", { type: "text", inputmode: "numeric", placeholder: "0", "aria-label": "Inches", value: L ? String(Math.floor(L)) : "" });
  const frac = el("select", { "aria-label": "Fraction of an inch" },
    ...[["0", "—"], ["0.25", "¼"], ["0.5", "½"], ["0.75", "¾"]].map(([v, t]) => el("option", { value: v, text: t })));
  frac.value = L ? String(Math.round((L % 1) * 4) / 4) : "0";
  const when = el("input", { type: "datetime-local", value: toLocalInput(editing ? editing.caughtAt : Date.now()), max: toLocalInput(Date.now() + 600000) });
  const timeHint = el("div");
  // A past catch (caught before the league, or logged more than the grace days late) is said up front.
  const league = store.league || {};
  const pastOpts = { leagueStart: leagueStartOf(league), graceDays: league.graceDays ?? DEFAULT_GRACE_DAYS };
  const createdAt = editing ? editing.createdAt : Date.now();
  const caught = () => ({ caughtAt: new Date(when.value).getTime(), createdAt });
  const willBePast = () => !!(editing && editing.pastStored) || pastCatch(caught(), pastOpts);
  // Only "logged too late" is saved (and locked); "before the league start" follows the start date.
  const savePast = () => !!(editing && editing.pastStored) || loggedLate(caught(), pastOpts.graceDays);
  const pastNote = el("p", { class: "msg past-note" });
  const drawPastNote = () => {
    pastNote.textContent = willBePast()
      ? `📜 Past catch: it counts for your PBs and the all-time records, not for points, badges or crowns (caught before the league started, or more than ${pastOpts.graceDays} days ago).`
      : "";
  };
  when.addEventListener("input", drawPastNote);
  when.addEventListener("change", drawPastNote);
  drawPastNote();
  const drawTimeHint = () => fill(timeHint, st.takenAt
    ? el("button", { class: "btn small quiet", type: "button", text: `Use photo time: ${fmtDate(st.takenAt)}`, onclick: () => { when.value = toLocalInput(st.takenAt); } })
    : "");
  drawTimeHint();
  const released = el("input", { type: "checkbox", checked: editing ? !!editing.released : false });
  const notes = el("textarea", { rows: 3, maxlength: 500, placeholder: "Lure, depth, weather, the one that got away…" });
  notes.value = editing ? editing.notes || "" : "";

  // Stringer: how many fish, and was it a limit (no default; the angler has to say).
  const fishCount = el("input", { type: "text", inputmode: "numeric", placeholder: "e.g. 50", "aria-label": "Number of fish",
    value: editing && isStringer(editing) ? String(editing.fishCount) : "" });
  const limitSeg = el("div", { class: "seg" });
  const drawLimit = () => fill(limitSeg, ...[[true, "Yes, my limit"], [false, "No"]].map(([v, label]) =>
    el("button", { type: "button", "aria-pressed": String(st.limit === v), text: label, onclick: () => { st.limit = v; drawLimit(); } })));
  drawLimit();
  const photoHint = el("p", { class: "hint" });
  const singleBox = el("div", { class: "stack" },
    el("div", { class: "field" }, el("span", { class: "field-label", text: "Weight" }),
      el("div", { class: "unit-row" }, lb, el("span", { text: "lb" }), oz, el("span", { text: "oz" }))),
    el("div", { class: "field" }, el("span", { class: "field-label", text: "Length" }),
      el("div", { class: "unit-row" }, inches, frac, el("span", { text: "inches" }))),
    el("p", { class: "hint", text: "Optional. Measure the ones that might be a PB or a derby entry; the rest still count toward your catches." }));
  const releasedRow = el("label", { class: "check" }, released, el("span", { text: "Released" }));
  const stringerBox = el("div", { class: "stack" },
    field("How many fish?", fishCount),
    el("div", { class: "field" }, el("span", { class: "field-label", text: "Is this your limit?" }), limitSeg),
    el("p", { class: "hint", text: "A stringer earns the day's full catch points. A limit earns a bonus on top." }));
  const modeSeg = el("div", { class: "seg" });
  const derbySection = el("section", { class: "card stack" });
  const drawMode = () => {
    const str = st.mode === "stringer";
    fill(modeSeg, ...[["one", "🐟 One fish"], ["stringer", "🪝 Stringer"]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(st.mode === k), text: label, onclick: () => { st.mode = k; drawMode(); } })));
    singleBox.hidden = str; releasedRow.hidden = str; stringerBox.hidden = !str;
    derbySection.hidden = str; // stringers can't be derby entries
    photoHint.textContent = str ? "Take one picture of the whole stringer."
      : "Show the fish on a scale or measuring board if you can. It settles arguments.";
    drawPreview();
  };

  // Spot
  const spotName = el("input", { type: "text", maxlength: 60, autocapitalize: "words", placeholder: "e.g. North bay, by the reeds",
    value: editing ? editing.spotName || (oldSpot && oldSpot.name) || "" : "" });
  const spotBox = el("div", { class: "stack" });
  const drawSpot = () => {
    fill(spotBox,
      st.spot
        ? el("div", { class: "stack-tight" },
            el("div", { class: "row spread" },
              el("span", { class: "spot-ok", text: st.spot.acc ? `📍 Spot tagged (±${Math.round(st.spot.acc)} m)` : "📍 Spot picked on the map" }),
              el("button", { class: "btn small quiet", type: "button", text: "Remove", onclick: () => { st.spot = null; drawSpot(); } })),
            el("button", { class: "btn small", type: "button", text: "🗺️ Move it on the map", onclick: mapSpot }))
        : el("div", { class: "row" },
            el("button", { class: "btn", type: "button", text: "📍 My location (GPS)", onclick: tagSpot }),
            el("button", { class: "btn", type: "button", text: "🗺️ Pick on map", onclick: mapSpot })),
      gpsMsg,
      st.spot ? field("Spot name (optional)", spotName) : null,
      st.spot ? el("div", { class: "seg" }, ...[[false, "🔒 Private"], [true, "📍 Share with league"]].map(([v, label]) =>
        el("button", { type: "button", "aria-pressed": String(st.share === v), text: label, onclick: () => { st.share = v; drawSpot(); } }))) : null,
      st.spot ? el("p", { class: "hint", text: st.share
        ? "Everyone in the league can see this spot on a map."
        : "Only you can see this spot. Others see \"Secret spot\"." }) : null);
  };
  const gpsMsg = el("p", { class: "msg" });
  const tagSpot = () => {
    if (!navigator.geolocation) { gpsMsg.className = "msg err"; gpsMsg.textContent = "This phone can't share its location with the app."; return; }
    gpsMsg.className = "msg ok"; gpsMsg.textContent = "Finding your spot… GPS works without signal but can take a minute.";
    navigator.geolocation.getCurrentPosition(pos => {
      st.spot = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || 0 };
      gpsMsg.textContent = ""; drawSpot();
    }, err => {
      gpsMsg.className = "msg err";
      gpsMsg.textContent = err.code === 1 ? "Location is blocked. Allow location for this app in the phone's settings, then try again."
        : "Couldn't get a GPS fix. Try again with a clear view of the sky.";
    }, { enableHighAccuracy: true, timeout: 45000, maximumAge: 60000 });
  };
  // Picked on the map: no GPS accuracy, so acc is 0.
  const mapSpot = async () => {
    const p = await pickOnMap(st.spot);
    if (p) { st.spot = { lat: p.lat, lng: p.lng, acc: 0 }; gpsMsg.textContent = ""; drawSpot(); }
  };
  drawSpot();

  // Derby entry: the derbies this angler has joined that are open for entries.
  const openDerbies = [...store.derbies.values()].filter(d =>
    ((store.entrants.get(d.id) || new Map()).has(uid()) || d.organiserUid === uid())
    && (["active", "closing"].includes(derbyStatus(d)) || (editing && editing.derbyId === d.id)));
  const derbySel = el("select", { "aria-label": "Derby" }, el("option", { value: "", text: "Not a derby entry" }),
    ...openDerbies.map(d => el("option", { value: d.id, text: d.name })));
  derbySel.value = (editing && editing.derbyId) || derbyArg || "";
  if (derbySel.value === "" && derbyArg) derbyArg = null; // not joined or not open
  const captain = crewPicker(editing && editing.captain), netman = crewPicker(editing && editing.netman);
  // The derby's organiser can enter a catch for any angler who joined.
  const anglerSel = el("select", { "aria-label": "Angler" });
  const anglerField = el("div", { class: "field" }, el("span", { class: "field-label", text: "Angler" }), anglerSel,
    el("span", { class: "hint", text: "As the organiser you can enter a catch for anyone in this derby. It counts as theirs." }));
  const derbyInfo = el("div", { class: "stack" });
  const chosenDerby = () => store.derbies.get(derbySel.value) || null;
  const drawDerby = () => {
    const d = chosenDerby();
    if (!d) return fill(derbyInfo, openDerbies.length ? null : el("p", { class: "hint", text: "Join a derby on the Events tab to enter catches in it." }));
    if (d.catchRelease) released.checked = true;
    const ent = store.entrants.get(d.id) || new Map();
    const canProxy = d.organiserUid === uid() && !(editing && editing.uid === uid() && !editing.enteredBy);
    if (canProxy) {
      const ids = [...ent.keys()].sort((a, b) => memberName(a).localeCompare(memberName(b)));
      const keep = anglerSel.value || (editing ? editing.uid : (ent.has(uid()) ? uid() : ids[0] || ""));
      fill(anglerSel, ...ids.map(id => el("option", { value: id, text: id === uid() ? `${memberName(id)} (me)` : memberName(id) })));
      anglerSel.value = keep;
      anglerSel.disabled = !!editing;
    }
    anglerField.hidden = !canProxy;
    const mine = [...store.catches.values()].filter(x => x.derbyId === d.id && x.uid === uid() && !x.dq && (!editing || x.id !== editing.id)).length;
    fill(derbyInfo, anglerField,
      el("ul", { class: "derby-rules" },
        el("li", { text: `📸 ${PROOF[d.proof]}` }),
        d.species.length ? el("li", { text: `🐟 Counts: ${d.species.join(", ")}` }) : null,
        d.minWeightOz ? el("li", { text: `⚖️ At least ${fmtWeight(d.minWeightOz)}` }) : null,
        d.minLengthIn ? el("li", { text: `📏 At least ${fmtLength(d.minLengthIn)}` }) : null,
        d.catchRelease ? el("li", { text: "🔄 Catch and release only" }) : null,
        d.requireLocation ? el("li", { text: "📍 Tag your spot and share it with the league" }) : null,
        d.maxEntries ? el("li", { text: `🎟️ You've entered ${mine} of ${d.maxEntries}. Only your first ${d.maxEntries} count.` }) : null),
      el("div", { class: "field" }, el("span", { class: "field-label", text: d.requireCrew ? "Captain (required)" : "Captain (optional)" }), captain.node),
      el("div", { class: "field" }, el("span", { class: "field-label", text: d.requireCrew ? "Net man (required)" : "Net man (optional)" }), netman.node),
      el("p", { class: "hint", text: "Pick Me if you did it yourself. Guests who aren't in the league can be typed in." }));
  };
  derbySel.addEventListener("change", drawDerby);
  drawDerby();

  fill(derbySection, el("h3", { text: "🏁 Derby" }), openDerbies.length || (editing && editing.derbyId) ? derbySel : null, derbyInfo);
  // A derby entry is always one fish, so there's no stringer choice when entering a derby.
  const derbyOnly = !!derbyArg || !!(editing && editing.derbyId);
  drawMode();

  const msg = el("p", { class: "msg", role: "status" });
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit catch" : chosenDerby() && derbyArg ? `Enter: ${chosenDerby().name}` : "Log a catch" }),
    derbyOnly ? null : modeSeg,
    el("section", { class: "card stack" }, preview,
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", html: icon.camera, onclick: () => takePhoto(true) }, "Camera"),
        el("button", { class: "btn", type: "button", html: icon.image, onclick: () => takePhoto(false) }, "Gallery")),
      photoMsg,
      photoHint,
      el("p", { class: "hint", text: "Camera opens right here in the app. You can also take the photo with your phone's camera app and pick it with Gallery." })),
    el("section", { class: "card stack" },
      field("Species", species), datalist,
      singleBox, stringerBox,
      field("Caught", when), timeHint, pastNote,
      releasedRow,
      field("Notes (optional)", notes)),
    el("section", { class: "card stack" }, el("h3", { text: "Where" }), spotBox),
    derbySection,
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Save catch" }),
    el("a", { class: "btn quiet block", href: editing ? `#/c/${editing.id}` : "#/feed", text: "Cancel" }));

  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = t => { msg.className = "msg err"; msg.textContent = t; msg.scrollIntoView({ block: "center", behavior: "smooth" }); };
    const sp = normalizeSpecies(species.value);
    const weightOz = Math.round((num(lb.value) * 16 + num(oz.value)) * 10) / 10;
    const lengthIn = Math.round((num(inches.value) + num(frac.value)) * 4) / 4;
    const caughtAt = new Date(when.value).getTime();
    const stringer = st.mode === "stringer" && !derbyOnly;
    const count = Number(fishCount.value.trim());
    if (!st.thumb) return fail(stringer ? "Add a photo of your stringer." : "Add a photo of your catch.");
    if (!sp) return fail("Enter the species.");
    if (stringer && !(Number.isInteger(count) && count >= 2 && count <= 500)) return fail("Enter how many fish are on the stringer (2 to 500).");
    if (stringer && st.limit === null) return fail("Tell us if this is your limit.");
    if (!stringer && num(oz.value) >= 16) return fail("Ounces should be under 16. Put whole pounds in the lb box.");
    if (!isFinite(caughtAt)) return fail("Enter when you caught it.");
    if (caughtAt > Date.now() + 600000) return fail("The catch time is in the future.");

    const id = editing ? editing.id : newCatchId();
    const data = {
      uid: uid(), species: sp, weightOz: !stringer && weightOz > 0 ? weightOz : null, lengthIn: !stringer && lengthIn > 0 ? lengthIn : null,
      caughtAt, createdAt: editing ? editing.createdAt : Date.now(), thumb: st.thumb, photoTakenAt: st.takenAt || null,
      notes: notes.value.trim().slice(0, 500), released: !stringer && released.checked,
      hasSpot: !!st.spot, locShared: !!st.spot && st.share, spotName: st.spot && st.share ? spotName.value.trim().slice(0, 60) : "",
    };
    if (stringer) Object.assign(data, { fishCount: count, limit: st.limit });
    if (savePast()) data.past = true;
    else if (editing && editing.fishCount != null) Object.assign(data, { fishCount: null, limit: null }); // was a stringer
    const d = stringer ? null : chosenDerby();
    if (d) {
      Object.assign(data, { derbyId: d.id, captain: captain.value(), netman: netman.value() });
      // Entered for someone else: it's their catch, recorded as entered by the organiser.
      const angler = !anglerField.hidden && anglerSel.value ? anglerSel.value : (editing ? editing.uid : uid());
      if (!(store.entrants.get(d.id) || new Map()).has(angler)) return fail("Join this derby first (or pick an angler who has).");
      if (angler !== uid()) {
        data.uid = angler; data.enteredBy = uid();
        if (st.spot) st.share = true; // their spot has to be shared, or they couldn't see it
        data.locShared = !!st.spot; data.spotName = st.spot ? spotName.value.trim().slice(0, 60) : "";
      }
      if (captain.value() === undefined || netman.value() === undefined) return fail("Type the guest's name, or pick someone else.");
      const problem = entryProblem({ ...data, released: released.checked }, d);
      if (problem) return fail(`This entry doesn't meet the derby rules: ${problem}.`);
    } else if (editing && editing.derbyId) {
      Object.assign(data, { derbyId: null, captain: null, netman: null });
    }
    const spot = st.spot ? { ...st.spot, name: spotName.value.trim().slice(0, 60), shared: st.share } : (oldSpot ? null : undefined);
    const mineNow = data.uid === uid();
    const check = mineNow ? checkNewPB({ id, ...data }, allCatches()) : { pb: false };
    saveCatch({ id, data, photo: st.full, spot, isNew: !editing });
    // Celebrate beating your PB, or your first ever of a species (not when an unmeasured one was logged before).
    if (check.pb && (check.previous || (check.first && !editing))) celebrate = { id, previous: check.previous, at: Date.now() };
    toast(navigator.onLine ? "Catch saved." : "Saved on this phone. It will be shared when you have signal.");
    location.hash = `#/c/${id}`;
  });

  fill(main, form);
}

/* Captain / net man picker: not named, me, a league member, or a guest typed in by name.
   value(): null (not named), { uid }, { guest }, or undefined when "Guest" is picked but no name is typed. */
function crewPicker(initial) {
  const sel = el("select", {}, el("option", { value: "", text: "Not named" }), el("option", { value: "me", text: "Me" }),
    ...[...store.members.values()].filter(m => m.id !== uid() && !m.suspended).sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map(m => el("option", { value: "u:" + m.id, text: m.displayName })),
    el("option", { value: "guest", text: "Guest (not in the league)…" }));
  const guest = el("input", { type: "text", maxlength: 40, autocapitalize: "words", placeholder: "Guest's name", hidden: true });
  if (initial && initial.uid) sel.value = initial.uid === uid() ? "me" : "u:" + initial.uid;
  else if (initial && initial.guest) { sel.value = "guest"; guest.value = initial.guest; }
  const sync = () => { guest.hidden = sel.value !== "guest"; };
  sel.addEventListener("change", sync); sync();
  return {
    node: el("div", { class: "stack-tight" }, sel, guest),
    value() {
      if (!sel.value) return null;
      if (sel.value === "me") return { uid: uid() };
      if (sel.value === "guest") return guest.value.trim() ? { guest: guest.value.trim().slice(0, 40) } : undefined;
      return { uid: sel.value.slice(2) };
    },
  };
}

/* ---------- Catches the server refused ---------- */
const shownRejected = new Set();
export function maybeShowRejected() {
  const e = store.rejected.find(x => !shownRejected.has(x.id));
  if (!e) return;
  shownRejected.add(e.id);
  const d = e.catchData || {};
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "A catch wasn't saved" }),
    el("p", { text: `Your ${d.species || "catch"} (${sizeText(d)}) from ${fmtDate(d.caughtAt || e.savedAt)} didn't reach the league. The server refused it, for example because your account was paused when it was sent.` }),
    el("p", { text: "This phone still has it, photo included." }),
    d.derbyId ? el("p", { text: "If it was a derby entry, the derby may have closed. You can keep it as a regular catch instead." }) : null,
    d.derbyId ? el("button", { class: "btn primary block", type: "button", text: "Save as a regular catch",
      onclick: () => { retryRejected(e, { derbyId: null, captain: null, netman: null }); closeSheet(); toast("Saved as a regular catch."); } }) : null,
    el("button", { class: d.derbyId ? "btn block" : "btn primary block", type: "button", text: "Try again", onclick: () => { retryRejected(e); closeSheet(); toast("Sending it again."); } }),
    confirmButton("Discard it", "Tap again to discard", () => { discardRejected(e); closeSheet(); }, "btn danger block"))));
}
