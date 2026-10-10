/* League stats (#/league, from The Dock): the whole league's numbers for this season, a career or all time. The
   headline numbers show straight away; each section below folds, and is only worked out when it's open (the first
   starts open). The period and the open sections are remembered for the session. leaguestats.js does the counting. */
import { el, fill, fmtDay, fmtWeight, fmtLength } from "./ui.js";
import { store, uid, memberName, presentRsvps } from "./cloud.js";
import { focusStyle } from "./thumbfocus.js";
import { thumbImg } from "./thumbs.js";
import { shownSize } from "./catches.js";
import { seasonOf, seasonName } from "./season.js";
import { rankInput, crownSeasonsNow } from "./leaders.js";
import { DAYPARTS, MONTHS } from "./mystats.js";
import { hbars, monthBars } from "./statspage.js";
import { toF, toMph } from "./weather.js";
import { fmtMoney } from "./payout.js";
import { fishIn } from "./stats.js";
import {
  PERIODS, periodRange, periodCatches, anglerDays, headline, bigFish, recordStats, biggestPbJump, averageSizes, WEEKDAYS,
  heatmap, monthCompare, bestDay, busiestWeek, weekendSplit, earlyAndLate, firstAndLast, pace, byMoon, weatherStats,
  lureBoard, hotLure, pairings, techniqueMix, depthProfile, topBoxItem, speciesTable, rarest, debuts, diversity,
  spotBoard, boatBoard, boatOrShore, derbyStats, h2hStats, betStats, crownStats, reactionStats, commentStats,
  outingStats, skunkStats, badgeStats, goalStats, milestone, superlatives, LUNKER_OZ,
} from "./leaguestats.js";

