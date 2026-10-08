/* Leaders: angler rankings (points and titles), the league record for every species, and each species'
   leaderboard of personal bests. */
import { el, avatar, fmtDay, fmtDate, fmtWeight, fmtLength, icon, fill, openSheet, closeSheet } from "./ui.js";
import { store, memberName, uid, isAdmin } from "./cloud.js";
import { speciesRecords, speciesBoard, leagueStartOf } from "./stats.js";
import { rankings, badgesFor, scoringTimeline, currentScoring, TITLES } from "./rank.js";
import { crownStandings, crownScore } from "./crowns.js";
import { badgeTimeline, BADGES } from "./badges.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const MEDALS = ["🥇", "🥈", "🥉"];

/* Everything the ranking needs, from the live data. Reactions carry when they were last changed, and only spots
   shared with the league count (private ones aren't on everyone's phone). */
export function rankInput() {
  const reactions = new Map([...store.reactions].map(([cid, byUser]) => [cid, new Map([...byUser].map(([u, emojis]) =>
    [u, { emojis, at: ((store.reactionTimes.get(cid) || new Map()).get(u)) || 0 }]))]));
  const spots = new Map([...store.spots].filter(([, s]) => s.shared));
  const input = {
    catches: [...store.catches.values()], derbies: store.derbies, entrants: store.entrants, versions: store.scoring,
    members: [...store.members.values()].filter(m => !m.suspended).map(m => m.id),
    comments: store.comments, reactions, spots, trips: store.trips, rsvps: store.rsvps, leagueStart: leagueStartOf(store.league), series: store.series,
    challenges: store.challenges, name: memberName,
  };
  input.crowns = crownsNow(input);
  input.badges = badgesNow(input);
  return input;
}

/* Badges are replayed from all the data too (some depend on crowns), so cache them the same way. */
let badgeCache = { key: null, value: null };
function badgesNow(input) {
  const key = [store.catches, store.derbies, store.entrants, store.comments, store.reactions, store.spots, store.trips, store.rsvps, leagueStartOf(store.league)];
  if (!badgeCache.key || key.some((k, i) => k !== badgeCache.key[i])) badgeCache = { key, value: badgeTimeline(input) };
  return badgeCache.value;
}

/* Crowns are replayed from all the data, so work them out once per change of data, not on every redraw. */
let crownCache = { key: null, value: null };
export function crownsNow(input) {
  const key = [store.catches, store.derbies, store.entrants, store.comments, store.reactions, store.spots, leagueStartOf(store.league)];
  if (!crownCache.key || key.some((k, i) => k !== crownCache.key[i])) {
    if (!input) return rankInput().crowns; // builds the input, which works the crowns out and caches them
    crownCache = { key, value: crownStandings(input) };
  }
  return crownCache.value;
}
const seasonStart = () => new Date(new Date().getFullYear(), 0, 1).getTime();

