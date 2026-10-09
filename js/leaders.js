/* Leaders: angler rankings (points and titles), the league record for every species, and each species'
   leaderboard of personal bests. */
import { el, avatar, fmtDay, fmtDate, fmtWeight, fmtLength, icon, fill, openSheet, closeSheet } from "./ui.js";
import { store, memberName, uid, isAdmin, presentRsvps } from "./cloud.js";
import { speciesRecords, speciesBoard, seasonCatches, leagueStartOf } from "./stats.js";
import { seasonTables, seasonYears, seasonOf, seasonName, isPreseason, careerBest, FIRST_SEASON } from "./season.js";
import { badgesFor, scoringTimeline, currentScoring, TITLES } from "./rank.js";
import { crownSeasons, allSeasonCrowns, crownScore, CROWNS } from "./crowns.js";
import { badgeTimeline, BADGES } from "./badges.js";
import { closesAt as derbyClosesAt } from "./derby.js";
import { closesAt as h2hClosesAt } from "./h2h.js";
import { focusStyle } from "./thumbfocus.js";

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
    comments: store.comments, reactions, spots, trips: store.trips, rsvps: presentRsvps(), allRsvps: store.rsvps, noShows: store.noShows, tripBoats: store.boats, fleet: store.fleet, leagueStart: leagueStartOf(store.league), series: store.series,
    challenges: store.challenges, bets: store.bets, betPlayers: store.betPlayers, name: memberName,
    goals: [...store.goals.values()], skunks: [...store.skunks.values()],
  };
  input.crowns = crownsNow(input);
  input.crownHistory = allSeasonCrowns(crownSeasonsNow(input));
  input.badges = badgesNow(input);
  return input;
}

/* Derbies and challenges finish with time, not with a change of data, so the caches below also redo their work when
   another one has finished (its results, crowns and badges then count). */
function finishedSoFar(now = Date.now()) {
  let n = 0;
  for (const d of store.derbies.values()) if (derbyClosesAt(d) <= now) n++;
  for (const ch of store.challenges.values()) if (ch.status === "accepted" && h2hClosesAt(ch) <= now) n++;
  return n;
}

/* Badges are replayed from all the data too (some depend on crowns), so cache them the same way. */
let badgeCache = { key: null, value: null };
function badgesNow(input) {
  const key = [store.catches, store.derbies, store.entrants, store.comments, store.reactions, store.spots, store.trips, store.rsvps, store.challenges, leagueStartOf(store.league), finishedSoFar(),
    store.noShows, store.boats, store.fleet, seasonOf(Date.now())];
  if (!badgeCache.key || key.some((k, i) => k !== badgeCache.key[i])) badgeCache = { key, value: badgeTimeline(input) };
  return badgeCache.value;
}

/* Crowns are replayed from all the data, so work them out once per change of data (or of season), not on every
   redraw. crownsNow: this season's; crownSeasonsNow: Map(year -> crowns) for every season. */
let crownCache = { key: null, value: null };
export function crownSeasonsNow(input) {
  const key = [store.catches, store.derbies, store.entrants, store.comments, store.reactions, store.spots, store.challenges, leagueStartOf(store.league), finishedSoFar(),
    seasonOf(Date.now())];
  if (!crownCache.key || key.some((k, i) => k !== crownCache.key[i])) {
    if (!input) { rankInput(); return crownCache.value; } // builds the input, which works the crowns out and caches them
    crownCache = { key, value: crownSeasons(input) };
  }
  return crownCache.value;
}
export const crownsNow = input => crownSeasonsNow(input).get(seasonOf(Date.now())) || [];
let leadersTab = "rank", season = null; // null: the current season; a year; or "career"
export function renderLeaders(main, speciesArg, byArg) {
  // Tapping your crowns on a profile opens the Crowns tab.
  try { const t = sessionStorage.getItem("lunker-leaders-tab"); if (t) { leadersTab = t; sessionStorage.removeItem("lunker-leaders-tab"); } } catch {}
  const all = [...store.catches.values()];
  if (speciesArg) return speciesPage(main, all, decodeURIComponent(speciesArg), byArg === "length" ? "length" : "weight");
  const tabs = el("div", { class: "seg tabs-4" }, ...[["rank", "🏆 Ranks"], ["crowns", "👑 Crowns"], ["badges", "🏅 Badges"], ["records", "🐟 Records"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(leadersTab === k), text: label, onclick: () => { leadersTab = k; renderLeaders(main); } })));
  if (leadersTab === "rank") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, rankView(main));
  if (leadersTab === "crowns") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, crownsView(main));
  if (leadersTab === "badges") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, badgesView());
  fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, recordsView(main, all));
}