const KEY = "lunker-league-stats";
let view = { period: "season", open: ["records"] };
try { view = { ...view, ...JSON.parse(sessionStorage.getItem(KEY) || "{}") }; } catch {}
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(view)); } catch {} };

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const num = n => Number(n).toLocaleString("en-US");
const plural = (n, one, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
const name = u => (u === uid() ? "You" : memberName(u));
const who = u => el("a", { href: `#/u/${u}`, text: name(u) });
const their = u => (u === uid() ? "your" : "their");
const sizeOf = (field, v) => (field === "lengthIn" ? fmtLength(v) : fmtWeight(v));
const speciesHref = s => `#/leaders/${encodeURIComponent(s)}/weight`;

const HINTS = {
  season: year => `League catches in the ${seasonName(year)}. Records are this season's.`,
  career: "Every league catch, every season. Records are league records.",
  alltime: "Every catch logged, 📜 logbook catches from before the league included. Record history and competitions only count league catches.",
};

/* The sections, in order: [id, title, body(ctx)]. */
const SECTIONS = [
  ["records", "🐋 Records and big fish", recordsBody],
  ["time", "🕐 When the fish bite", timeBody],
  ["weather", "🌦️ Weather and the moon", weatherBody],
  ["tackle", "🎣 Tackle and technique", tackleBody],
  ["species", "🐟 Species", speciesBody],
  ["places", "🗺️ Places and boats", placesBody],
  ["compete", "🏁 Derbies, duels and bets", competeBody],
  ["social", "💬 Social and outings", socialBody],
  ["progress", "🏅 Badges, goals and milestones", progressBody],
  ["supers", "🏆 Superlatives", supersBody],
];

export function renderLeagueStats(main) {
  const title = el("h2", { class: "page-title", text: "📈 League stats" });
  if (!store.catchesLoaded) return fill(main, title, el("p", { class: "loading", text: "Loading…" }));
  const now = Date.now(), year = seasonOf(now), { period } = view;
  const set = changes => { view = { ...view, ...changes }; save(); renderLeagueStats(main); };
  const all = [...store.catches.values()];
  const pool = periodCatches(all, period, year), range = periodRange(period, year);
  const members = [...store.members.values()].filter(m => !m.suspended).map(m => m.id);
  const days = anglerDays([...new Set([...members, ...pool.map(c => c.uid)])],
    { catches: pool, skunks: [...store.skunks.values()], trips: store.trips, rsvps: presentRsvps(), range, now });
  const ctx = { all, pool, period, year, range, now, members, days,
    tackle: new Map([...store.tackle].filter(([, t]) => t.shared)), spots: new Map([...store.spots].filter(([, s]) => s.shared)) };
  const h = headline(pool, { members, days });

  fill(main, title,
    el("div", { class: "stack-tight" },
      el("div", { class: "seg" }, ...PERIODS.map(([k, t]) =>
        el("button", { type: "button", "aria-pressed": String(period === k), text: t, onclick: () => set({ period: k }) }))),
      el("p", { class: "hint", text: period === "season" ? HINTS.season(year) : HINTS[period] })),
    headlineStrip(h),
    pool.length ? null : el("p", { class: "card empty", text: "No catches in this period yet. The numbers fill in as the league logs fish." }),
    ...SECTIONS.map(([id, text, body]) => {
      const open = view.open.includes(id);
      const toggle = () => set({ open: open ? view.open.filter(x => x !== id) : [...view.open, id] });
      return el("section", { class: "card ls-section" },
        el("button", { type: "button", class: "ls-head", "aria-expanded": String(open), onclick: toggle },
          el("span", { class: "grow", text }), el("span", { class: "ls-chev", html: CHEVRON })),
        open ? el("div", { class: "ls-body stack" }, ...body(ctx).filter(Boolean)) : null);
    }));
}

/* ---------- Pieces ---------- */

const tile = (n, label) => el("div", { class: "stat" }, el("b", { text: n }), el("span", { text: label }));

function headlineStrip(h) {
  const lb = Math.round(h.weightOz / 16), ft = Math.round(h.lengthIn / 12);
  return el("div", { class: "stack-tight" },
    el("div", { class: "hero-stats plain ls-hero" },
      tile(num(h.fish), "fish landed"), tile(num(h.catches), h.catches === 1 ? "catch logged" : "catches logged"),
      tile(num(h.species), "species"), tile(num(h.daysOut), h.daysOut === 1 ? "angler day out" : "angler days out"),
      tile(`${h.active}`, `of ${plural(h.members, "angler")} active`), tile(`${h.releasedPct}%`, `released (${num(h.released)})`),
      tile(`${num(lb)} lb`, "weighed in total"), tile(`${num(ft)} ft`, "of fish, nose to tail"),
      tile(h.daysOut ? String(Math.round((h.fish / h.daysOut) * 10) / 10) : "0", "fish per day out")),
    el("p", { class: "hint", text: `A stringer counts as its number of fish. Weight adds up ${plural(h.weighed, "weighed fish", "weighed fish")}; length ${plural(h.lengthN, "measured fish", "measured fish")}. An angler day out is one angler fishing one day (skunks too).` }));
}

/* A subheading inside a section. */
const sub = text => el("h4", { class: "ls-sub", text });
/* Facts as label: value rows. Rows with a null value are left out. */
const facts = (...rows) => {
  const shown = rows.filter(r => r && r[1] != null && r[1] !== "");
  return shown.length ? el("dl", { class: "facts" }, ...shown.map(([k, v]) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", {}, v)))) : null;
};
const line = (...kids) => el("span", {}, ...kids.filter(k => k != null && k !== false));
const empty = text => el("p", { class: "muted", text });

/* One catch as a row: photo, species and size, who and when. `extra` goes under it. */
function catchRow(c, extra = null) {
  if (!c) return null;
  return el("a", { class: "board-row ls-catch", href: `#/c/${c.id}` },
    thumbImg(c, { class: "thumb sm", alt: "", style: focusStyle(c) }),
    el("span", { class: "grow stack-tight" },
      el("b", { text: `${c.species}${shownSize(c) ? ` · ${shownSize(c)}` : ""}` }),
      el("span", { class: "muted small", text: `${name(c.uid)} · ${fmtDay(c.caughtAt)}` }),
      extra ? el("span", { class: "small", text: extra }) : null));
}

/* A row of photos that scrolls sideways, each with its size and angler. */
function photoStrip(list, field) {
  return el("div", { class: "ls-strip" }, ...list.map((c, i) => el("a", { class: "pb-tile ls-strip-tile", href: `#/c/${c.id}` },
    thumbImg(c, { alt: `${c.species} photo`, style: focusStyle(c) }),
    el("span", { class: "pb-text" },
      el("small", { text: `#${i + 1} · ${c.species}` }), el("b", { text: sizeOf(field, c[field]) }), el("span", { text: name(c.uid) })))));
}

/* A ranked list of anglers (or anything): [{ href, label, n }] with the number on the right. */
function board(rows, limit = 5) {
  return el("ol", { class: "ls-board" }, ...rows.slice(0, limit).map((r, i) => el("li", {},
    el("a", { class: "board-row" + (i === 0 ? " top1" : ""), href: r.href },
      el("span", { class: "rank", text: String(i + 1) }), el("span", { class: "grow", text: r.label }), el("b", { class: "board-size", text: r.n })))));
}

/* ---------- B. Records and big fish ---------- */

function recordsBody(x) {
  const big = bigFish(x.pool), rec = recordStats(x.all, x.period, x.year, x.now), jump = biggestPbJump(x.all, x.pool);
  const avg = averageSizes(x.pool);
  const reignDays = r => Math.max(0, Math.floor(((r.until ?? x.now) - r.from) / 86400000));
  const kind = f => (f === "lengthIn" ? "length" : "weight");
  if (!big.biggest && !rec.set) return [empty("No weighed or measured fish in this period yet.")];
  return [
    big.biggest ? el("a", { class: "pb-tile ls-hero-fish", href: `#/c/${big.biggest.id}` },
      thumbImg(big.biggest, { alt: `${big.biggest.species} photo`, style: focusStyle(big.biggest) }),
      el("span", { class: "pb-text" }, el("small", { text: "🐋 Biggest fish of the period" }),
        el("b", { text: `${big.biggest.species} · ${shownSize(big.biggest)}` }), el("span", { text: `${name(big.biggest.uid)} · ${fmtDay(big.biggest.caughtAt)}` }))) : null,
    big.heaviest.length ? sub("Top 10 heaviest") : null, big.heaviest.length ? photoStrip(big.heaviest, "weightOz") : null,
    big.longest.length ? sub("Top 10 longest") : null, big.longest.length ? photoStrip(big.longest, "lengthIn") : null,
    sub("The record boards"),
    facts(
      ["Records set", `${num(rec.set)} (${num(rec.broken)} broken)`],
      rec.latest ? ["Last record to fall", line(`${rec.latest.species} ${kind(rec.latest.field)}: `, who(rec.latest.brokenBy.uid),
        ` beat ${rec.latest.c.uid === rec.latest.brokenBy.uid ? `${their(rec.latest.c.uid)} own` : `${name(rec.latest.c.uid)}'s`} ${sizeOf(rec.latest.field, rec.latest.c[rec.latest.field])} with ${sizeOf(rec.latest.field, rec.latest.brokenBy[rec.latest.field])}, ${fmtDay(rec.latest.until)}`)] : null,
      rec.standing ? ["Longest-standing record", line(`${rec.standing.species} ${kind(rec.standing.field)} by `, who(rec.standing.c.uid),
        `: ${sizeOf(rec.standing.field, rec.standing.c[rec.standing.field])}, unbeaten for ${plural(reignDays(rec.standing), "day")}`)] : null,
      rec.closest ? ["Closest call", line(`${rec.closest.species} ${kind(rec.closest.field)} broken by just ${sizeOf(rec.closest.field, rec.closest.margin)} (`, who(rec.closest.brokenBy.uid), ")")] : null,
      jump ? ["Biggest PB jump", line(who(jump.c.uid), ` beat ${their(jump.c.uid)} ${jump.c.species} best by ${sizeOf(jump.field, jump.gain)} (+${jump.pct}%): ${sizeOf(jump.field, jump.prev[jump.field])} to ${sizeOf(jump.field, jump.c[jump.field])}`)] : null),
    jump ? catchRow(jump.c, "The PB jump") : null,
    avg.length ? sub("Average size by species") : null,
    avg.length ? el("ul", { class: "ls-list" }, ...avg.slice(0, 12).map(a => el("li", {},
      el("a", { href: speciesHref(a.species), text: a.species }),
      el("span", { class: "muted", text: [a.avgWeightOz ? `${fmtWeight(a.avgWeightOz)} avg (${a.weighed} weighed)` : null,
        a.avgLengthIn ? `${fmtLength(a.avgLengthIn)} avg (${a.measured} measured)` : null].filter(Boolean).join(" · ") })))) : null,
    avg.length ? el("p", { class: "hint", text: "What a typical fish of each species weighs and measures, from 2 or more weighed or measured fish." }) : null,
  ];
}

/* ---------- C. When the fish bite ---------- */

const HEAT_COLS = ["Early", "AM", "Mid", "PM", "Eve", "Night"]; // DAYPARTS, short
function heatGrid(map) {
  const parts = DAYPARTS.map(p => p.label);
  return el("div", { class: "ls-heat", role: "table", "aria-label": "Fish by day of the week and time of day" },
    el("span", { class: "ls-heat-corner" }), ...parts.map(p => el("span", { class: "ls-heat-col", text: HEAT_COLS[parts.indexOf(p)], title: p })),
    ...WEEKDAYS.flatMap((d, i) => [el("span", { class: "ls-heat-row", text: d }),
      ...map.cells[i].map((n, j) => { const heat = map.max ? Math.round((n / map.max) * 100) : 0; return el("span", {
        class: "ls-heat-cell" + (heat >= 55 ? " hot" : "") + (n && n === map.max ? " max" : ""), style: `--heat:${heat}%`, title: `${d} ${parts[j]} (${DAYPARTS[j].range}): ${n} fish`, text: n ? String(n) : "" }); })]));
}

/* This season's bars, each with last season's as a fainter bar beside it. */
function monthPair(cur, last) {
  const max = Math.max(1, ...cur, ...last);
  return el("div", { class: "stack-tight" },
    el("div", { class: "mbars", role: "img", "aria-label": cur.map((n, i) => `${MONTHS[i]} ${n} (last season ${last[i]})`).join(", ") },
      ...cur.map((n, i) => el("div", { class: "mbar", title: `${MONTHS[i]}: ${n} fish (last season ${last[i]})` },
        el("span", { class: "mbar-n", text: n ? String(n) : "" }),
        el("span", { class: "mbar-track ls-pair" },
          el("span", { class: "ls-last", style: `height:${(last[i] / max) * 100}%` }),
          el("span", { class: "mbar-fill", style: `height:${(n / max) * 100}%` })),
        el("span", { class: "mbar-label", text: MONTHS[i].slice(0, 1) })))),
    el("p", { class: "ls-legend small" }, el("span", { class: "ls-key now" }), " This season ", el("span", { class: "ls-key last" }), " Last season"));
}

function timeBody(x) {
  if (!x.pool.length) return [empty("No fish in this period yet.")];
  const hm = heatmap(x.pool), months = monthCompare(x.all, x.pool, x.period, x.year), day = bestDay(x.pool), week = busiestWeek(x.pool);
  const split = weekendSplit(x.pool), el2 = earlyAndLate(x.pool), fl = firstAndLast(x.pool), p = pace(x.all, x.now);
  const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
  return [
    sub("Day of the week and time of day"),
    heatGrid(hm),
    el("p", { class: "hint", text: "Darker means more fish. " + DAYPARTS.map(d => `${d.label} ${d.range}`).join(" · ") }),
    sub("By month"),
    months.last ? monthPair(months.current, months.last) : monthBars(months.current),
    months.last ? null : el("p", { class: "hint", text: "Every year added together." }),
    sub("Pace"),
    el("p", { class: "ls-pace" + (p.diff > 0 ? " up" : p.diff < 0 ? " down" : "") },
      el("b", { text: p.diff > 0 ? `▲ ${num(p.diff)} ahead` : p.diff < 0 ? `▼ ${num(-p.diff)} behind` : "Dead even" }),
      ` · ${num(p.fish)} fish so far this season, against ${num(p.last)} by this date last season.`),
    sub("Big days"),
    facts(
      day ? ["Best day", line(`${fmtDay(day.at)}: ${plural(day.fish, "fish", "fish")} by `, ...day.anglers.flatMap((u, i) => [i ? ", " : "", who(u)]))] : null,
      week ? ["Busiest week", `Week of ${fmtDay(week.from)}: ${plural(week.fish, "fish", "fish")}`] : null,
      ["Weekend or weekday", `${pct(split.weekend, split.weekend + split.weekday)} on weekends (${num(split.weekend)}), ${pct(split.weekday, split.weekend + split.weekday)} on weekdays (${num(split.weekday)})`],
      ["Early birds (4–7 AM)", el2.early ? line(`${pct(el2.early, el2.total)} of fish · most: `, who(el2.earlyTop.uid), ` (${el2.earlyTop.n})`) : "None yet"],
      ["Night stalkers (9 PM–4 AM)", el2.night ? line(`${pct(el2.night, el2.total)} of fish · most: `, who(el2.nightTop.uid), ` (${el2.nightTop.n})`) : "None yet"]),
    sub(x.period === "season" ? "First and latest fish of the season" : "First and latest fish"),
    catchRow(fl.first, "🥇 First"), fl.last && fl.last !== fl.first ? catchRow(fl.last, "🆕 Latest") : null,
  ];
}

/* ---------- D. Weather and the moon ---------- */

function weatherBody(x) {
  if (!x.pool.length) return [empty("No fish in this period yet.")];
  const w = weatherStats(x.pool, store.weather);
  const toughest = (label, r, text) => (r ? catchRow(r.c, `${label}: ${text(r.w)}`) : null);
  return [
    sub("Moon phase"),
    hbars(byMoon(x.pool).map(m => ({ label: `${m.emoji} ${m.label}`, n: m.n })), { keepZero: true }),
    el("p", { class: "hint", text: "Worked out from when each fish was caught." }),
    w.covered ? null : empty("No weather looked up for these catches yet. Each angler's phone fills it in once it has signal."),
    w.covered ? sub("Barometer") : null, w.covered ? hbars(w.pressure, { keepZero: true }) : null,
    w.covered ? sub("Air temperature") : null, w.covered ? hbars(w.temp, { keepZero: true }) : null,
    w.covered ? sub("Wind") : null, w.covered ? hbars(w.wind, { keepZero: true }) : null,
    w.sky.length ? sub("Sky") : null, w.sky.length ? hbars(w.sky.map(s => ({ label: `${s.emoji} ${s.label}`, n: s.n }))) : null,
    w.covered ? sub("Toughest conditions") : null,
    toughest("🥶 Coldest", w.coldest, v => `${toF(v.tempC)}°F`),
    w.hottest && w.hottest !== w.coldest ? toughest("🥵 Hottest", w.hottest, v => `${toF(v.tempC)}°F`) : null,
    w.windiest && w.windiest.w.windKph > 0 ? toughest("💨 Windiest", w.windiest, v => `${toMph(v.windKph)} mph wind`) : null,
    w.covered ? el("p", { class: "hint", text: `From the ${num(w.covered)} of ${num(w.catches)} catches with weather (the hour each was caught). The barometer is the reading at that hour; the weather service doesn't say if it was rising or falling.` }) : null,
  ];
}

/* ---------- E. Tackle ---------- */

function tackleBody(x) {
  const lures = lureBoard(x.pool, x.tackle), hot = hotLure(x.all, x.tackle, x.now), pairs = pairings(x.pool, x.tackle);
  const tech = techniqueMix(x.pool, x.tackle), depth = depthProfile(x.pool, x.tackle), item = topBoxItem(x.pool, x.tackle, store.box);
  const byWeight = lures.filter(l => l.weightOz > 0).sort((a, b) => b.weightOz - a.weightOz);
  const out = [el("p", { class: "hint", text: "From shared tackle only: secret tackle stays secret." })];
  if (!lures.length && !tech.length && !depth.some(d => d.n)) return [...out, empty("No shared tackle on catches in this period yet.")];
  out.push(
    hot ? el("p", { class: "ls-callout" }, "🔥 Hottest lure right now: ", el("b", { text: hot.label }), ` · ${plural(hot.fish, "fish", "fish")} in the last 30 days`) : null,
    item ? el("a", { class: "board-row", href: `#/ti/${item.item.id}` },
      item.item.thumb ? el("img", { class: "thumb sm", src: item.item.thumb, alt: "" }) : el("span", { class: "thumb sm" }),
      el("span", { class: "grow stack-tight" }, el("b", { text: `🍀 ${item.item.name}` }),
        el("span", { class: "muted small", text: `Most productive tackle box item · ${name(item.item.uid)}'s box` })),
      el("b", { class: "board-size", text: `${item.fish} fish` })) : null,
    lures.length ? sub("Top 10 lures by fish") : null,
    lures.length ? hbars(lures.map(l => ({ label: l.label, range: plural(l.anglers, "angler"), n: l.fish })), { limit: 10 }) : null,
    byWeight.length ? sub("Top 5 lures by weight landed") : null,
    byWeight.length ? el("ul", { class: "ls-list" }, ...byWeight.slice(0, 5).map(l => el("li", {}, el("b", { text: l.label }), el("span", { class: "muted", text: fmtWeight(l.weightOz) })))) : null,
    pairs.length ? sub("Best lure and species pairs") : null,
    pairs.length ? el("ul", { class: "ls-list" }, ...pairs.map(p => el("li", {}, el("span", {}, el("b", { text: p.lure }), " → ", el("a", { href: speciesHref(p.species), text: p.species })),
      el("span", { class: "muted", text: plural(p.fish, "fish", "fish") })))) : null,
    tech.length ? sub("Technique mix") : null, tech.length ? stackBar(tech) : null,
    depth.some(d => d.n) ? sub("Depth") : null, depth.some(d => d.n) ? hbars(depth, { keepZero: true }) : null);
  return out;
}

/* One bar split into each part's share, with a key under it. Parts use the theme's chart colours in turn. */
function stackBar(rows) {
  const total = rows.reduce((s, r) => s + r.n, 0) || 1;
  return el("div", { class: "stack-tight" },
    el("div", { class: "ls-stack", role: "img", "aria-label": rows.map(r => `${r.label} ${r.n}`).join(", ") },
      ...rows.map((r, i) => el("span", { class: `ls-seg c${i % 6}`, style: `width:${(r.n / total) * 100}%`, title: `${r.label}: ${r.n} fish` }))),
    el("ul", { class: "ls-keys" }, ...rows.map((r, i) => el("li", {}, el("span", { class: `ls-key c${i % 6}` }),
      `${r.label} ${Math.round((r.n / total) * 100)}% (${r.n})`))));
}

/* ---------- F. Species ---------- */

function speciesBody(x) {
  const table = speciesTable(x.pool);
  if (!table.length) return [empty("No fish in this period yet.")];
  const rare = rarest(x.pool), firsts = debuts(x.all, x.period, x.year), div = diversity(x.pool);
  return [
    el("ul", { class: "ls-list ls-species" }, ...table.map(r => el("li", {},
      el("span", { class: "grow" }, el("a", { href: speciesHref(r.species), text: r.species }),
        r.top ? el("small", { class: "muted" }, " · most: ", who(r.top.uid), ` (${r.top.n})`) : null),
      el("span", { class: "muted", text: `${num(r.fish)} · ${r.share}%` })))),
    sub(rare.length > 1 ? "Rarest catches" : "Rarest catch"),
    ...rare.map(r => catchRow(r.c, `Only ${plural(r.fish, "fish", "fish")} of this species${r.fish > 1 ? "; this was the first" : ""}`)),
    sub(x.period === "season" ? "New to the league this season" : "Species debuts (newest first)"),
    firsts.length ? el("div", { class: "stack-tight" }, ...firsts.slice(0, 6).map(c => catchRow(c, `First ${c.species} ever logged`)))
      : empty("No new species this season yet. Go find one!"),
    firsts.length > 6 ? el("p", { class: "hint", text: `And ${firsts.length - 6} more.` }) : null,
    sub("Most species per angler"),
    board(div.map(r => ({ href: `#/u/${r.uid}`, label: name(r.uid), n: `${r.n}` }))),
  ];
}

/* ---------- G. Places and boats ---------- */

function placesBody(x) {
  const spots = spotBoard(x.pool, x.spots), boats = boatBoard(x.pool, store.fleet), bs = boatOrShore(x.pool);
  const total = bs.boat + bs.other;
  return [
    sub("Most productive shared spots"),
    spots.length ? board(spots.map((s, i) => ({ href: `#/c/${s.firstId}`, label: `${s.name || `Spot ${i + 1}`} · ${plural(s.anglers, "angler")}`, n: `${s.fish} fish` })))
      : empty("No shared spots on catches in this period yet."),
    spots.length ? el("p", { class: "hint", text: `${plural(spots.length, "shared spot")} produced fish. Spots within 250 m count as one; private spots never show. Tap one for its first catch, or open the Map.` }) : null,
    spots.length ? el("a", { class: "btn block", href: "#/map", onclick: () => { try { sessionStorage.setItem("lunker-map-view", "league"); } catch {} }, text: "🗺️ Open the league map" }) : null,
    sub("Boats"),
    boats.length ? el("div", { class: "stack-tight" }, ...boats.slice(0, 5).map((b, i) => el("a", { class: "board-row" + (i === 0 ? " top1" : ""), href: `#/boat/${b.boat.id}` },
      el("span", { class: "rank", text: String(i + 1) }),
      el("span", { class: "grow stack-tight" }, el("b", { text: `🚤 ${b.boat.name}` }),
        el("span", { class: "muted small", text: [plural(b.crew, "angler"), b.biggest ? `biggest ${b.biggest.species} ${shownSize(b.biggest)}` : null].filter(Boolean).join(" · ") })),
      el("b", { class: "board-size", text: `${b.fish} fish` })))) : empty("No fish logged on a saved boat in this period yet."),
    total ? facts(["On a boat", `${num(bs.boat)} fish (${Math.round((bs.boat / total) * 100)}%) on a saved boat; ${num(bs.other)} from shore or with no boat picked`]) : null,
  ];
}

/* ---------- H. Derbies, duels, bets and crowns ---------- */

function competeBody(x) {
  const opts = { catches: x.all, range: x.range, now: x.now };
  const d = derbyStats({ derbies: store.derbies, entrants: store.entrants, mystery: store.mystery, ...opts });
  const h = h2hStats({ challenges: store.challenges, ...opts });
  const b = betStats({ bets: store.bets, betPlayers: store.betPlayers, ...opts });
  const c = crownStats(crownSeasonsNow(), x.period, x.year);
  return [
    sub("🏁 Derbies"),
    d.count ? facts(
      ["Derbies finished", `${num(d.count)} · ${plural(d.entries, "entry", "entries")}`],
      d.pot ? ["Money in the pots", fmtMoney(d.pot)] : null,
      d.biggest ? ["Biggest payout", line(who(d.biggest.uid), ` won ${fmtMoney(d.biggest.amount)} in `, el("a", { href: `#/d/${d.biggest.d.id}`, text: d.biggest.d.name }))] : null) : empty("No finished derbies in this period."),
    d.wins.length ? board(d.wins.map(r => ({ href: `#/u/${r.uid}`, label: `${name(r.uid)} · ${plural((d.podiums.find(p => p.uid === r.uid) || { n: 0 }).n, "podium")}`, n: plural(r.n, "win") }))) : null,
    d.podiums.length && d.podiums[0].uid !== (d.wins[0] || {}).uid ? facts(["Most podiums", line(who(d.podiums[0].uid), ` (${d.podiums[0].n})`)]) : null,
    sub("🤺 Head-to-heads"),
    h.count ? facts(
      ["Duels finished", `${num(h.count)}${h.ties ? ` (${plural(h.ties, "tie")})` : ""}`],
      h.streak ? ["Longest win streak", line(who(h.streak.uid), ` · ${plural(h.streak.n, "win")} in a row`)] : null,
      h.stake ? ["Biggest stake won", line(who(h.stake.uid), ` took ${plural(h.stake.n, "point")} in `, el("a", { href: `#/h/${h.stake.ch.id}`, text: "this duel" }))] : null,
      h.rivalry && h.rivalry.n > 1 ? ["Top rivalry", line(who(h.rivalry.a), " vs ", who(h.rivalry.b), ` · ${h.rivalry.n} duels (${h.rivalry.aWins}–${h.rivalry.bWins}${h.rivalry.ties ? `–${h.rivalry.ties}` : ""})`)] : null)
      : empty("No finished head-to-heads in this period."),
    sub("🎲 Bets"),
    b.count ? facts(
      ["Bets settled", `${num(b.count)}${b.washes ? ` (${plural(b.washes, "wash", "washes")})` : ""} · ${plural(b.players, "player")}`],
      b.pot ? ["Money won", fmtMoney(b.pot)] : null,
      b.mostBacked && b.mostBacked.n > 1 ? ["Most-backed side", line(`“${b.mostBacked.label}” · ${b.mostBacked.n} anglers in `, el("a", { href: `#/b/${b.mostBacked.b.id}`, text: b.mostBacked.b.title }))] : null,
      b.upset ? ["Biggest upset", line(`“${b.upset.label}” won with ${b.upset.n} of ${b.upset.of} backing it in `, el("a", { href: `#/b/${b.upset.b.id}`, text: b.upset.b.title }))] : null)
      : empty("No settled bets in this period."),
    sub("👑 Crowns"),
    c.steals ? facts(
      ["Crowns stolen", num(c.steals)],
      c.contested ? ["Most contested", `${c.contested.crown.icon} ${c.contested.crown.name} (changed hands ${plural(c.contested.n, "time")})`] : null,
      c.latest ? ["Latest steal", line(who(c.latest.uid), ` took ${c.latest.crown.icon} ${c.latest.crown.name} from `, who(c.latest.from), `, ${fmtDay(c.latest.at)}`)] : null)
      : empty("No crown has changed hands in this period yet."),
  ];
}

/* ---------- I. Social and outings ---------- */

function socialBody(x) {
  const r = reactionStats(x.pool, store.reactions), cm = commentStats(x.pool, store.comments);
  const o = outingStats({ trips: store.trips, rsvps: store.rsvps, noShows: store.noShows, catches: x.all, range: x.range, now: x.now });
  const s = skunkStats(x.days);
  return [
    sub("Reactions and comments"),
    r.total ? el("p", { class: "ls-emoji" }, ...r.byEmoji.map(e => el("span", { class: "chip", text: `${e.emoji} ${num(e.n)}` }))) : empty("No reactions in this period yet."),
    r.top ? catchRow(r.top.c, `Most reacted: ${r.top.byEmoji.map(e => `${e.emoji} ${e.n}`).join("  ")}`) : null,
    cm.top ? catchRow(cm.top.c, `Most comments: ${cm.top.n}`) : null,
    facts(
      r.givers.length ? ["Hype machine", line(who(r.givers[0].uid), ` gave ${plural(r.givers[0].n, "reaction")} on other people's fish`)] : null,
      cm.commenters.length ? ["Top commenter", line(who(cm.commenters[0].uid), ` · ${plural(cm.commenters[0].n, "comment")}`)] : null),
    sub("🛶 Outings"),
    o.count ? facts(
      ["Outings held", `${num(o.count)} · ${plural(o.fish, "fish", "fish")} caught on them`],
      o.said ? ["Turned up", `${o.rate}% of the anglers who said In (${num(o.showed)} of ${num(o.said)})`] : null,
      o.biggest ? ["Biggest turnout", line(el("a", { href: `#/t/${o.biggest.t.id}`, text: o.biggest.t.title || "An outing" }), ` · ${plural(o.biggest.n, "angler")}, ${fmtDay(o.biggest.t.at)}`)] : null,
      o.reliable ? ["Most reliable", line(who(o.reliable.uid), ` showed up to ${plural(o.reliable.n, "outing")}`)] : null)
      : empty("No outings finished in this period."),
    sub("🦨 Skunk report"),
    s.daysOut ? facts(
      ["Skunked days", `${num(s.skunkDays)} of ${num(s.daysOut)} angler days out (${s.rate}%)`],
      s.drought ? ["Longest drought broken", line(who(s.drought.uid), ` ended a ${s.drought.n}-day skunk streak with ${plural(s.drought.fish, "fish", "fish")}`)] : null)
      : empty("No days out in this period."),
  ];
}

/* ---------- J. Badges, goals and milestones ---------- */

function progressBody(x) {
  const input = rankInput(), b = badgeStats(input.badges, x.period, x.year);
  const g = goalStats([...store.goals.values()], { catches: x.all.filter(c => !c.dq), skunks: [...store.skunks.values()], trips: store.trips, rsvps: presentRsvps(), now: x.now }, x.range);
  const m = milestone(periodCatches(x.all, "career", x.year).reduce((n, c) => n + fishIn(c), 0));
  return [
    sub("League milestone"),
    m.next ? el("div", { class: "stack-tight" },
      el("p", {}, el("b", { text: `${num(m.fish)} league fish` }), ` ever · ${m.pct}% of the way to ${num(m.next)}`),
      el("div", { class: "ls-meter", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(m.next), "aria-valuenow": String(m.fish) },
        el("span", { style: `width:${m.pct}%` })),
      el("p", { class: "hint", text: `${num(m.next - m.fish)} to go. Logbook catches don't count.` }))
      : el("p", {}, el("b", { text: `${num(m.fish)} league fish` }), " ever. Every milestone smashed!"),
    sub("🏅 Badges"),
    b.count ? facts(
      ["Badges earned", num(b.count)],
      b.top ? ["Most badges", line(who(b.top.uid), ` (${b.top.n})`)] : null,
      b.rarest ? ["Rarest badge held", line(`${b.rarest.badge.icon} ${b.rarest.badge.name}: `, ...b.rarest.owners.flatMap((u, i) => [i ? ", " : "", who(u)]))] : null)
      : empty("No badges earned in this period yet."),
    sub("🎯 Goals"),
    facts(["Goals reached", `${num(g.reached)}${g.reached ? ` by ${plural(g.anglers, "angler")}` : ""}`], ["Goals set", num(g.set)]),
  ];
}

/* ---------- Superlatives ---------- */

const SUPER_VALUE = {
  grinder: n => plural(n, "day out", "days out"), sniper: n => `${n} fish a day`, heavyweight: n => `${fmtWeight(n)} average`,
  saint: n => `${n}% released`, magnet: n => `${n} fish of ${fmtWeight(LUNKER_OZ)}+`, tinkerer: n => plural(n, "lure"),
};
function supersBody(x) {
  const list = superlatives(x.pool, { days: x.days, tackle: x.tackle });
  if (!list.length) return [empty("Nobody qualifies yet. Get out there!")];
  return [el("div", { class: "ls-supers" }, ...list.map(s => el("a", { class: "ls-super", href: `#/u/${s.uid}` },
    el("span", { class: "ls-super-icon", "aria-hidden": "true", text: s.icon }),
    el("b", { text: s.title }), el("span", { class: "ls-super-who", text: name(s.uid) }),
    el("span", { class: "small", text: SUPER_VALUE[s.id](s.n) }), el("span", { class: "muted small", text: s.desc }))))];
}