let leadersTab = "rank", season = "all";
export function renderLeaders(main, speciesArg, byArg) {
  // Tapping your crowns on a profile opens the Crowns tab.
  try { const t = sessionStorage.getItem("lunker-leaders-tab"); if (t) { leadersTab = t; sessionStorage.removeItem("lunker-leaders-tab"); } } catch {}
  const all = [...store.catches.values()];
  if (speciesArg) return speciesPage(main, all, decodeURIComponent(speciesArg), byArg === "length" ? "length" : "weight");
  const tabs = el("div", { class: "seg tabs-4" }, ...[["rank", "🏆 Ranks"], ["crowns", "👑 Crowns"], ["badges", "🏅 Badges"], ["records", "🐟 Records"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(leadersTab === k), text: label, onclick: () => { leadersTab = k; renderLeaders(main); } })));
  if (leadersTab === "rank") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, rankView(main));
  if (leadersTab === "crowns") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, crownsView());
  if (leadersTab === "badges") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, badgesView());
  const records = speciesRecords(all);
  const v = currentScoring(scoringTimeline(store.scoring)), started = fmtDay(leagueStartOf(store.league));
  fill(main,
    el("h2", { class: "page-title", text: "Leaders" }), tabs,
    el("div", { class: "card stack points-note" },
      el("p", {}, el("b", { text: "👑 League records" }), ` are from league catches since ${started}. ${v.recordPts.some(Boolean) ? `Holding 1st, 2nd or 3rd on a species' weight board or length board is worth ${v.recordPts.join(" / ")} points while you hold it (each board counts). Beat it to take the points.` : "They aren't worth points right now."}`),
      el("p", {}, el("b", { text: "📜 All-time records" }), " include past catches from before the league. Give them props, but they're not worth points.")),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" })
      : records.length ? el("div", { class: "card-list" }, ...records.map(r => el("a", { class: "record-card", href: `#/leaders/${encodeURIComponent(r.species)}` },
          el("div", { class: "record-head" }, el("b", { text: r.species }), el("span", { class: "muted small", text: r.count ? `${r.count} caught in the league` : "Only past catches so far" })),
          r.weight ? holder("👑", "Heaviest", r.weight, fmtWeight(r.weight.weightOz), v.recordPts[0]) : null,
          r.length ? holder("👑", "Longest", r.length, fmtLength(r.length.lengthIn), v.recordPts[0]) : null,
          !r.weight && !r.length && r.count ? el("p", { class: "muted small", text: "No league record yet: weigh or measure one to set it." }) : null,
          r.allTimeWeight ? holder("📜", "All-time heaviest", r.allTimeWeight, fmtWeight(r.allTimeWeight.weightOz), 0) : null,
          r.allTimeLength ? holder("📜", "All-time longest", r.allTimeLength, fmtLength(r.allTimeLength.lengthIn), 0) : null)))
      : el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.trophy }),
          el("p", { text: "No records yet. Log a catch to set the first one." }),
          el("a", { class: "btn lime", href: "#/log", text: "Log a catch" })));
}

/* ---------- Angler rankings ---------- */
function rankView(main) {
  const rows = rankings(rankInput(), { since: season === "season" ? seasonStart() : -Infinity });
  const year = new Date().getFullYear();
  return el("div", { class: "stack" },
    el("div", { class: "seg" }, ...[["all", "All-time"], ["season", `${year} season`]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(season === k), text: label, onclick: () => { season = k; renderLeaders(main); } }))),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" }) : el("ol", { class: "board" }, ...rows.map((r, i) => {
      const m = who(r.uid);
      return el("li", {}, el("button", { type: "button", class: "board-row rank-row" + (i < 3 && r.points > 0 ? ` top${i + 1}` : "") + (r.uid === uid() ? " me" : ""),
        onclick: () => breakdownSheet(r, i + 1) },
        el("span", { class: "rank", text: r.points > 0 && MEDALS[i] ? MEDALS[i] : String(i + 1) }),
        avatar(m),
        el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }), el("div", { class: "rank-title", text: r.title })),
        el("b", { class: "board-size", text: `${r.points} pts` })));
    })),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "How points work", onclick: howPointsSheet }),
      isAdmin() ? el("a", { class: "btn", href: "#/scoring", text: "Change points" }) : null));
}

const KIND = { catch: "🎣 Catches", limit: "🪝 Limits", species: "🌈 New species", record: "🐟 Records held", crown: "👑 Crowns held", badge: "🏅 Badges", derby: "🏁 Derbies", h2h: "⚔️ Head-to-head" };
function breakdownSheet(r, place) {
  const m = who(r.uid);
  const badges = badgesFor(r.uid, rankInput());
  const recent = [...r.events].sort((a, b) => b.at - a.at).slice(0, 15);
  openSheet(box => box.append(el("div", { class: "stack" },
    el("div", { class: "row" }, avatar(m, "lg"), el("div", {}, el("h2", { text: m.displayName }),
      el("div", { class: "rank-title", text: `${r.title} · #${place} · ${r.points} pts` }))),
    badges.length ? el("div", { class: "badge-row" }, ...badges.map(b => el("span", { class: "trophy", title: b.name }, el("span", { text: b.icon }), el("small", { text: b.name })))) : null,
    el("dl", { class: "facts card" }, ...Object.entries(KIND).map(([k, label]) =>
      el("div", { class: "fact" }, el("dt", { text: label }), el("dd", { text: `${Math.round(r.byKind[k] * 10) / 10} pts` })))),
    recent.length ? el("section", { class: "stack" }, el("h3", { text: "Latest points" }),
      el("ul", { class: "points-list" }, ...recent.map(e => el("li", {},
        el("span", { class: "grow", text: e.label }), el("span", { class: "muted small", text: e.standing ? "now" : fmtDay(e.at) }), el("b", { text: `${e.pts > 0 ? "+" : ""}${e.pts}` }))))) : null,
    el("a", { class: "btn block", href: `#/u/${r.uid}`, text: "View profile", onclick: closeSheet }),
    el("button", { class: "btn quiet block", type: "button", text: "Close", onclick: closeSheet }))));
}