/* Seasons to pick from (this one, then past ones), plus an all-seasons choice when `extra` gives its label. */
function seasonPicker(main, pick, extra) {
  const now = Date.now(), thisYear = seasonOf(now), years = seasonYears([...store.catches.values()], now);
  return el("div", { class: "seg" }, ...[...years.map(y => [y, y === thisYear ? seasonName(y) : String(y)]), ...(extra ? [["career", extra]] : [])].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(pick === k), text: label, onclick: () => { season = k; renderLeaders(main); } })));
}
const pickedSeason = (allowCareer = true) => {
  const thisYear = seasonOf(Date.now()), years = seasonYears([...store.catches.values()]);
  return (allowCareer && season === "career") || years.includes(season) ? season : thisYear;
};

/* ---------- Records: each season's records (worth points this season), plus the league and all-time records ---------- */
function recordsView(main, all) {
  const pick = pickedSeason(), ever = pick === "career", thisYear = seasonOf(Date.now());
  const year = ever ? thisYear : pick, records = speciesRecords(all, year);
  if (ever) records.sort((a, b) => a.species.localeCompare(b.species));
  const v = currentScoring(scoringTimeline(store.scoring)), live = !ever && year === thisYear;
  const pts = live ? v.recordPts[0] : 0;
  const shown = ever ? records.filter(r => r.weight || r.length || r.leagueWeight || r.leagueLength || r.allTimeWeight || r.allTimeLength) : records;
  return el("div", { class: "stack" },
    seasonPicker(main, pick, "All-time"),
    el("div", { class: "card stack points-note" },
      ever ? el("p", {}, el("b", { text: "🏛️ League records" }), " are the best league catches ever, from every season. The glory, not points.")
        : el("p", {}, el("b", { text: `👑 ${seasonName(year)} records` }), ` are the best league catches of the season. ${!live ? "Points only go to this season's records." : v.recordPts.some(Boolean) ? `Holding 1st, 2nd or 3rd on a species' weight board or length board is worth ${v.recordPts.join(" / ")} points while you hold it (each board counts). The boards start again every January 1.` : "They aren't worth points right now."} 🏛️ shows the league record (the best ever) when a fish from another season holds it.`),
      el("p", {}, el("b", { text: "📜 All-time records" }), " include past catches from before the league. Give them props, but they're not worth points.")),
    el("a", { class: "btn block", href: "#/hof", text: "🏛️ Hall of Fame: every record ever held" }),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" })
      : shown.length ? el("div", { class: "card-list" }, ...shown.map(r => {
          const lw = r.leagueWeight || r.weight, ll = r.leagueLength || r.length;
          return el("a", { class: "record-card", href: `#/leaders/${encodeURIComponent(r.species)}` },
            el("div", { class: "record-head" }, el("b", { text: r.species }),
              ever ? null : el("span", { class: "muted small", text: r.count ? `${r.count} caught this ${isPreseason(year) ? "Preseason" : "season"}` : "None caught yet" })),
            ...(ever ? [
              lw ? holder("🏛️", "Heaviest", lw, fmtWeight(lw.weightOz), 0, true) : null,
              ll ? holder("🏛️", "Longest", ll, fmtLength(ll.lengthIn), 0, true) : null,
            ] : [
              r.weight ? holder("👑", "Heaviest", r.weight, fmtWeight(r.weight.weightOz), pts) : null,
              r.length ? holder("👑", "Longest", r.length, fmtLength(r.length.lengthIn), pts) : null,
              !r.weight && !r.length && r.count ? el("p", { class: "muted small", text: "No season record yet: weigh or measure one to set it." }) : null,
              r.leagueWeight ? holder("🏛️", "Heaviest", r.leagueWeight, fmtWeight(r.leagueWeight.weightOz), 0, true) : null,
              r.leagueLength ? holder("🏛️", "Longest", r.leagueLength, fmtLength(r.leagueLength.lengthIn), 0, true) : null,
            ]),
            r.allTimeWeight ? holder("📜", "All-time heaviest", r.allTimeWeight, fmtWeight(r.allTimeWeight.weightOz), 0) : null,
            r.allTimeLength ? holder("📜", "All-time longest", r.allTimeLength, fmtLength(r.allTimeLength.lengthIn), 0) : null);
        }))
      : el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.trophy }),
          el("p", { text: "No records yet. Log a catch to set the first one." }),
          el("a", { class: "btn lime", href: "#/log", text: "Log a catch" })));
}

