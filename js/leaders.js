/* Leaders: the league record for every species, and each species' leaderboard of personal bests. */
import { el, avatar, fmtDay, fmtWeight, fmtLength, icon, fill } from "./ui.js";
import { store, memberName } from "./cloud.js";
import { speciesRecords, speciesBoard } from "./stats.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const MEDALS = ["🥇", "🥈", "🥉"];

export function renderLeaders(main, speciesArg, byArg) {
  const all = [...store.catches.values()];
  if (speciesArg) return speciesPage(main, all, decodeURIComponent(speciesArg), byArg === "length" ? "length" : "weight");
  const records = speciesRecords(all);
  fill(main, 
    el("h2", { class: "page-title", text: "Leaders" }),
    el("p", { class: "muted", text: "League records for every species caught. Tap a species to see everyone's personal best." }),
    !store.catchesLoaded ? el("p", { class: "loading", text: "Loading…" })
      : records.length ? el("div", { class: "card-list" }, ...records.map(r => el("a", { class: "record-card", href: `#/leaders/${encodeURIComponent(r.species)}` },
          el("div", { class: "record-head" }, el("b", { text: r.species }), el("span", { class: "muted small", text: `${r.count} caught` })),
          r.weight ? holder("Heaviest", r.weight, fmtWeight(r.weight.weightOz)) : null,
          r.length ? holder("Longest", r.length, fmtLength(r.length.lengthIn)) : null)))
      : el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.trophy }),
          el("p", { text: "No records yet. Log a catch to set the first one." }),
          el("a", { class: "btn lime", href: "#/log", text: "Log a catch" })),
    anglers(all),
    el("p", { class: "hint center", text: "Angler rankings, with points for catches and derby wins, are coming in a later update." }));
}

function anglers(all) {
  const members = [...store.members.values()].filter(m => !m.suspended).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const count = id => all.filter(c => c.uid === id).length;
  return el("section", { class: "card stack" },
    el("h3", { text: `Anglers (${members.length})` }),
    el("ul", { class: "member-list" }, ...members.map(m => el("li", {},
      el("a", { class: "member-row", href: `#/u/${m.id}` }, avatar(m),
        el("div", { class: "grow" }, el("div", { class: "name", text: m.displayName }),
          el("div", { class: "muted small", text: [m.homeWater, `${count(m.id)} ${count(m.id) === 1 ? "catch" : "catches"}`].filter(Boolean).join(" · ") })))))));
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