export function howPointsSheet() {
  const line = scoringTimeline(store.scoring), v = currentScoring(line);
  const last = store.scoring[store.scoring.length - 1];
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "How points work" }),
    el("ul", { class: "how-list" },
      el("li", { text: `🎣 ${v.catchPts} per catch (counting up to ${v.dailyCap} a day)` }),
      el("li", { text: `🪝 A stringer earns the day's full catch points (${v.catchPts * v.dailyCap}). If it's your limit, ${v.limitPts} more (once a day)` }),
      el("li", { text: `🌈 ${v.speciesPts} for each species you catch for the first time` }),
      el("li", { text: `🐟 ${v.recordPts.join(" / ")} for holding 1st / 2nd / 3rd on a species' weight board, and the same again on its length board (changes as records fall)` }),
      el("li", { text: `👑 ${v.crownPts} for each crown you hold right now (they move when someone passes you)` }),
      el("li", { text: `🏅 ${v.badgePts} for each badge you earn (yours for good; ${BADGES.length} to collect)` }),
      el("li", { text: `🏁 ${v.derbyPts.join(" / ")} for finishing 1st / 2nd / 3rd in a derby, ${v.participationPts} for fishing one${v.beatPts ? `, and ${v.beatPts} per angler you beat` : ""}` }),
      el("li", { text: `⚔️ ${v.h2hPts} for fishing a head-to-head challenge (at least one fish), ${v.h2hWinPts} more for winning it, and the winner takes the points staked (up to ${v.h2hMaxStake} each). A tie or a vetoed challenge moves nothing` }),
      el("li", { text: "Disqualified catches and test derbies don't count." }),
      el("li", { text: `📜 Past catches (caught before the league start, ${fmtDay(leagueStartOf(store.league))}, or logged more than ${(store.league && store.league.graceDays) ?? 7} days late) count for personal bests and the all-time record boards only: no points, badges or crowns. Record points go to the best league catches.` })),
    el("h3", { text: "Titles" }),
    el("ul", { class: "how-list" }, ...TITLES.map((t, i) => el("li", { text: `${t}: ${v.titles[i]}+ pts` }))),
    last ? el("p", { class: "hint", text: `Points last changed ${fmtDate(last.createdAt)} by ${memberName(last.createdBy)}${last.note ? ` ("${last.note}")` : ""}.` }) : null,
    el("button", { class: "btn block", type: "button", text: "Close", onclick: closeSheet }))));
}

