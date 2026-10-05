/* Leaders: angler rankings (points and titles), the league record for every species, and each species'
   leaderboard of personal bests. */
import { el, avatar, fmtDay, fmtDate, fmtWeight, fmtLength, icon, fill, openSheet, closeSheet } from "./ui.js";
import { store, memberName, uid, isAdmin } from "./cloud.js";
import { speciesRecords, speciesBoard } from "./stats.js";
import { rankings, badgesFor, scoringTimeline, currentScoring, TITLES } from "./rank.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const MEDALS = ["🥇", "🥈", "🥉"];

/* Everything the ranking needs, from the live data. */
export function rankInput() {
  return {
    catches: [...store.catches.values()], derbies: store.derbies, entrants: store.entrants, versions: store.scoring,
    members: [...store.members.values()].filter(m => !m.suspended).map(m => m.id),
  };
}
const seasonStart = () => new Date(new Date().getFullYear(), 0, 1).getTime();

let leadersTab = "rank", season = "all";
export function renderLeaders(main, speciesArg, byArg) {
  const all = [...store.catches.values()];
  if (speciesArg) return speciesPage(main, all, decodeURIComponent(speciesArg), byArg === "length" ? "length" : "weight");
  const tabs = el("div", { class: "seg" }, ...[["rank", "🏆 Rankings"], ["records", "👑 Species records"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(leadersTab === k), text: label, onclick: () => { leadersTab = k; renderLeaders(main); } })));
  if (leadersTab === "rank") return fill(main, el("h2", { class: "page-title", text: "Leaders" }), tabs, rankView(main));
  const records = speciesRecords(all);
  fill(main,
    el("h2", { class: "page-title", text: "Leaders" }), tabs,
    el("p", { class: "muted", text: "League records for every species caught. Tap a species to see everyone's personal best." }),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" })
      : records.length ? el("div", { class: "card-list" }, ...records.map(r => el("a", { class: "record-card", href: `#/leaders/${encodeURIComponent(r.species)}` },
          el("div", { class: "record-head" }, el("b", { text: r.species }), el("span", { class: "muted small", text: `${r.count} caught` })),
          r.weight ? holder("Heaviest", r.weight, fmtWeight(r.weight.weightOz)) : null,
          r.length ? holder("Longest", r.length, fmtLength(r.length.lengthIn)) : null)))
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

const KIND = { catch: "🎣 Catches", limit: "🪝 Limits", species: "🌈 New species", record: "👑 Records held", derby: "🏁 Derbies" };
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
        el("span", { class: "grow", text: e.label }), el("span", { class: "muted small", text: e.standing ? "now" : fmtDay(e.at) }), el("b", { text: `+${e.pts}` }))))) : null,
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
      el("li", { text: `👑 ${v.recordPts.join(" / ")} for holding 1st / 2nd / 3rd on a species' weight board (changes as records fall)` }),
      el("li", { text: `🏁 ${v.derbyPts.join(" / ")} for finishing 1st / 2nd / 3rd in a derby, ${v.participationPts} for fishing one${v.beatPts ? `, and ${v.beatPts} per angler you beat` : ""}` }),
      el("li", { text: "Disqualified catches and test derbies don't count." })),
    el("h3", { text: "Titles" }),
    el("ul", { class: "how-list" }, ...TITLES.map((t, i) => el("li", { text: `${t}: ${v.titles[i]}+ pts` }))),
    last ? el("p", { class: "hint", text: `Points last changed ${fmtDate(last.createdAt)} by ${memberName(last.createdBy)}${last.note ? ` ("${last.note}")` : ""}.` }) : null,
    el("button", { class: "btn block", type: "button", text: "Close", onclick: closeSheet }))));
}

function holder(label, c, size) {
  const m = who(c.uid);
  return el("div", { class: "record-row" }, el("span", { class: "record-label", text: `👑 ${label}` }), avatar(m, "xs"),
    el("span", { class: "grow", text: m.displayName }), el("b", { text: size }));
}

function speciesPage(main, all, species, by) {
  const board = speciesBoard(all, species, by);
  const seg = el("div", { class: "seg" }, ...[["weight", "By weight"], ["length", "By length"]].map(([k, label]) =>
    el("a", { class: "seg-link", href: `#/leaders/${encodeURIComponent(species)}/${k}`, "aria-pressed": String(by === k), text: label })));
  fill(main,
    el("h2", { class: "page-title", text: species }),
    seg,
    board.length ? el("ol", { class: "board" }, ...board.map((c, i) => {
      const m = who(c.uid);
      return el("li", {}, el("a", { class: "board-row" + (i < 3 ? ` top${i + 1}` : ""), href: `#/c/${c.id}` },
        el("span", { class: "rank", text: MEDALS[i] || String(i + 1) }),
        avatar(m),
        el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }), el("div", { class: "muted small", text: fmtDay(c.caughtAt) })),
        el("b", { class: "board-size", text: by === "length" ? fmtLength(c.lengthIn) : fmtWeight(c.weightOz) }),
        el("img", { class: "thumb sm", src: c.thumb, alt: "", loading: "lazy" })));
    })) : el("p", { class: "muted", text: `No ${species} has been ${by === "length" ? "measured" : "weighed"} yet.` }));
}
