/* Season series screens: the Events tab section, a series' page (Angler of the Year standings) and the admin form. */
import { el, field, avatar, fill, fmtDay, toast, confirmButton } from "./ui.js";
import { store, isAdmin, memberName, saveSeries, deleteSeries, uid } from "./cloud.js";
import { derbyStatus, STATUS_LABEL } from "./derby.js";
import { DEFAULT_SERIES, seriesDerbies, seriesStatus, seriesStandings } from "./series.js";
import { ordinal } from "./payout.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const MEDALS = ["🥇", "🥈", "🥉"];
const LABEL = { upcoming: "Upcoming", active: "In progress", final: "Final" };
const input = () => ({ derbies: store.derbies, catches: [...store.catches.values()], entrants: store.entrants });
const datesText = s => `${fmtDay(s.start)} to ${fmtDay(s.end)}`;

/* ---------- Events tab ---------- */
export function seriesSection() {
  const all = [...store.series.values()].sort((a, b) => b.start - a.start);
  if (!all.length && !isAdmin()) return null;
  return el("section", { class: "stack" },
    el("div", { class: "row spread" }, el("h3", { text: "🏆 Season series" }),
      isAdmin() ? el("a", { class: "btn small", href: "#/snew", text: "New series" }) : null),
    all.length ? el("div", { class: "card-list" }, ...all.map(seriesCard))
      : el("p", { class: "muted", text: "No series yet. Group derbies into a season series to crown an Angler of the Year." }));
}

function seriesCard(s) {
  const st = seriesStatus(s, store.derbies), rows = seriesStandings(s, input()), n = seriesDerbies(s, store.derbies).length;
  const top = rows[0];
  return el("a", { class: "derby-card", href: `#/s/${s.id}` },
    el("div", { class: "row spread" }, el("b", { class: "derby-name", text: s.name }),
      el("span", { class: `pill ${st === "final" ? "ended" : st === "active" ? "active" : "upcoming"}`, text: LABEL[st] })),
    el("div", { class: "muted small", text: `${datesText(s)} · ${n} ${n === 1 ? "derby" : "derbies"}` }),
    top && top.total ? el("div", { class: "derby-leader" }, el("span", { text: st === "final" ? "🏆 Angler of the Year" : "👑 Leading" }),
      avatar(who(top.uid), "xs"), el("b", { text: who(top.uid).displayName }), el("span", { text: `${top.total} pts` })) : null);
}

/* ---------- One series ---------- */
export function renderSeries(main, id) {
  const s = store.series.get(id);
  if (!s) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.series.size ? "This series doesn't exist." : "Loading…" })));
  const st = seriesStatus(s, store.derbies), rows = seriesStandings(s, input()), derbies = seriesDerbies(s, store.derbies);
  const points = s.points && s.points.length ? s.points : DEFAULT_SERIES.points;
  const champ = st === "final" && rows[0] && rows[0].total ? rows[0] : null;

  const head = el("section", { class: `derby-head ${st === "final" ? "ended" : st === "active" ? "active" : "upcoming"}` },
    el("span", { class: "pills" }, el("span", { class: "pill", text: LABEL[st] })),
    el("h2", { text: `🏆 ${s.name}` }),
    el("p", { class: "derby-when", text: datesText(s) }),
    el("p", { class: "small", text: `Points by place: ${points.map((p, i) => `${ordinal(i + 1)} ${p}`).join(", ")}${s.showUpPts ? `, plus ${s.showUpPts} for fishing a derby` : ""}.`
      + (s.bestOf ? ` Each angler's best ${s.bestOf} ${s.bestOf === 1 ? "derby counts" : "derbies count"}.` : "") }));

  const crown = champ ? el("section", { class: "card stack champion" },
    el("div", { class: "champion-trophy", text: "🏆" }), avatar(who(champ.uid), "lg"),
    el("h3", { text: `${who(champ.uid).displayName} is Angler of the Year` }),
    el("p", { class: "muted", text: `${champ.total} points · ${champ.wins} ${champ.wins === 1 ? "win" : "wins"}` })) : null;

  const table = rows.length ? el("ol", { class: "board" }, ...rows.map((r, i) => el("li", {},
    el("a", { class: "board-row" + (i < 3 ? ` top${i + 1}` : ""), href: `#/u/${r.uid}` },
      el("span", { class: "rank", text: MEDALS[i] || String(i + 1) }), avatar(who(r.uid)),
      el("div", { class: "grow" }, el("div", { class: "name", text: who(r.uid).displayName }),
        el("div", { class: "muted small series-results" }, ...r.results.map(x => el("span", { class: x.counted ? "" : "dropped",
          text: `${x.d.name}: ${x.place ? ordinal(x.place) : "fished"} (${x.pts})` })))),
      el("div", { class: "board-right" }, el("b", { class: "board-size", text: `${r.total} pts` }),
        r.wins ? el("span", { class: "muted small", text: `${r.wins} ${r.wins === 1 ? "win" : "wins"}` }) : null)))))
    : el("div", { class: "card empty" }, el("p", { text: derbies.length ? "Points appear as each derby finishes." : "No derbies in this series yet. Organisers can add theirs from the derby form." }));

  const list = derbies.length ? el("section", { class: "stack" }, el("h3", { text: "Derbies" }),
    el("ul", { class: "member-list card" }, ...derbies.map(d => el("li", {},
      el("a", { class: "member-row", href: `#/d/${d.id}` },
        el("div", { class: "grow" }, el("div", { class: "name", text: d.name }), el("div", { class: "muted small", text: fmtDay(d.start) })),
        el("span", { class: `pill ${derbyStatus(d)}`, text: STATUS_LABEL[derbyStatus(d)] })))))) : null;

  const admin = isAdmin() ? el("section", { class: "card stack" }, el("h3", { text: "Admin" }),
    el("div", { class: "row" }, el("a", { class: "btn", href: `#/sedit/${id}`, text: "Edit series" }),
      confirmButton("Delete series", "Tap again to delete", () => { deleteSeries(id); location.hash = "#/derbies"; toast("Series deleted. Its derbies stay."); })),
    el("p", { class: "hint", text: "Deleting a series doesn't delete its derbies; they just stop counting toward it." })) : null;

  fill(main, head, crown, el("h3", { text: st === "final" ? "Final standings" : "Standings" }), table,
    rows.some(r => r.results.some(x => !x.counted)) ? el("p", { class: "hint", text: "Crossed-out results don't count: only each angler's best ones do." }) : null,
    list, admin);
}