/* ---------- Badges ---------- */
/* Who has the most badges, then every badge with how many anglers have it (tap one for who and when). */
function badgesView() {
  if (!store.catchesLoaded) return el("p", { class: "loading", text: "Loading…" });
  const earned = rankInput().badges;
  const members = [...store.members.values()].filter(m => !m.suspended);
  const count = new Map(members.map(m => [m.id, 0]));
  for (const b of earned) if (count.has(b.uid)) count.set(b.uid, count.get(b.uid) + 1);
  const rows = [...count].sort((a, b) => b[1] - a[1] || who(a[0]).displayName.localeCompare(who(b[0]).displayName));
  const holders = new Map(BADGES.map(b => [b.id, []]));
  for (const e of earned) if (count.has(e.uid)) holders.get(e.badge.id).push(e);
  const v = currentScoring(scoringTimeline(store.scoring));
  return el("div", { class: "stack" },
    el("p", { class: "muted", text: `Badges are kept for good${v.badgePts ? ` and worth ${v.badgePts} point${v.badgePts === 1 ? "" : "s"} each` : ""}. ${BADGES.length} to collect.` }),
    el("h3", { text: "Most badges" }),
    el("ol", { class: "board" }, ...rows.map(([u, n], i) => el("li", {},
      el("a", { class: "board-row" + (i < 3 && n > 0 ? ` top${i + 1}` : "") + (u === uid() ? " me" : ""), href: `#/u/${u}` },
        el("span", { class: "rank", text: n > 0 && MEDALS[i] ? MEDALS[i] : String(i + 1) }), avatar(who(u)),
        el("div", { class: "grow" }, el("div", { class: "name", text: who(u).displayName })),
        el("b", { class: "board-size", text: `${n} of ${BADGES.length}` }))))),
    el("h3", { text: "All badges" }),
    el("div", { class: "card-list" }, ...BADGES.map(b => {
      const list = holders.get(b.id), mine = list.some(e => e.uid === uid());
      return el("button", { type: "button", class: "crown-card" + (mine ? " mine" : ""), onclick: () => badgeHoldersSheet(b, list) },
        el("span", { class: "crown-icon", text: b.icon }),
        el("span", { class: "grow" },
          el("b", { class: "crown-name", text: b.name + (mine ? " ✓" : "") }),
          el("span", { class: "muted small", text: b.desc }),
          list.length ? el("span", { class: "crown-holder" }, ...list.slice(0, 6).map(e => avatar(who(e.uid), "xs")),
            el("span", { class: "muted small", text: `${list.length} of ${members.length} angler${members.length === 1 ? "" : "s"}` }))
            : el("span", { class: "muted small", text: "Nobody yet" })));
    })));
}

function badgeHoldersSheet(b, list) {
  const sorted = [...list].sort((x, y) => x.at - y.at);
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `${b.icon} ${b.name}` }),
    el("p", { class: "muted", text: b.desc }),
    sorted.length ? el("ol", { class: "board" }, ...sorted.map((e, i) => el("li", {},
      el("a", { class: "board-row" + (i === 0 ? " top1" : ""), href: `#/u/${e.uid}`, onclick: closeSheet },
        el("span", { class: "rank", text: i === 0 ? "🥇" : String(i + 1) }), avatar(who(e.uid)),
        el("div", { class: "grow" }, el("div", { class: "name", text: who(e.uid).displayName }),
          i === 0 ? el("div", { class: "muted small", text: "First to earn it" }) : null),
        el("span", { class: "muted small", text: fmtDay(e.at) })))))
      : el("p", { class: "muted", text: "Nobody has earned this one yet. Be the first!" }),
    el("button", { class: "btn quiet block", type: "button", text: "Close", onclick: closeSheet }))));
}

/* ---------- Crowns ---------- */
function crownsView() {
  if (!store.catchesLoaded) return el("p", { class: "loading", text: "Loading…" });
  const v = currentScoring(scoringTimeline(store.scoring));
  return el("div", { class: "stack" },
    el("p", { class: "muted", text: `Each crown sits with whoever has the most right now. Pass the holder to steal it.${v.crownPts ? ` Worth ${v.crownPts} points while you hold it.` : ""}` }),
    el("div", { class: "card-list" }, ...crownsNow().map(s => {
      const h = s.holder && who(s.holder), next = s.board[1];
      return el("button", { type: "button", class: "crown-card" + (s.holder === uid() ? " mine" : ""), onclick: () => crownSheet(s) },
        el("span", { class: "crown-icon", text: s.crown.icon }),
        el("span", { class: "grow" },
          el("b", { class: "crown-name", text: s.crown.name }),
          el("span", { class: "muted small", text: s.crown.desc }),
          h ? el("span", { class: "crown-holder" }, avatar(h, "xs"), el("b", { text: h.displayName }), el("span", { text: crownScore(s.crown, s.score) }))
            : el("span", { class: "muted small", text: "Up for grabs" }),
          next ? el("span", { class: "muted small", text: `Next: ${who(next.uid).displayName}, ${crownScore(s.crown, next.score)}` }) : null));
    })));
}