/* ---------- Angler rankings ---------- */
/* Opens on the current season (points, titles and places start again every January 1), with past seasons and
   Career (every season added together) a tap away. */
function rankView(main) {
  const now = Date.now(), thisYear = seasonOf(now), pick = pickedSeason();
  const tables = seasonTables(rankInput(), now);
  const career = pick === "career";
  const rows = career ? tables.career : tables.years.get(pick) || [];
  const best = career ? new Map(rows.map(r => [r.uid, careerBest(tables, r.uid, now).title])) : null;
  const note = career ? "Every season added together, the Preseason included. Titles start again every season, so this shows each angler's best one."
    : pick === thisYear && isPreseason(pick) ? `🧪 ${seasonName(pick)}: points count, but unofficially. Everything starts again at 0 on January 1, ${FIRST_SEASON}, for Season 1.`
    : pick === thisYear ? "Points, titles and places start again at 0 every January 1."
    : "Final points: what was earned during the season. Record and crown points only count while they're held, so they're not in a finished season.";
  return el("div", { class: "stack" },
    seasonPicker(main, pick, "Career"),
    el("p", { class: "muted small", text: note }),
    el("a", { class: "btn block", href: career ? "#/awards" : `#/awards/${pick}`, text: `🏆 ${career ? "Season" : seasonName(pick)} awards` }),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" }) : el("ol", { class: "board" }, ...rows.map((r, i) => {
      const m = who(r.uid), b = best && best.get(r.uid);
      const sub = career ? (b ? `Best: ${b.name} (${b.year})` : "") : r.title;
      return el("li", {}, el("button", { type: "button", class: "board-row rank-row" + (i < 3 && r.points > 0 ? ` top${i + 1}` : "") + (r.uid === uid() ? " me" : ""),
        onclick: () => breakdownSheet(r, i + 1, career ? "Career" : seasonName(pick), sub) },
        el("span", { class: "rank", text: r.points > 0 && MEDALS[i] ? MEDALS[i] : String(i + 1) }),
        avatar(m),
        el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }), sub ? el("div", { class: "rank-title", text: sub }) : null),
        el("b", { class: "board-size", text: `${r.points} pts` })));
    })),
    el("div", { class: "row" },
      el("button", { class: "btn", type: "button", text: "How points work", onclick: howPointsSheet }),
      isAdmin() ? el("a", { class: "btn", href: "#/scoring", text: "Change points" }) : null));
}