/* ---------- Create / edit (admins) ---------- */
const pad = n => String(n).padStart(2, "0");
const toDate = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fromDate = (v, endOfDay) => { const [y, m, d] = v.split("-").map(Number); return y ? new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0).getTime() : NaN; };

export function renderSeriesForm(main, id) {
  if (!isAdmin()) return fill(main, el("div", { class: "card" }, el("p", { text: "Only league admins can set up a season series." })));
  const editing = id ? store.series.get(id) : null;
  if (id && !editing) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.series.size ? "This series doesn't exist." : "Loading…" })));
  const year = new Date().getFullYear();
  const s = { ...DEFAULT_SERIES, name: `${year} Angler of the Year`, start: new Date(year, 0, 1).getTime(), end: new Date(year, 11, 31, 23, 59, 59).getTime(), ...(editing || {}) };
  const name = el("input", { type: "text", maxlength: 60, value: s.name });
  const start = el("input", { type: "date", value: toDate(s.start) }), end = el("input", { type: "date", value: toDate(s.end) });
  const points = el("input", { type: "text", inputmode: "numeric", value: s.points.join(", ") });
  const showUp = el("input", { type: "text", inputmode: "numeric", value: String(s.showUpPts) });
  const bestOf = el("input", { type: "text", inputmode: "numeric", value: s.bestOf ? String(s.bestOf) : "", placeholder: "Every derby" });
  const msg = el("p", { class: "msg" });
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit series" : "New season series" }),
    el("section", { class: "card stack" }, field("Name", name), field("Starts", start), field("Ends", end, "Angler of the Year is crowned once this date passes and the series' derbies have finished.")),
    el("section", { class: "card stack" }, el("h3", { text: "Points" }),
      field("Points for 1st, 2nd, 3rd…", points, "Places after the last number get none."),
      field("Points for fishing a derby", showUp, "Everyone who joined a finished derby, fish or no fish."),
      field("Count each angler's best", bestOf, "Leave blank to count every derby, or e.g. 4 for their best 4.")),
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Create series" }),
    el("a", { class: "btn quiet block", href: editing ? `#/s/${id}` : "#/derbies", text: "Cancel" }));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = t => { msg.className = "msg err"; msg.textContent = t; };
    const st = fromDate(start.value, false), en = fromDate(end.value, true);
    const pts = points.value.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0).slice(0, 20);
    if (!name.value.trim()) return fail("Give the series a name.");
    if (!isFinite(st) || !isFinite(en) || en <= st) return fail("It has to end after it starts.");
    if (!pts.length) return fail("Give points for at least 1st place.");
    const data = {
      name: name.value.trim().slice(0, 60), start: st, end: en, points: pts,
      showUpPts: Math.min(100, Math.max(0, Math.round(Number(showUp.value) || 0))), bestOf: Math.min(50, Math.max(0, Math.round(Number(bestOf.value) || 0))),
      createdBy: editing ? editing.createdBy : uid(), createdAt: editing ? editing.createdAt : Date.now(),
    };
    const newId = saveSeries(editing ? id : null, data);
    toast(editing ? "Series updated." : "Series created. Organisers can now add their derbies to it.");
    location.hash = `#/s/${newId}`;
  });
  fill(main, form);
}