function crownSheet(s) {
  const recent = [...s.history].reverse().slice(0, 6);
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: `${s.crown.icon} ${s.crown.name}` }),
    el("p", { class: "muted", text: s.crown.desc }),
    s.board.length ? el("ol", { class: "board" }, ...s.board.slice(0, 10).map((b, i) => el("li", {},
      el("a", { class: "board-row" + (b.uid === s.holder ? " top1" : ""), href: `#/u/${b.uid}`, onclick: closeSheet },
        el("span", { class: "rank", text: b.uid === s.holder ? "👑" : String(i + 1) }), avatar(who(b.uid)),
        el("div", { class: "grow" }, el("div", { class: "name", text: who(b.uid).displayName })),
        el("b", { class: "board-size", text: crownScore(s.crown, b.score) })))))
      : el("p", { class: "muted", text: "Nobody has this one yet." }),
    recent.length ? el("section", { class: "stack" }, el("h3", { text: "Crown history" }),
      el("ul", { class: "points-list" }, ...recent.map(h => el("li", {},
        el("span", { class: "grow", text: h.uid ? (h.from ? `${who(h.uid).displayName} took it from ${who(h.from).displayName}` : `${who(h.uid).displayName} claimed it`) : "Nobody holds it" }),
        el("span", { class: "muted small", text: fmtDay(h.at) }))))) : null,
    el("button", { class: "btn quiet block", type: "button", text: "Close", onclick: closeSheet }))));
}

function holder(mark, label, c, size, pts) {
  const m = who(c.uid);
  return el("div", { class: "record-row" + (c.past ? " past" : "") }, el("span", { class: "record-label", text: `${mark} ${label}` }), avatar(m, "xs"),
    el("span", { class: "grow", text: m.displayName + (c.past ? ` (${new Date(c.caughtAt).getFullYear()})` : "") }),
    pts ? el("span", { class: "pts-tag", text: `+${pts} pts` }) : null, el("b", { text: size }));
}

/* A species' board of personal bests: the league board (league catches, worth points by weight) or all-time
   (past catches too, for props). */
let boardScope = "league";
function speciesPage(main, all, species, by) {
  const league = boardScope === "league";
  const board = speciesBoard(league ? all.filter(c => !c.past) : all, species, by);
  const v = currentScoring(scoringTimeline(store.scoring));
  const pts = i => (league ? v.recordPts[i] || 0 : 0);
  const seg = el("div", { class: "seg" }, ...[["weight", "By weight"], ["length", "By length"]].map(([k, label]) =>
    el("a", { class: "seg-link", href: `#/leaders/${encodeURIComponent(species)}/${k}`, "aria-pressed": String(by === k), text: label })));
  const scope = el("div", { class: "seg" }, ...[["league", "👑 League"], ["all", "📜 All-time"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(boardScope === k), text: label, onclick: () => { boardScope = k; speciesPage(main, all, species, by); } })));
  const note = league
    ? (v.recordPts.some(Boolean) ? `League catches since ${fmtDay(leagueStartOf(store.league))}. 1st, 2nd and 3rd ${by === "length" ? "by length" : "by weight"} are worth ${v.recordPts.join(" / ")} points while held: beat them to take the points.` : "League catches only. Record points are turned off right now.")
    : "Everyone's best ever, past catches (📜) included. For props: not worth points.";
  fill(main,
    el("h2", { class: "page-title", text: species }),
    scope, seg, el("p", { class: "hint", text: note }),
    board.length ? el("ol", { class: "board" }, ...board.map((c, i) => {
      const m = who(c.uid);
      return el("li", {}, el("a", { class: "board-row" + (i < 3 ? ` top${i + 1}` : ""), href: `#/c/${c.id}` },
        el("span", { class: "rank", text: MEDALS[i] || String(i + 1) }),
        avatar(m),
        el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }), el("div", { class: "muted small", text: fmtDay(c.caughtAt) + (c.past ? " · 📜 past catch" : "") })),
        pts(i) ? el("span", { class: "pts-tag", text: `+${pts(i)}` }) : null,
        el("b", { class: "board-size", text: by === "length" ? fmtLength(c.lengthIn) : fmtWeight(c.weightOz) }),
        el("img", { class: "thumb sm", src: c.thumb, alt: "", loading: "lazy" })));
    })) : el("p", { class: "muted", text: `No ${species} has been ${by === "length" ? "measured" : "weighed"} yet.` }));
}