const KIND = { catch: "🎣 Catches", limit: "🪝 Limits", species: "🌈 New species", record: "🐟 Records held", crown: "👑 Crowns held", badge: "🏅 Badges", derby: "🏁 Derbies", h2h: "⚔️ Head-to-head", noshow: "🫥 No-shows" };
function breakdownSheet(r, place, period, sub) {
  const m = who(r.uid);
  const badges = badgesFor(r.uid, rankInput());
  const recent = [...r.events].sort((a, b) => b.at - a.at).slice(0, 15);
  openSheet(box => box.append(el("div", { class: "stack" },
    el("div", { class: "row" }, avatar(m, "lg"), el("div", {}, el("h2", { text: m.displayName }),
      el("div", { class: "rank-title", text: [period, sub, `#${place}`, `${r.points} pts`].filter(Boolean).join(" · ") }))),
    badges.length ? el("div", { class: "badge-row" }, ...badges.map(b => el("span", { class: "trophy", title: b.name }, el("span", { text: b.icon }), el("small", { text: b.name })))) : null,
    el("dl", { class: "facts card" }, ...Object.entries(KIND).filter(([k]) => k !== "noshow" || r.byKind.noshow).map(([k, label]) =>
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
      el("li", { text: `📅 Points, titles and places start again at 0 every season (January 1). ${seasonOf(Date.now()) < FIRST_SEASON ? `This year is the Preseason: it counts, but unofficially. Season 1 is ${FIRST_SEASON}.` : "Past seasons are kept, and Career adds them all up."}` }),
      el("li", { text: `🎣 ${v.catchPts} per catch (counting up to ${v.dailyCap} a day)` }),
      el("li", { text: `🪝 A stringer earns the day's full catch points (${v.catchPts * v.dailyCap}). If it's your limit, ${v.limitPts} more (once a day)` }),
      el("li", { text: `🌈 ${v.speciesPts} for each species you catch for the first time in a season` }),
      el("li", { text: `🐟 ${v.recordPts.join(" / ")} for holding 1st / 2nd / 3rd on a species' weight board this season, and the same again on its length board (changes as records fall; the boards start again every January 1)` }),
      el("li", { text: `👑 ${v.crownPts} for each crown you hold right now (they move when someone passes you, and start again every season)` }),
      el("li", { text: `🏅 ${v.badgePts} for each badge you earn (yours for good; ${BADGES.length} to collect). The no-show badges are worth nothing` }),
      el("li", { text: `🏁 ${v.derbyPts.join(" / ")} for finishing 1st / 2nd / 3rd in a derby, ${v.participationPts} for fishing one${v.beatPts ? `, and ${v.beatPts} per angler you beat` : ""}` }),
      el("li", { text: `⚔️ ${v.h2hPts} for fishing a head-to-head challenge (at least one fish), ${v.h2hWinPts} more for winning it, and the winner takes the points staked (up to ${v.h2hMaxStake} each). A tie or a vetoed challenge moves nothing` }),
      v.noShowPts ? el("li", { text: `🫥 ${v.noShowPts} taken off each time you're marked a no-show for an outing you said you were In for` }) : null,
      el("li", { text: "Disqualified catches and test derbies don't count." }),
      el("li", { text: `📜 Past catches (caught before the league start, ${fmtDay(leagueStartOf(store.league))}, or logged more than ${(store.league && store.league.graceDays) ?? 7} days late) count for personal bests and the all-time record boards only: no points, badges or crowns. Record points go to the best league catches of the season.` })),
    el("h3", { text: "Titles (by season points)" }),
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
    el("p", { class: "muted", text: `Badges are kept for good${v.badgePts ? ` and worth ${v.badgePts} point${v.badgePts === 1 ? "" : "s"} each (the no-show ones are worth nothing)` : ""}. ${BADGES.length} to collect.` }),
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
/* This season's crowns (they start again every January 1), or who held each one when a past season ended. */
function crownsView(main) {
  if (!store.catchesLoaded) return el("p", { class: "loading", text: "Loading…" });
  const v = currentScoring(scoringTimeline(store.scoring)), year = pickedSeason(false), live = year === seasonOf(Date.now());
  const list = crownSeasonsNow().get(year) || CROWNS.map(crown => ({ crown, holder: null, score: 0, board: [], history: [] }));
  return el("div", { class: "stack" },
    seasonPicker(main, year),
    el("p", { class: "muted", text: live
      ? `Each crown sits with whoever has the most this season. Pass the holder to steal it. They start again every January 1.${v.crownPts ? ` Worth ${v.crownPts} points while you hold it.` : ""}`
      : `Who held each crown when the ${seasonName(year)} ended. Theirs for good.` }),
    el("div", { class: "card-list" }, ...list.map(s => {
      const h = s.holder && who(s.holder), next = s.board[1];
      return el("button", { type: "button", class: "crown-card" + (s.holder === uid() ? " mine" : ""), onclick: () => crownSheet(s) },
        el("span", { class: "crown-icon", text: s.crown.icon }),
        el("span", { class: "grow" },
          el("b", { class: "crown-name", text: s.crown.name }),
          el("span", { class: "muted small", text: s.crown.desc }),
          h ? el("span", { class: "crown-holder" }, avatar(h, "xs"), el("b", { text: h.displayName }), el("span", { text: crownScore(s.crown, s.score) }))
            : el("span", { class: "muted small", text: live ? "Up for grabs" : "Nobody won it" }),
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
        el("span", { class: "grow", text: h.ended ? `Season over: ${who(h.from).displayName} kept it` : h.uid ? (h.from ? `${who(h.uid).displayName} took it from ${who(h.from).displayName}` : `${who(h.uid).displayName} claimed it`) : "Nobody holds it" }),
        el("span", { class: "muted small", text: fmtDay(h.ended ? h.at - 1 : h.at) }))))) : null,
    el("button", { class: "btn quiet block", type: "button", text: "Close", onclick: closeSheet }))));
}

function holder(mark, label, c, size, pts, showYear = false) {
  const m = who(c.uid);
  return el("div", { class: "record-row" + (c.past ? " past" : "") }, el("span", { class: "record-label", text: `${mark} ${label}` }), avatar(m, "xs"),
    el("span", { class: "grow", text: m.displayName + (c.past || showYear ? ` (${new Date(c.caughtAt).getFullYear()})` : "") }),
    pts ? el("span", { class: "pts-tag", text: `+${pts} pts` }) : null, el("b", { text: size }));
}

/* A species' board of personal bests: this season's (worth points), the league's (every season) or all-time
   (past catches too, for props). */
let boardScope = "season";
function speciesPage(main, all, species, by) {
  const year = seasonOf(Date.now()), scope0 = boardScope;
  const pool = scope0 === "season" ? seasonCatches(all, year) : scope0 === "league" ? all.filter(c => !c.past) : all;
  const board = speciesBoard(pool, species, by);
  const v = currentScoring(scoringTimeline(store.scoring));
  const pts = i => (scope0 === "season" ? v.recordPts[i] || 0 : 0);
  const seg = el("div", { class: "seg" }, ...[["weight", "By weight"], ["length", "By length"]].map(([k, label]) =>
    el("a", { class: "seg-link", href: `#/leaders/${encodeURIComponent(species)}/${k}`, "aria-pressed": String(by === k), text: label })));
  const scope = el("div", { class: "seg" }, ...[["season", "👑 Season"], ["league", "🏛️ League"], ["all", "📜 All-time"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(boardScope === k), text: label, onclick: () => { boardScope = k; speciesPage(main, all, species, by); } })));
  const note = scope0 === "season"
    ? (v.recordPts.some(Boolean) ? `League catches from the ${seasonName(year)}. 1st, 2nd and 3rd ${by === "length" ? "by length" : "by weight"} are worth ${v.recordPts.join(" / ")} points while held: beat them to take the points. The board starts again every January 1.` : `League catches from the ${seasonName(year)}. Record points are turned off right now.`)
    : scope0 === "league" ? `Everyone's best league catch since ${fmtDay(leagueStartOf(store.league))}, from every season. The glory, not points.`
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
        el("img", { class: "thumb sm", src: c.thumb, alt: "", loading: "lazy", style: focusStyle(c) })));
    })) : el("p", { class: "muted", text: `No ${species} has been ${by === "length" ? "measured" : "weighed"}${scope0 === "season" ? " this season" : ""} yet.` }));
}
