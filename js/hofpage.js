/* The Hall of Fame page (#/hof): the season champions, every league record ever held, the longest reigns and the
   record setters. */
import { el, fill, fmtDay, fmtWeight, fmtLength } from "./ui.js";
import { store, memberName } from "./cloud.js";
import { FIELDS, recordHistory, reignLength, longestReigns, recordSetters } from "./halloffame.js";
import { seasonTables, seasonChampions, seasonName, seasonState, potLickers, FIRST_SEASON } from "./season.js";
import { rankInput } from "./leaders.js";

const DAY = 86400000;
const fmtValue = (field, c) => (field === "weightOz" ? fmtWeight(c.weightOz) : fmtLength(c.lengthIn));
const FIELD_NAME = Object.fromEntries(FIELDS);

/* "under a day", "12 days", "5 months", "2.5 years" */
export function fmtSpan(ms) {
  const d = ms / DAY;
  if (d < 1) return "under a day";
  if (d < 60) return `${Math.floor(d)} day${Math.floor(d) === 1 ? "" : "s"}`;
  if (d < 730) return `${Math.floor(d / 30.44)} months`;
  return `${Math.round((d / 365.25) * 10) / 10} years`;
}

const who = uid => el("a", { href: `#/u/${uid}`, text: memberName(uid) });
const fish = (field, c) => el("a", { href: `#/c/${c.id}`, text: fmtValue(field, c) });

function reignRow(field, r, now) {
  const standing = !r.brokenBy;
  return el("li", { class: standing ? "standing" : "" },
    el("div", {}, standing ? "👑 " : "", who(r.c.uid), " · ", fish(field, r.c)),
    el("div", { class: "muted small" }, `Set ${fmtDay(r.from)} · `,
      standing ? `standing for ${fmtSpan(reignLength(r, now))}`
        : el("span", {}, `stood ${fmtSpan(reignLength(r, now))}, broken by `,
            r.brokenBy.uid === r.c.uid ? "themselves" : who(r.brokenBy.uid), ` (${fmtValue(field, r.brokenBy)})`)));
}

/* The Champions wall: each finished season's podium, newest first. */
const MEDALS = ["🥇", "🥈", "🥉"];
function championsWall(now) {
  const wall = store.catchesLoaded ? seasonChampions(seasonTables(rankInput(), now), now) : [];
  const grace = (store.league && store.league.graceDays) ?? 7;
  return el("section", { class: "card stack" },
    el("h3", { text: "🏆 Season champions" }),
    wall.length ? el("ol", { class: "hof-list" }, ...wall.map(s => el("li", {},
      el("div", {}, el("a", { href: `#/awards/${s.year}` }, el("b", { text: seasonName(s.year) })),
        el("span", { class: "muted small", text: [s.preseason ? " (unofficial)" : "", seasonState(s.year, now, grace) === "provisional" ? " · provisional until the final whistle" : ""].join("") })),
      el("div", { class: "stack-tight" }, ...s.podium.map((r, i) => el("span", {}, `${MEDALS[i]} `, who(r.uid), el("span", { class: "muted small", text: ` · ${r.points} pts` })))))))
      : el("p", { class: "muted", text: `No season has finished yet. The ${new Date(now).getFullYear() < FIRST_SEASON ? `Preseason's top anglers go up here (unofficially) after December 31, and Season 1's champion after the ${FIRST_SEASON} Season` : "first champion goes up here when this season ends"}.` }));
}

/* The Official Pot Lickers: the founding anglers who logged a fish in the 2026 Preseason. One time only. */
function potLickersList(now) {
  const list = store.catchesLoaded ? potLickers([...store.catches.values()]) : [];
  const open = new Date(now).getFullYear() < FIRST_SEASON;
  return el("section", { class: "card stack" },
    el("h3", { text: "🥄 Official Pot Lickers" }),
    el("p", { class: "muted small", text: open
      ? "The founding anglers: everyone who logs a fish in the 2026 Preseason. One time only: the list closes for good on December 31."
      : "The founding anglers: everyone who logged a fish in the 2026 Preseason. The list is closed for good." }),
    list.length ? el("ol", { class: "hof-list" }, ...list.map(r => el("li", {}, who(r.uid), el("span", { class: "muted small", text: ` · first fish ${fmtDay(r.at)}` }))))
      : el("p", { class: "muted", text: open ? "Nobody yet. Log a fish to get on it!" : "Nobody made it." }));
}

export function renderHof(main) {
  const now = Date.now();
  const history = recordHistory([...store.catches.values()]);
  const head = [
    el("a", { class: "eyebrow back-link", href: "#/leaders", onclick: () => { try { sessionStorage.setItem("lunker-leaders-tab", "records"); } catch {} }, text: "← Records" }),
    el("h2", { class: "page-title", text: "🏛️ Hall of Fame" }),
    championsWall(now),
    potLickersList(now),
    el("p", { class: "hint", text: "Every league record ever held, from every season: who set it, when, how long it stood and who broke it. League catches only (season records start again every year; these don't)." }),
  ];
  if (!history.size) return fill(main, ...head, el("p", { class: "card empty", text: "No records yet. Log a measured catch to set the first one." }));

  const setters = recordSetters(history).slice(0, 5);
  const longest = longestReigns(history, 5, now);
  fill(main, ...head,
    el("section", { class: "card stack" },
      el("h3", { text: "🏅 Most records set" }),
      el("ol", { class: "hof-list" }, ...setters.map(s => el("li", {}, who(s.uid),
        el("span", { class: "muted small", text: ` · ${s.set} set${s.held ? ` · holds ${s.held} now` : ""}` }))))),
    el("section", { class: "card stack" },
      el("h3", { text: "⏳ Longest reigns" }),
      el("ol", { class: "hof-list" }, ...longest.map(r => el("li", {},
        el("div", {}, el("b", { text: `${r.species} ${FIELD_NAME[r.field].toLowerCase()}` }), " · ", who(r.c.uid), " · ", fish(r.field, r.c)),
        el("div", { class: "muted small", text: `${fmtSpan(reignLength(r, now))}${r.brokenBy ? "" : " and counting 👑"}` }))))),
    el("h3", { text: "By species" }),
    ...[...history].map(([species, h]) => {
      const n = h.weightOz.length + h.lengthIn.length;
      return el("details", { class: "card hof-species" },
        el("summary", {}, el("b", { text: species }), el("span", { class: "muted small", text: ` · ${n} record${n === 1 ? "" : "s"}` })),
        ...FIELDS.filter(([f]) => h[f].length).map(([f, label]) => el("div", { class: "stack-tight" },
          el("h4", { text: label }),
          el("ul", { class: "hof-reigns" }, ...[...h[f]].reverse().map(r => reignRow(f, r, now))))));
    }));
}
