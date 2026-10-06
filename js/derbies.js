/* Derbies: the list, a derby's page (leaderboard, rules, entries, anglers) and the create/edit form. */
import { el, field, avatar, fill, fmtDate, fmtDay, fmtWeight, fmtLength, toast, icon, openSheet, closeSheet, confirmButton, copyText } from "./ui.js";
import { store, uid, isAdmin, isOwner, memberName, endDerbyNow, deleteDerby, saveDerby, setDerbyCancelled, joinDerby, leaveDerby, setDisqualified,
  setPaid, setSettled, watchSettlements, watchMystery, setMystery, subscribe, setTeam } from "./cloud.js";
import { derbyMoney, hasMoney, fmtMoney, ordinal, roundAmt, PAYOUT_PRESETS } from "./payout.js";
import { SCORING, PROOF, DEFAULTS, derbyStatus, STATUS_LABEL, closesAt, derbyEntries, standings, nextDates, mysteryBoard,
  categoryBoards, categoriesOf, derbySpecies, teamBoard } from "./derby.js";
import { SPECIES, normalizeSpecies } from "./species.js";
import { tripsSection } from "./trips.js";
import { seriesSection } from "./seriespage.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const MEDALS = ["🥇", "🥈", "🥉"];
const catches = () => [...store.catches.values()];
const entrantsOf = id => store.entrants.get(id) || new Map();
const isOrganiser = d => d.organiserUid === uid() || isAdmin();

export function scoreText(d, row) {
  if (d.scoring === "heaviest") return fmtWeight(row.score);
  if (d.scoring === "longest") return fmtLength(row.score);
  if (d.scoring === "bag") return `${fmtWeight(row.score)} (${row.fish.length} fish)`;
  if (d.scoring === "most") return `${row.score} fish`;
  return `${row.score} species`;
}

/* "3 h 20 min", "2 days" */
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
}
function when(d, now = Date.now()) {
  const st = derbyStatus(d, now);
  if (st === "upcoming") return `Starts in ${span(d.start - now)} · ${fmtDate(d.start)}`;
  if (st === "active") return `Ends in ${span(d.end - now)} · ${fmtDate(d.end)}`;
  if (st === "closing") return `Fishing's over. Late entries close in ${span(closesAt(d) - now)}`;
  if (st === "cancelled") return "This derby was cancelled";
  return `Finished ${fmtDay(d.end)}`;
}

/* ---------- List (the Events tab: trips, then derbies) ---------- */
export function renderDerbies(main) {
  const all = [...store.derbies.values()];
  const now = Date.now();
  const group = sts => all.filter(d => sts.includes(derbyStatus(d, now)));
  const live = group(["active", "closing"]).sort((a, b) => a.end - b.end);
  const upcoming = group(["upcoming"]).sort((a, b) => a.start - b.start);
  const done = group(["ended"]).sort((a, b) => b.end - a.end);
  const cancelled = group(["cancelled"]).sort((a, b) => b.start - a.start);
  const section = (title, list) => list.length ? el("section", { class: "stack" }, el("h3", { text: title }),
    el("div", { class: "card-list" }, ...list.map(derbyCard))) : null;
  fill(main,
    el("h2", { class: "page-title", text: "Events" }),
    tripsSection(),
    seriesSection(),
    el("div", { class: "row spread" }, el("h3", { text: "🏁 Derbies" }),
      el("a", { class: "btn lime small", href: "#/dnew", html: icon.plus }, "New derby")),
    !all.length ? el("div", { class: "card empty" }, el("div", { class: "empty-art", html: icon.flag }),
      el("p", { text: "No derbies yet. Set one up, pick the rules, and let the league battle it out." }),
      el("a", { class: "btn lime", href: "#/dnew", text: "Set up a derby" })) : null,
    section("Live now", live), section("Coming up", upcoming), section("Finished", done), section("Cancelled", cancelled));
}

function derbyCard(d) {
  const st = derbyStatus(d), ent = entrantsOf(d.id);
  const top = st === "upcoming" || st === "cancelled" ? null : standings(d, catches(), ent)[0];
  return el("a", { class: "derby-card", href: `#/d/${d.id}` },
    el("div", { class: "row spread" }, el("b", { class: "derby-name", text: d.name }),
      el("span", { class: "pills" }, d.testing ? el("span", { class: "pill testing", text: "TEST" }) : null, el("span", { class: `pill ${st}`, text: STATUS_LABEL[st] }))),
    el("div", { class: "muted small", text: when(d) }),
    el("div", { class: "derby-meta" },
      el("span", { text: categoriesOf(d) ? `🏁 ${categoriesOf(d).length} categories` : `🏁 ${(SCORING[d.scoring] || {}).label || ""}${d.scoring === "bag" ? ` (${d.bagSize})` : ""}` }),
      el("span", { text: `👥 ${ent.size}` }),
      d.mystery ? el("span", { text: "🎯 Mystery weight" }) : null,
      teamsOf(d) ? el("span", { text: `👥 ${teamsOf(d).length} teams` }) : null,
      ent.has(uid()) ? el("span", { class: "badge pb", text: "You're in" }) : null),
    top ? el("div", { class: "derby-leader" }, el("span", { text: st === "ended" ? "🏆 Winner" : "👑 Leading" }), avatar(who(top.uid), "xs"),
      el("b", { text: who(top.uid).displayName }), el("span", { text: scoreText(d, top) })) : null);
}

/* ---------- One derby ---------- */
let derbyTab = "board";
const boardPick = new Map(); // derby id -> which category board is showing
export function renderDerby(main, id) {
  const d = store.derbies.get(id);
  if (!d) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.derbies.size ? "This derby doesn't exist." : "Loading…" })));
  const st = derbyStatus(d), ent = entrantsOf(id), joined = ent.has(uid());
  const all = catches();
  const boards = categoryBoards(d, all, ent);
  const entries = derbyEntries(d, all, ent);
  const open = st === "active" || st === "closing";
  const canEnter = joined && open;
  const organiserHere = d.organiserUid === uid(); // the person who created it

  const head = el("section", { class: `derby-head ${st}` },
    el("span", { class: "pills" }, el("span", { class: `pill ${st}`, text: STATUS_LABEL[st] }),
      d.testing ? el("span", { class: "pill testing", text: "TEST DERBY" }) : null),
    el("h2", { text: d.name }),
    el("p", { class: "derby-when", text: when(d) }),
    d.description ? el("p", { text: d.description }) : null,
    d.prizeNote ? el("p", { class: "prize", text: `🏆 ${d.prizeNote}` }) : null,
    store.series.get(d.seriesId) ? el("a", { class: "series-link", href: `#/s/${d.seriesId}`, text: `🏆 Counts toward ${store.series.get(d.seriesId).name}` }) : null,
    el("p", { class: "small", text: `Organised by ${who(d.organiserUid).displayName} · ${ent.size} ${ent.size === 1 ? "angler" : "anglers"}` }));

  const actions = el("div", { class: "row" },
    canEnter ? el("a", { class: "btn lime", href: `#/enter/${id}`, html: icon.plus }, "Enter a catch") : null,
    organiserHere && open && ent.size ? el("a", { class: "btn", href: `#/enter/${id}`, text: "Enter for an angler" }) : null,
    !joined && (st === "upcoming" || st === "active") ? el("button", { class: "btn primary", type: "button", text: "Join this derby",
      onclick: () => teamsOf(d) ? teamSheet(d, team => { joinDerby(id, team); toast(`You're in ${d.name}. Tight lines!`); })
        : (joinDerby(id), toast(`You're in ${d.name}. Tight lines!`)) }) : null,
    el("a", { class: "btn", href: `#/dchat/${id}`, html: icon.chat }, "Chat"));

  // Team derbies: which team you're on, and switching (yourself until it starts; the organiser any time).
  const myTeam = joined && teamsOf(d) ? teamName(d, (ent.get(uid()) || {}).team) : null;
  const canSwitch = joined && teamsOf(d) && (st === "upcoming" || isOrganiser(d)) && st !== "ended";
  const teamLine = joined && teamsOf(d) ? el("div", { class: "card row spread team-line" },
    el("span", { text: myTeam ? `👥 Your team: ${myTeam}` : "👥 You haven't picked a team yet." }),
    canSwitch || !myTeam ? el("button", { class: "btn small" + (myTeam ? "" : " primary"), type: "button", text: myTeam ? "Switch" : "Pick a team",
      onclick: () => teamSheet(d, team => { setTeam(id, uid(), team); toast(`You're on ${teamName(d, team)}.`); }) }) : null) : null;
  if (d.mystery && (isOrganiser(d) || st === "ended")) watchMystery(id, { live: isOrganiser(d) });
  const money = hasMoney(d) ? derbyMoney(d, all, ent, { mysteryOz: (store.mystery.get(id) || {}).weightOz || null }) : null;
  if (derbyTab === "money" && !money) derbyTab = "board";
  const tabList = [["board", "Board"], ["entries", "Entries"], ["rules", "Rules"], ["anglers", "Anglers"]];
  if (money) tabList.splice(1, 0, ["money", "💵 Money"]);
  const tabs = el("div", { class: "seg tabs-" + tabList.length }, ...tabList.map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(derbyTab === k), text: label, onclick: () => { derbyTab = k; renderDerby(main, id); } })));

  let body;
  if (derbyTab === "entries") body = entriesView(d, entries);
  else if (derbyTab === "rules") body = rulesView(d);
  else if (derbyTab === "anglers") body = anglersView(d, ent, entries);
  else if (derbyTab === "money") body = moneyView(d, money, ent, st);
  else {
    // Several categories: one board at a time, picked with chips.
    // Team derbies add a Teams board after the others.
    const names = [...boards.map(x => (x.cat ? x.cat.name : "Anglers")), ...(teamsOf(d) ? ["👥 Teams"] : [])];
    const at = Math.min(boardPick.get(id) || 0, names.length - 1), b = boards[Math.min(at, boards.length - 1)];
    const onTeams = teamsOf(d) && at === names.length - 1;
    const pick = names.length > 1 ? el("div", { class: "chips board-pick" }, ...names.map((nm, i) =>
      el("button", { type: "button", class: "chip removable", "aria-pressed": String(i === at), text: nm,
        onclick: () => { boardPick.set(id, i); renderDerby(main, id); } }))) : null;
    const won = money ? (money.parts.length ? new Map((money.parts[at] || { places: [] }).places.map(p => [p.uid, roundAmt(p.net, d.roundTo || 0)])) : null) : null;
    body = el("div", { class: "stack" }, d.mystery ? mysteryCard(d, entries, st) : null, pick,
      onTeams ? teamsView(d, boards[0].d, all, ent, st)
        : [b.cat ? el("p", { class: "muted small", text: categoryText(b.cat) }) : null, boardView(b.d, b.rows, st, money, won)]);
  }

  const canDelete = isOwner() || (organiserHere && d.testing);
  const organiser = isOrganiser(d) ? el("section", { class: "card stack" },
    el("h3", { text: "Organiser" }),
    el("div", { class: "row" },
      el("a", { class: "btn", href: `#/dedit/${id}`, text: "Edit derby" }),
      st === "active" ? confirmButton("End derby now", "Tap again to end it", () => { endDerbyNow(id); toast("Derby ended. Late entries can still arrive."); }, "btn") : null),
    el("div", { class: "row" },
      d.cancelled
        ? el("button", { class: "btn", type: "button", text: "Un-cancel", onclick: () => setDerbyCancelled(id, false) })
        : confirmButton("Cancel derby", "Tap again to cancel", () => { setDerbyCancelled(id, true); toast("Derby cancelled."); }),
      canDelete ? el("button", { class: "btn danger", type: "button", text: "Delete derby", onclick: () => deleteSheet(d) }) : null),
    el("p", { class: "hint", text: st === "ended"
      ? "This derby has finished. Editing it now (for example its times) can change the results, so only fix real mistakes."
      : "You can disqualify entries on the Entries tab." + (canDelete ? "" : " Only test derbies can be deleted (or any derby, by the league owner), so real results stay in the league's history.") })) : null;

  const leave = joined && st !== "ended" && st !== "cancelled"
    ? confirmButton("Leave this derby", "Tap again to leave", () => { leaveDerby(id); toast("You left the derby."); }, "btn quiet block") : null;

  // Anyone can start a new derby from this one's settings.
  const copy = el("a", { class: "btn quiet block", href: `#/dcopy/${id}`, text: "📋 Copy this derby" });
  fill(main, head, actions, teamLine, tabs, body, organiser, copy, leave);
}

function deleteSheet(d) {
  const entries = [...store.catches.values()].filter(c => c.derbyId === d.id);
  const n = entries.length;
  openSheet(box => {
    const withEntries = el("input", { type: "checkbox", checked: !!d.testing });
    const msg = el("p", { class: "msg" });
    const go = el("button", { class: "btn danger block", type: "button", text: "Delete for good" });
    go.addEventListener("click", async () => {
      if (!navigator.onLine) { msg.className = "msg err"; msg.textContent = "Deleting a derby needs signal."; return; }
      go.disabled = true; msg.className = "msg ok"; msg.textContent = "Deleting…";
      try {
        await deleteDerby(d, { withEntries: withEntries.checked });
        closeSheet(); location.hash = "#/derbies"; toast(`${d.name} was deleted.`);
      } catch (e) {
        console.warn(e); go.disabled = false; msg.className = "msg err";
        msg.textContent = "Some of it couldn't be deleted. Check your signal and try again.";
      }
    });
    box.append(el("div", { class: "stack" },
      el("h2", { text: `Delete ${d.name}?` }),
      el("p", { text: `This removes the derby, who joined, its chat and its payout ticks. It can't be undone.` }),
      n ? el("label", { class: "check" }, withEntries, el("span", { text: `Also delete the ${n} ${n === 1 ? "catch" : "catches"} entered in it` })) : null,
      n ? el("p", { class: "hint", text: "Leave this off to keep them as ordinary catches (they still count for personal bests)." }) : null,
      msg, go,
      el("button", { class: "btn quiet block", type: "button", text: "Keep it", onclick: closeSheet })));
  });
}

/* `won`: what each angler wins on this board (a category's places); by default, everything they win in the derby. */
function boardView(d, rows, st, money, won = null) {
  if (!won) {
    won = new Map();
    if (money) for (const p of money.payees) if (p.payee.uid) won.set(p.payee.uid, p.amount);
  }
  if (st === "upcoming") return el("div", { class: "card empty" }, el("p", { text: `The leaderboard opens when the derby starts. ${when(d)}.` }));
  if (!rows.length) return el("div", { class: "card empty" }, el("p", { text: "No entries yet. First fish takes the lead!" }));
  const final = st === "ended";
  return el("section", { class: "stack" },
    final && rows.length ? podium(d, rows) : null,
    el("ol", { class: "board" }, ...rows.map((r, i) => el("li", {},
      el("a", { class: "board-row" + (i < 3 ? ` top${i + 1}` : ""), href: `#/c/${(r.fish.find(f => f.thumb) || r.fish[0]).id}` },
        el("span", { class: "rank", text: MEDALS[i] || String(i + 1) }),
        avatar(who(r.uid)),
        el("div", { class: "grow" }, el("div", { class: "name", text: who(r.uid).displayName }),
          el("div", { class: "muted small", text: r.fish.length > 1 ? `${r.fish.length} fish counted` : r.fish[0].species })),
        el("div", { class: "board-right" }, el("b", { class: "board-size", text: scoreText(d, r) }),
          won.get(r.uid) ? el("span", { class: "money-chip", text: `💵 ${fmtMoney(won.get(r.uid))}` }) : null))))),
    st === "closing" ? el("p", { class: "hint", text: "Fishing time is over. Entries from anyone who was out of signal can still arrive until final entries close." }) : null);
}

const scoringText = x => `${SCORING[x.scoring].label}${x.scoring === "bag" ? ` (best ${x.bagSize || 5})` : ""}`;
const categoryText = c => [scoringText(c), c.species && c.species.length ? c.species.join(", ") : "Any species"].join(" · ");

/* The mystery weight: secret until final entries close (the rules hide it), except from the organiser and admins. */
const offText = off => (off ? `${fmtWeight(off)} off` : "Spot on!");
function mysteryCard(d, entries, st) {
  const final = st === "ended", canSee = isOrganiser(d) || final;
  if (canSee) watchMystery(d.id, { live: isOrganiser(d) });
  const secret = canSee ? store.mystery.get(d.id) : undefined;
  const title = el("h3", { text: "🎯 Mystery weight" });
  const prize = d.mysteryNote ? el("p", { class: "prize", text: `🏆 ${d.mysteryNote}` }) : null;
  if (!canSee) {
    return el("section", { class: "card stack mystery" }, title,
      el("p", { text: `A secret weight is set. Each angler's weighed fish closest to it wins. Revealed when final entries close, ${fmtDate(closesAt(d))}.` }), prize);
  }
  if (secret === undefined) return el("section", { class: "card stack mystery" }, title, el("p", { class: "muted", text: final ? "Revealing…" : "Loading…" }));
  if (!secret) {
    return el("section", { class: "card stack mystery" }, title, prize,
      el("p", { text: final ? "The organiser never set the weight, so there's no mystery winner." : "You haven't set the weight yet. Edit the derby to set it before it starts." }));
  }
  const counted = entries.filter(e => !e.problem);
  const board = mysteryBoard(d, counted, null, secret.weightOz);
  const line = (r, i) => el("li", { class: "member-row" },
    el("span", { class: "rank", text: MEDALS[i] || String(i + 1) }), avatar(who(r.uid), "sm"),
    el("div", { class: "grow" }, el("div", { class: "name", text: who(r.uid).displayName }),
      el("div", { class: "muted small", text: `${fmtWeight(r.fish.weightOz)} ${r.fish.species}` })),
    el("b", { text: offText(r.off) }));
  return el("section", { class: "card stack mystery" }, title, prize,
    el("p", { class: "mystery-weight", text: final ? `The mystery weight was ${fmtWeight(secret.weightOz)}` : `Hidden from the league: ${fmtWeight(secret.weightOz)}` }),
    board.length ? el("ol", { class: "member-list" }, ...board.slice(0, final ? 3 : 1).map(line))
      : el("p", { class: "muted", text: "No weighed fish entered yet." }),
    !final && board.length ? el("p", { class: "hint", text: "Closest so far. Everyone else sees the weight when final entries close." }) : null,
    final ? el("p", { class: "hint", text: secret.setAt <= d.start ? "The weight was set before the derby started." : `The weight was set ${fmtDate(secret.setAt)}, after the derby started.` }) : null);
}

/* ---------- Teams ---------- */
const teamsOf = d => (d.teams && d.teams.length ? d.teams : null);
const teamName = (d, id) => ((teamsOf(d) || []).find(t => t.id === id) || {}).name || null;
/* A score added up across a team, in the main board's units. */
function teamScoreText(main, score) {
  if (main.scoring === "heaviest" || main.scoring === "bag") return fmtWeight(score) || "0 oz";
  if (main.scoring === "longest") return fmtLength(score) || '0"';
  return main.scoring === "most" ? `${score} fish` : `${score} species`;
}
function teamSheet(d, pick) {
  openSheet(box => box.append(el("div", { class: "stack" },
    el("h2", { text: "Pick your team" }),
    el("p", { class: "hint", text: "Your fish count for your team: its score is everyone's scores added up. You can switch until the derby starts." }),
    ...teamsOf(d).map(t => el("button", { class: "btn block", type: "button", text: `👥 ${t.name}`, onclick: () => { closeSheet(); pick(t.id); } })),
    el("button", { class: "btn quiet block", type: "button", text: "Cancel", onclick: closeSheet }))));
}
function teamsView(d, main, all, ent, st) {
  if (st === "upcoming") return el("div", { class: "card empty" }, el("p", { text: `The team board opens when the derby starts. ${when(d)}.` }));
  const rows = teamBoard(d, all, ent);
  const scoring = categoriesOf(d) ? `${categoriesOf(d)[0].name} scores` : "Scores";
  return el("section", { class: "stack" },
    el("p", { class: "muted small", text: `${scoring} added up across each team.` }),
    el("ol", { class: "board" }, ...rows.map((t, i) => el("li", { class: "team-row" + (i < 3 && t.score ? ` top${i + 1}` : "") },
      el("div", { class: "row spread" },
        el("b", { text: `${t.score ? MEDALS[i] || i + 1 : "·"} ${t.team.name}` }),
        el("b", { class: "board-size", text: teamScoreText(main, t.score) })),
      t.members.length ? el("div", { class: "muted small", text: t.members.map(m =>
        `${who(m.uid).displayName} ${m.row ? scoreText(main, m.row) : "–"}`).join(" · ") }) : el("div", { class: "muted small", text: "Nobody on this team yet." })))));
}

function podium(d, rows) {
  const spot = (r, place) => r ? el("div", { class: `podium-spot p${place}` },
    el("div", { class: "podium-medal", text: MEDALS[place - 1] }), avatar(who(r.uid), place === 1 ? "lg" : ""),
    el("b", { text: who(r.uid).displayName }), el("span", { class: "small", text: scoreText(d, r) }),
    el("div", { class: "podium-block", text: String(place) })) : el("div", { class: `podium-spot p${place}` });
  return el("div", { class: "podium" }, spot(rows[1], 2), spot(rows[0], 1), spot(rows[2], 3));
}

function entriesView(d, entries) {
  if (!entries.length) return el("p", { class: "muted", text: "No entries yet." });
  const org = isOrganiser(d);
  return el("ul", { class: "entry-list" }, ...[...entries].reverse().map(e => el("li", { class: "entry" + (e.problem ? " out" : "") },
    el("a", { href: `#/c/${e.id}` }, el("img", { class: "thumb sm", src: e.thumb, alt: "", loading: "lazy" })),
    el("div", { class: "grow" },
      el("div", {}, el("b", { text: who(e.uid).displayName }), el("span", { class: "muted small", text: ` · ${fmtDate(e.caughtAt)}` })),
      el("div", { text: `${e.species} · ${[fmtWeight(e.weightOz), fmtLength(e.lengthIn)].filter(Boolean).join(" · ")}` }),
      e.captain || e.netman ? el("div", { class: "muted small", text: crewText(e) }) : null,
      e.problem ? el("div", { class: "entry-problem", text: e.problem }) : null,
      store.pending.has(e.id) ? el("span", { class: "badge wait", text: "⏳ Waiting for signal" }) : null),
    org ? (e.dq
      ? el("button", { class: "btn small", type: "button", text: "Reinstate", onclick: () => setDisqualified(e.id, false) })
      : el("button", { class: "btn small danger", type: "button", text: "DQ", onclick: () => dqSheet(e) })) : null)));
}

export function crewText(c) {
  const name = x => !x ? "" : x.uid ? (x.uid === c.uid ? "self" : who(x.uid).displayName) : `${x.guest} (guest)`;
  return [c.captain ? `Captain: ${name(c.captain)}` : "", c.netman ? `Net: ${name(c.netman)}` : ""].filter(Boolean).join(" · ");
}

function dqSheet(e) {
  openSheet(box => {
    const reason = el("input", { type: "text", maxlength: 200, placeholder: "e.g. No scale reading in the photo", "data-focus": "" });
    const form = el("form", { class: "stack" },
      el("h2", { text: "Disqualify this entry?" }),
      el("p", { text: `${who(e.uid).displayName}'s ${e.species}. They'll see the reason. You can reinstate it later.` }),
      field("Reason", reason),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn danger", type: "submit", text: "Disqualify" })));
    form.addEventListener("submit", ev => { ev.preventDefault(); setDisqualified(e.id, true, reason.value || "Disqualified by the organiser"); closeSheet(); });
    box.append(form);
  });
}

function rulesView(d) {
  const rule = (k, v) => el("div", { class: "fact" }, el("dt", { text: k }), el("dd", { text: v }));
  return el("dl", { class: "facts card" },
    ...(categoriesOf(d) ? categoriesOf(d).map(c => rule(`🏁 ${c.name}`, categoryText(c) + (hasMoney(d) && c.pct ? ` · ${c.pct}% of the pot, ${splitOf(c.payoutPcts)}` : "")))
      : [rule("Scoring", `${SCORING[d.scoring].label}${d.scoring === "bag" ? ` — best ${d.bagSize}` : ""}`),
        rule("Species", d.species.length ? d.species.join(", ") : "Any species")]),
    rule("Starts", fmtDate(d.start)),
    rule("Ends", fmtDate(d.end)),
    rule("Late entries", d.syncGraceHours ? `Catches made during the derby can be sent up to ${d.syncGraceHours} h after it ends (for no-signal spots)` : "Must be sent before the end"),
    d.minWeightOz ? rule("Minimum weight", fmtWeight(d.minWeightOz)) : null,
    d.minLengthIn ? rule("Minimum length", fmtLength(d.minLengthIn)) : null,
    rule("Entries per angler", d.maxEntries ? `Up to ${d.maxEntries}` : "No limit"),
    rule("Photo proof", PROOF[d.proof]),
    rule("Spot", d.requireLocation ? "GPS spot required and shared with the league" : "Optional"),
    rule("Release", d.catchRelease ? "Catch and release only" : "Keep or release"),
    rule("Boat crew", d.requireCrew ? "Captain and net man must be named on every entry" : "Optional"),
    store.series.get(d.seriesId) ? rule("Season series", `Counts toward ${store.series.get(d.seriesId).name}: points by place on the main board`) : null,
    teamsOf(d) ? rule("Teams", `${teamsOf(d).map(t => t.name).join(", ")}. A team's score is its anglers' scores added up${categoriesOf(d) ? ` (${categoriesOf(d)[0].name})` : ""}.`) : null,
    d.mystery && categoriesOf(d) && hasMoney(d) && d.mysteryPct ? rule("Mystery share", `${d.mysteryPct}% of the pot to the closest fish`) : null,
    d.mystery ? rule("Mystery weight", `A secret weight is set. Each angler's weighed fish closest to it wins${d.mysteryNote ? ` (${d.mysteryNote})` : ""}. It's revealed when final entries close.`) : null);
}

function anglersView(d, ent, entries) {
  const org = isOrganiser(d);
  const list = [...ent.keys()].sort((a, b) => who(a).displayName.localeCompare(who(b).displayName));
  if (!list.length) return el("p", { class: "muted", text: "Nobody has joined yet." });
  return el("ul", { class: "member-list card" }, ...list.map(id => {
    const n = entries.filter(e => e.uid === id && !e.problem).length;
    const team = teamsOf(d) ? (ent.get(id) || {}).team || "" : null;
    let move = null;
    if (org && teamsOf(d)) {
      move = el("select", { class: "team-move", "aria-label": `Team for ${who(id).displayName}`, onchange: () => setTeam(d.id, id, move.value) },
        el("option", { value: "", text: "No team" }), ...teamsOf(d).map(t => el("option", { value: t.id, text: t.name })));
      move.value = teamName(d, team) ? team : "";
    }
    return el("li", { class: "member-row" }, avatar(who(id)),
      el("div", { class: "grow" }, el("div", { class: "name", text: who(id).displayName }),
        el("div", { class: "muted small", text: [`${n} ${n === 1 ? "entry" : "entries"} counting`, team !== null && !org ? `👥 ${teamName(d, team) || "No team"}` : ""].filter(Boolean).join(" · ") }),
        move),
      org && id !== uid() ? confirmButton("Remove", "Sure?", () => leaveDerby(d.id, id), "btn small quiet") : null);
  }));
}

/* ---------- Money ---------- */
const payeeName = p => p.uid ? who(p.uid).displayName : `${p.guest} (guest)`;
const splitOf = pcts => { pcts = pcts && pcts.length ? pcts : [100]; return pcts.length === 1 ? "winner takes all" : pcts.map((p, i) => `${ordinal(i + 1)} ${p}%`).join(" · "); };
const splitText = d => {
  const pcts = (d.payoutPcts && d.payoutPcts.length ? d.payoutPcts : [100]);
  const places = categoriesOf(d) ? "Each category pays its share by its own split" : pcts.length === 1 ? "Winner takes all" : pcts.map((p, i) => `${ordinal(i + 1)} ${p}%`).join(" · ");
  const cuts = [d.captainPct ? `captain ${d.captainPct}%` : "", d.netmanPct ? `net man ${d.netmanPct}%` : ""].filter(Boolean).join(", ");
  return places + (cuts ? `. Crew cut from each winning: ${cuts}` : "") + `. Rounded ${d.roundTo ? `to the nearest $${d.roundTo}` : "to the cent"}.`;
};

function moneyView(d, m, ent, st) {
  watchSettlements(d.id);
  const org = isOrganiser(d), final = st === "ended";
  const settled = store.settlements.get(d.id) || new Map();
  const list = [...ent.keys()].sort((a, b) => who(a).displayName.localeCompare(who(b).displayName));
  const unpaid = list.filter(u => !(ent.get(u) || {}).paid).length;

  const pot = el("section", { class: "card stack pot" },
    el("div", { class: "pot-total" }, el("span", { text: "Pot" }), el("b", { text: fmtMoney(m.pot) })),
    el("p", { class: "small", text: `${m.paidCount} paid × ${fmtMoney(d.entryFee || 0)}${d.addedMoney ? ` + ${fmtMoney(d.addedMoney)} added` : ""}` }),
    d.sidePotFee ? el("p", { class: "small", text: `Big-fish side pot: ${fmtMoney(m.side.amount)} (${m.side.players} in × ${fmtMoney(d.sidePotFee)}), heaviest single fish takes it` }) : null,
    m.parts.length ? el("ul", { class: "pot-parts" }, ...m.parts.map(p => el("li", {},
      el("span", { text: `${p.name} · ${p.pct}%` }), el("b", { text: fmtMoney(p.pot) })))) : null,
    m.mysteryPending ? el("p", { class: "hint", text: `The mystery weight's ${fmtMoney(m.mysteryPending)} goes to the closest fish once the weight is revealed.` }) : null,
    el("p", { class: "hint", text: splitText(d) + (d.unpaidCanWin ? " Unpaid anglers can still win." : " Only anglers who've paid can win money.") }),
    el("p", { class: "hint", text: "The app only keeps track. Settle up by e-transfer or cash." }));

  const payoutList = el("section", { class: "card stack" },
    el("h3", { text: final ? "Payouts" : "Projected payouts" }),
    !final ? el("p", { class: "hint", text: "If it ended right now. Changes as fish come in and entry fees are ticked off." }) : null,
    m.payees.length ? el("ul", { class: "payout-list" }, ...m.payees.map(p => {
      const s = settled.get(p.key);
      return el("li", { class: "payout" },
        p.payee.uid ? avatar(who(p.payee.uid), "sm") : el("span", { class: "avatar sm guest", text: "G" }),
        el("div", { class: "grow" }, el("b", { text: payeeName(p.payee) }), el("div", { class: "muted small", text: p.why.join(" · ") }),
          s ? el("div", { class: "settled", text: `✓ Paid out ${fmtDay(s.settledAt)}` }) : null),
        el("div", { class: "payout-right" }, el("b", { class: "payout-amount", text: fmtMoney(p.amount) }),
          org && final ? el("button", { type: "button", class: "btn small" + (s ? " quiet" : ""), text: s ? "Undo" : "Paid out",
            onclick: () => setSettled(d.id, p.key, s ? null : p.amount) }) : null));
    })) : el("p", { class: "muted", text: "No payouts yet." }),
    m.unclaimed ? el("p", { class: "hint", text: `${fmtMoney(m.unclaimed)} isn't claimed yet: no paid-up angler has a fish that counts.` }) : null,
    m.payees.length ? el("button", { type: "button", class: "btn block", text: "Copy summary for the chat", onclick: async () => {
      toast(await copyText(summaryText(d, m, final)) ? "Copied. Paste it into the chat." : "Couldn't copy on this phone.");
    } }) : null);

  const paidList = el("section", { class: "card stack" },
    el("h3", { text: `Entry fees${unpaid ? ` (${unpaid} unpaid)` : ""}` }),
    !list.length ? el("p", { class: "muted", text: "Nobody has joined yet." }) : el("ul", { class: "member-list" }, ...list.map(u => {
      const e = ent.get(u) || {};
      return el("li", { class: "member-row" }, avatar(who(u), "sm"),
        el("div", { class: "grow" }, el("div", { class: "name", text: who(u).displayName }),
          el("div", { class: "muted small", text: [e.paid ? `Paid${e.paidAt ? " " + fmtDay(e.paidAt) : ""}` : "Not paid yet",
            d.sidePotFee ? (e.sidePotPaid ? "in the side pot" : "not in the side pot") : ""].filter(Boolean).join(" · ") })),
        org ? el("div", { class: "row" },
          el("button", { type: "button", class: "btn small" + (e.paid ? " lime" : ""), "aria-pressed": String(!!e.paid), text: e.paid ? "✓ Paid" : "Paid?",
            onclick: () => setPaid(d.id, u, { paid: !e.paid }) }),
          d.sidePotFee ? el("button", { type: "button", class: "btn small" + (e.sidePotPaid ? " lime" : ""), "aria-pressed": String(!!e.sidePotPaid),
            text: e.sidePotPaid ? "✓ Side" : "Side?", onclick: () => setPaid(d.id, u, { sidePotPaid: !e.sidePotPaid }) }) : null)
          : el("span", { class: "badge" + (e.paid ? " pb" : ""), text: e.paid ? "✓ Paid" : "Unpaid" }));
    })),
    org ? el("p", { class: "hint", text: "Tap to tick off who has paid. Only you (the organiser) and admins can change these." }) : null);

  return el("div", { class: "stack" }, pot, payoutList, paidList);
}

function summaryText(d, m, final) {
  const lines = [`🏁 ${d.name} — ${final ? "final payouts" : "projected payouts"}`, `Pot ${fmtMoney(m.pot)} (${m.paidCount} paid)`];
  for (const p of m.payees) lines.push(`${payeeName(p.payee)}: ${fmtMoney(p.amount)} (${p.why.join(", ")})`);
  if (m.side && m.side.fish) lines.push(`Big fish: ${who(m.side.fish.uid).displayName}, ${fmtWeight(m.side.fish.weightOz)}`);
  return lines.join("\n");
}

/* ---------- Create / edit ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const t = new Date(ms); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`; };
const num = s => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; };

/* `copyId`: start a new derby from that one's settings, moved on to the same weekday and time in the future. */
/* The form doesn't redraw with live data, so when it's opened before the derbies have loaded (a reload straight onto it),
   show "Loading…" and draw it once the derby arrives or the server confirms it's gone. */
let stopWaiting = () => {};
function waitForDerby(main, derbyId, draw) {
  stopWaiting();
  const hash = location.hash;
  fill(main, el("div", { class: "card empty" }, el("p", { text: "Loading…" })));
  const off = subscribe(() => {
    if (location.hash !== hash) return stopWaiting();
    if (store.derbies.has(derbyId) || store.derbiesFromServer) { stopWaiting(); draw(); }
  });
  stopWaiting = () => { off(); stopWaiting = () => {}; };
}

export function renderDerbyForm(main, id, copyId) {
  const wanted = id || copyId;
  if (wanted && !store.derbies.has(wanted) && !store.derbiesFromServer) return waitForDerby(main, wanted, () => renderDerbyForm(main, id, copyId));
  const editing = id ? store.derbies.get(id) : null;
  if (id && (!editing || !isOrganiser(editing))) return fill(main, el("div", { class: "card" }, el("p", { text: "Only the organiser can edit this derby." })));
  const source = !editing && copyId ? store.derbies.get(copyId) : null;
  if (copyId && !source) return fill(main, el("div", { class: "card empty" }, el("p", { text: "That derby doesn't exist any more." })));
  const d = { ...DEFAULTS, ...(editing || source || {}) };
  if (source) Object.assign(d, nextDates(source.start, source.end), { cancelled: false });
  else if (!editing) {
    const t = new Date(); t.setDate(t.getDate() + (6 - t.getDay() + 7) % 7 || 7); t.setHours(6, 0, 0, 0); // next Saturday, 6 AM
    d.start = t.getTime(); d.end = t.getTime() + 12 * 3600 * 1000;
  }
  const name = el("input", { type: "text", maxlength: 60, autocapitalize: "words", value: d.name, placeholder: "e.g. Walleye Weekend" });
  const desc = el("textarea", { rows: 2, maxlength: 500, placeholder: "Where, launch time, anything else" }); desc.value = d.description;
  const start = el("input", { type: "datetime-local", value: toLocalInput(d.start) });
  const end = el("input", { type: "datetime-local", value: toLocalInput(d.end) });
  const scoring = el("select", {}, ...Object.entries(SCORING).map(([k, v]) => el("option", { value: k, text: v.label })));
  scoring.value = d.scoring;
  const bag = el("input", { type: "text", inputmode: "numeric", value: String(d.bagSize) });
  const bagField = field("Fish in the bag", bag, "Each angler's best this many fish are added up.");
  const syncBag = () => { bagField.hidden = scoring.value !== "bag"; };
  scoring.addEventListener("change", syncBag); syncBag();

  let species = [...d.species];
  const chips = el("div", { class: "chips" });
  const drawChips = () => fill(chips, species.length ? species.map(sp => el("button", { type: "button", class: "chip removable", text: `${sp} ✕`,
    onclick: () => { species = species.filter(x => x !== sp); drawChips(); } })) : el("span", { class: "muted small", text: "Any species counts" }));
  drawChips();
  const spInput = el("input", { type: "text", list: "derby-species", placeholder: "Add a species", autocapitalize: "words" });
  const addSp = () => { const v = normalizeSpecies(spInput.value); if (v && !species.includes(v)) species.push(v); spInput.value = ""; drawChips(); };
  spInput.addEventListener("change", addSp);
  spInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addSp(); } });

  const minLb = el("input", { type: "text", inputmode: "numeric", placeholder: "0", value: d.minWeightOz ? String(Math.floor(d.minWeightOz / 16)) : "" });
  const minOz = el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: d.minWeightOz ? String(d.minWeightOz % 16) : "" });
  const minIn = el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: d.minLengthIn ? String(d.minLengthIn) : "" });
  const maxEntries = el("input", { type: "text", inputmode: "numeric", placeholder: "No limit", value: d.maxEntries ? String(d.maxEntries) : "" });
  const proof = el("select", {}, ...Object.entries(PROOF).map(([k, v]) => el("option", { value: k, text: v })));
  proof.value = d.proof;
  const grace = el("select", {}, ...[0, 2, 6, 12, 24, 48].map(h => el("option", { value: String(h), text: h ? `${h} hours` : "None" })));
  grace.value = String(d.syncGraceHours);
  const check = (label, on, hint) => { const i = el("input", { type: "checkbox", checked: on }); return [i, el("label", { class: "check" }, i, el("span", { text: label })), hint ? el("p", { class: "hint", text: hint }) : null]; };
  const [reqLoc, reqLocRow, reqLocHint] = check("Spot required (GPS, shared with the league)", d.requireLocation, "Each entry must tag its GPS spot, and the spot is shown to everyone.");
  const [cr, crRow] = check("Catch and release only", d.catchRelease);
  const [crew, crewRow, crewHint] = check("Boat crew required (captain and net man)", d.requireCrew, "Each entry names who captained the boat and who netted the fish.");
  const canSetTesting = !editing || isOwner();
  const [testing, testingRow, testingHint] = check("Testing derby", !!d.testing,
    canSetTesting ? "For trying things out. You can delete a test derby (and its entries) when you're done. Can't be changed later." : null);
  testing.disabled = !canSetTesting;
  const prize = el("input", { type: "text", maxlength: 300, value: d.prizeNote, placeholder: "e.g. Loser buys breakfast" });
  // Mystery weight: kept apart from the derby so only the organiser can see it, and locked once the derby starts.
  const mysteryLocked = !!(editing && editing.mystery && Date.now() >= editing.start);
  const [myst, mystRow] = check("🎯 Mystery weight prize", !!d.mystery);
  const mLb = el("input", { type: "text", inputmode: "numeric", placeholder: "0" });
  const mOz = el("input", { type: "text", inputmode: "decimal", placeholder: "0" });
  const mNote = el("input", { type: "text", maxlength: 100, value: d.mysteryNote || "", placeholder: "e.g. $20 Tim's card" });
  const mPct = el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: d.mysteryPct ? String(d.mysteryPct) : "" });
  const mPctField = el("div", { class: "field" }, el("span", { class: "field-label", text: "Mystery weight's share of the pot (optional)" }),
    el("div", { class: "unit-row" }, mPct, el("span", { text: "%" })));
  let mysteryNow = null; // the saved weight, once loaded (editing only)
  const fillMystery = w => { mysteryNow = w || null; if (w) { mLb.value = String(Math.floor(w / 16)); mOz.value = String(Math.round((w % 16) * 10) / 10); } };
  if (editing && editing.mystery) {
    watchMystery(id, { live: true });
    // The form doesn't redraw with live data, so fill the weight in when it arrives (unless it's been typed over).
    const take = () => { const m = store.mystery.get(id); if (!m) return false; if (!mLb.value && !mOz.value) fillMystery(m.weightOz); else mysteryNow = m.weightOz; return true; };
    if (!take()) { const off = subscribe(() => { if (take()) off(); }); }
  }
  for (const x of [myst, mLb, mOz]) x.disabled = mysteryLocked;
  const mysteryBox = el("div", { class: "stack" },
    el("div", { class: "field" }, el("span", { class: "field-label", text: "Secret weight" }),
      el("div", { class: "unit-row" }, mLb, el("span", { text: "lb" }), mOz, el("span", { text: "oz" }))),
    field("Mystery prize (optional)", mNote),
    mPctField,
    el("p", { class: "hint", text: mysteryLocked ? "The mystery weight is locked now that the derby has started."
      : "Only you (and league admins) can see it until final entries close. Each angler's weighed fish closest to it wins. It can't be changed once the derby starts." }));
  const syncMystery = () => { mysteryBox.hidden = !myst.checked; };
  myst.addEventListener("change", syncMystery); syncMystery();
  const dollars = v => el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: v ? String(v) : "" });
  const fee = dollars(d.entryFee), added = dollars(d.addedMoney), side = dollars(d.sidePotFee);
  const presetKey = (d.payoutPcts || [100]).join(",");
  const split = el("select", {}, el("option", { value: "100", text: "Winner takes all" }), el("option", { value: "70,30", text: "70% / 30%" }),
    el("option", { value: "60,30,10", text: "60% / 30% / 10%" }), el("option", { value: "50,30,20", text: "50% / 30% / 20%" }),
    el("option", { value: "custom", text: "Custom…" }));
  split.value = PAYOUT_PRESETS[presetKey] ? presetKey : "custom";
  const custom = el("input", { type: "text", inputmode: "decimal", value: presetKey.replace(/,/g, ", "), placeholder: "e.g. 60, 25, 15" });
  const customField = field("Custom split (% for 1st, 2nd, 3rd…)", custom, "Must add up to 100.");
  const syncSplit = () => { customField.hidden = split.value !== "custom"; };
  split.addEventListener("change", syncSplit); syncSplit();
  const pct = v => el("input", { type: "text", inputmode: "decimal", placeholder: "0", value: v ? String(v) : "" });
  const capPct = pct(d.captainPct), netPct = pct(d.netmanPct);
  const roundTo = el("select", {}, el("option", { value: "1", text: "Nearest $1" }), el("option", { value: "5", text: "Nearest $5" }), el("option", { value: "0", text: "Exact (to the cent)" }));
  roundTo.value = String(d.roundTo ?? 1);
  const [unpaidWin, unpaidWinRow] = check("Unpaid anglers can still win money", !!d.unpaidCanWin);
  const splitField = el("div", { class: "field" }, el("span", { class: "field-label", text: "Payout split" }), split);
  const moneyBox = el("div", { class: "stack" },
    splitField, customField,
    field("Added money ($, optional)", added, "From a sponsor or the organiser, on top of the entry fees."),
    unpaidWinRow,
    el("div", { class: "field" }, el("span", { class: "field-label", text: "Crew cuts (% of each winning)" }),
      el("div", { class: "unit-row" }, capPct, el("span", { text: "% captain" }), netPct, el("span", { text: "% net man" }))),
    el("p", { class: "hint", text: "Taken from a winner's money for the captain and net man of their boat. No cut when it's the angler themselves." }),
    field("Big-fish side pot ($ per angler, optional)", side, "A separate pot: everyone who pays in, the heaviest single fish takes it all."),
    field("Rounding", roundTo, "Any rounding difference goes to (or comes off) 1st place."));
  // Categories: several boards in one derby, each with its own species, scoring, share of the pot and place split.
  const MAX_CATS = 6;
  let cats = (d.categories || []).map(c => ({ ...c, species: [...(c.species || [])], payoutPcts: [...(c.payoutPcts || [100])] }));
  const [multi, multiRow, multiHint] = check("Several categories", cats.length > 0,
    "E.g. Big Bass and Big Walleye: each gets its own leaderboard, and its own share of the pot when there's an entry fee. The first category is the main one: it decides the derby's places for ranking points.");
  const catList = el("div", { class: "stack" });
  const hasPot = () => num(fee.value) > 0 || num(added.value) > 0;
  const splitSelect = c => {
    const sel = el("select", { class: "split", "aria-label": "Place split" }, ...Object.keys(PAYOUT_PRESETS).map(k =>
      el("option", { value: k, text: k === "100" ? "Winner takes all" : k.split(",").map(x => x + "%").join(" / ") })));
    const k = (c.payoutPcts || [100]).join(",");
    sel.value = PAYOUT_PRESETS[k] ? k : "100";
    sel.addEventListener("change", () => { c.payoutPcts = PAYOUT_PRESETS[sel.value]; });
    return sel;
  };
  const drawCats = () => {
    const pot = hasPot();
    fill(catList, ...cats.map((c, i) => {
      const nm = el("input", { type: "text", maxlength: 30, value: c.name, placeholder: "e.g. Big Bass", oninput: () => { c.name = nm.value; } });
      const sp = el("input", { type: "text", list: "derby-species", value: c.species.join(", "), placeholder: "Any species (or e.g. Largemouth Bass, Smallmouth Bass)",
        onchange: () => { c.species = [...new Set(sp.value.split(",").map(x => normalizeSpecies(x)).filter(Boolean))]; sp.value = c.species.join(", "); } });
      const sc = el("select", { "aria-label": "Scoring" }, ...Object.entries(SCORING).map(([k, v]) => el("option", { value: k, text: v.label })));
      sc.value = c.scoring;
      const bg = el("input", { type: "text", inputmode: "numeric", value: String(c.bagSize || 5), oninput: () => { c.bagSize = Math.min(20, Math.max(1, Math.round(num(bg.value)) || 5)); } });
      const bgField = field("Fish in the bag", bg); bgField.hidden = c.scoring !== "bag";
      sc.addEventListener("change", () => { c.scoring = sc.value; bgField.hidden = c.scoring !== "bag"; });
      const pc = el("input", { type: "text", inputmode: "decimal", value: c.pct ? String(c.pct) : "", placeholder: "0", oninput: () => { c.pct = num(pc.value); } });
      return el("div", { class: "category-edit" },
        el("div", { class: "row spread" }, el("b", { text: i === 0 ? "Main category" : `Category ${i + 1}` }),
          cats.length > 1 ? el("button", { class: "btn small quiet", type: "button", text: "Remove", onclick: () => { cats.splice(i, 1); drawCats(); } }) : null),
        field("Name", nm), field("Species", sp), field("Scoring", sc), bgField,
        pot ? el("div", { class: "field" }, el("span", { class: "field-label", text: "Share of the pot and place split" }),
          el("div", { class: "unit-row" }, pc, el("span", { text: "%" }), splitSelect(c))) : null);
    }),
    cats.length < MAX_CATS ? el("button", { class: "btn block", type: "button", text: "+ Add a category", onclick: () => {
      cats.push({ id: "", name: "", species: [], scoring: "heaviest", bagSize: 5, pct: 0, payoutPcts: [100] }); drawCats();
    } }) : null,
    pot ? el("p", { class: "hint", text: "Shares (and the mystery weight's, if it has one) must add up to 100%." }) : null);
  };
  // Teams: the organiser names them; anglers pick one when they join.
  let teams = (d.teams || []).map(t => ({ ...t }));
  const [teamOn, teamRow, teamHint] = check("Team derby", teams.length > 0,
    "Name the teams (e.g. each boat). Anglers pick one when they join, and a team's score is its anglers' scores added up. You can move people on the Anglers tab.");
  const teamList = el("div", { class: "stack" });
  const drawTeams = () => fill(teamList, ...teams.map((t, i) => {
    const nm = el("input", { type: "text", maxlength: 30, value: t.name, placeholder: `e.g. ${["Matt's boat", "Bully's boat", "Shore crew"][i % 3]}`, oninput: () => { t.name = nm.value; } });
    return el("div", { class: "unit-row" }, nm, teams.length > 2 ? el("button", { class: "btn small quiet", type: "button", text: "✕", "aria-label": "Remove team",
      onclick: () => { teams.splice(i, 1); drawTeams(); } }) : null);
  }), teams.length < 12 ? el("button", { class: "btn block", type: "button", text: "+ Add a team", onclick: () => { teams.push({ id: "", name: "" }); drawTeams(); } }) : null);
  const syncTeams = () => {
    if (teamOn.checked && !teams.length) teams = [{ id: "", name: "" }, { id: "", name: "" }];
    teamList.hidden = !teamOn.checked;
    if (teamOn.checked) drawTeams();
  };
  teamOn.addEventListener("change", syncTeams); syncTeams();
  // Season series: any series that hasn't finished yet (and the one it's already in).
  const seriesOpts = [...store.series.values()].filter(x => x.end >= Date.now() - 30 * 86400000 || x.id === d.seriesId).sort((a, b) => b.start - a.start);
  const seriesSel = el("select", {}, el("option", { value: "", text: "Not part of a series" }), ...seriesOpts.map(x => el("option", { value: x.id, text: x.name })));
  seriesSel.value = store.series.has(d.seriesId) ? d.seriesId : "";
  const singleBox = el("div", { class: "stack" });
  const syncMulti = () => {
    if (multi.checked && !cats.length) {
      // Start from what's already set up, as the main category.
      cats = [{ id: "", name: species.length === 1 ? `Big ${species[0]}` : "Main", species: [...species], scoring: scoring.value,
        bagSize: Math.min(20, Math.max(1, Math.round(num(bag.value)) || 5)), pct: 100, payoutPcts: (d.payoutPcts && d.payoutPcts.length ? d.payoutPcts : [100]) }];
    }
    singleBox.hidden = multi.checked; catList.hidden = !multi.checked; splitField.hidden = multi.checked;
    customField.hidden = multi.checked || split.value !== "custom";
    if (multi.checked) drawCats();
    syncMysteryPct();
  };
  const syncMoney = () => { moneyBox.hidden = !(num(fee.value) > 0) && !(num(side.value) > 0); if (multi.checked) drawCats(); syncMysteryPct(); };
  fee.addEventListener("input", syncMoney); side.addEventListener("input", syncMoney); added.addEventListener("input", syncMoney);
  const syncMysteryPct = () => { mPctField.hidden = !(multi.checked && hasPot()); };
  multi.addEventListener("change", syncMulti); syncMoney(); syncMulti();
  const msg = el("p", { class: "msg" });

  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit derby" : source ? "Copy derby" : "New derby" }),
    source ? el("p", { class: "hint", text: `Copied from ${source.name}: same rules and prizes, moved to ${fmtDate(d.start)}. Change anything before you create it.` }) : null,
    el("section", { class: "card stack" }, field("Name", name), field("Details (optional)", desc), field("Starts", start), field("Ends", end)),
    el("section", { class: "card stack" }, el("h3", { text: "How it's won" }),
      fill(singleBox, field("Scoring", scoring), bagField,
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Species" }), chips, spInput)),
      el("datalist", { id: "derby-species" }, ...SPECIES.map(s => el("option", { value: s }))),
      multiRow, multiHint, catList),
    el("section", { class: "card stack" }, el("h3", { text: "👥 Teams" }), teamRow, teamHint, teamList),
    seriesOpts.length ? el("section", { class: "card stack" }, el("h3", { text: "🏆 Season series" }),
      field("Counts toward", seriesSel, "Places in this derby earn points toward the series' Angler of the Year. Test derbies never count.")) : null,
    el("section", { class: "card stack" }, el("h3", { text: "Rules" }),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Minimum weight" }),
        el("div", { class: "unit-row" }, minLb, el("span", { text: "lb" }), minOz, el("span", { text: "oz" }))),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Minimum length" }),
        el("div", { class: "unit-row" }, minIn, el("span", { text: "inches" }))),
      field("Entries per angler", maxEntries, "Leave blank for no limit. Only each angler's first entries count."),
      field("Photo proof", proof),
      reqLocRow, reqLocHint, crRow, crewRow, crewHint,
      field("Late entries", grace, "Lets catches made during the derby sync afterwards, for anglers who had no signal on the water.")),
    el("section", { class: "card stack" }, testingRow, testingHint,
      editing && !canSetTesting ? el("p", { class: "hint", text: d.testing ? "This is a test derby." : "This is a real derby." }) : null),
    el("section", { class: "card stack" }, el("h3", { text: "💵 Entry fee and prizes" }),
      field("Entry fee ($ per angler)", fee, "Leave at 0 for a free derby. The app only keeps track; settle up by e-transfer or cash."),
      moneyBox,
      field("Prize or bragging rights (optional)", prize)),
    el("section", { class: "card stack" }, mystRow, mysteryBox),
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Create derby" }),
    el("a", { class: "btn quiet block", href: editing ? `#/d/${id}` : "#/derbies", text: "Cancel" }));

  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = t => { msg.className = "msg err"; msg.textContent = t; msg.scrollIntoView({ block: "center", behavior: "smooth" }); };
    if (spInput.value.trim()) addSp();
    const s = new Date(start.value).getTime(), en = new Date(end.value).getTime();
    if (!name.value.trim()) return fail("Give the derby a name.");
    if (!isFinite(s) || !isFinite(en)) return fail("Set when it starts and ends.");
    if (en <= s) return fail("It has to end after it starts.");
    const pcts = (split.value === "custom" ? custom.value : split.value).split(/[,\s/]+/).map(num).filter(x => x > 0);
    if (teamOn.checked) {
      if (teams.length < 2) return fail("A team derby needs at least 2 teams.");
      if (teams.some(t => !t.name.trim())) return fail("Give every team a name.");
      if (new Set(teams.map(t => t.name.trim().toLowerCase())).size !== teams.length) return fail("Each team needs a different name.");
    }
    const useCats = multi.checked, mysteryShare = useCats && myst.checked && hasPot() ? Math.max(0, num(mPct.value)) : 0;
    if (useCats) {
      if (cats.some(c => !c.name.trim())) return fail("Give every category a name.");
      if (new Set(cats.map(c => c.name.trim().toLowerCase())).size !== cats.length) return fail("Each category needs a different name.");
      if (hasPot() && Math.round(cats.reduce((n, c) => n + (c.pct || 0), 0) + mysteryShare) !== 100) return fail("The categories' shares of the pot (and the mystery weight's) have to add up to 100%.");
    } else if (hasPot() && Math.round(pcts.reduce((a, b) => a + b, 0)) !== 100) return fail("The payout split has to add up to 100%.");
    if (num(capPct.value) + num(netPct.value) > 50) return fail("Crew cuts can't add up to more than 50%.");
    const mysteryOz = Math.round((num(mLb.value) * 16 + num(mOz.value)) * 10) / 10;
    if (myst.checked && !mysteryLocked && !(mysteryOz > 0) && !mysteryNow) return fail("Set the secret weight for the mystery prize.");
    if (myst.checked && !mysteryLocked && s <= Date.now() && !(editing && editing.mystery)) return fail("A mystery weight has to be set before the derby starts.");
    const data = {
      ...DEFAULTS, name: name.value.trim().slice(0, 60), description: desc.value.trim().slice(0, 500),
      organiserUid: editing ? editing.organiserUid : uid(), start: s, end: en, syncGraceHours: num(grace.value),
      species, scoring: scoring.value, bagSize: Math.min(20, Math.max(1, Math.round(num(bag.value)) || 5)),
      minWeightOz: Math.round((num(minLb.value) * 16 + num(minOz.value)) * 10) / 10, minLengthIn: Math.round(num(minIn.value) * 4) / 4,
      maxEntries: Math.min(100, Math.max(0, Math.round(num(maxEntries.value)))), proof: proof.value,
      requireLocation: reqLoc.checked, catchRelease: cr.checked, requireCrew: crew.checked, prizeNote: prize.value.trim().slice(0, 300),
      testing: canSetTesting ? testing.checked : !!d.testing,
      cancelled: editing ? !!editing.cancelled : false, createdAt: editing ? editing.createdAt : Date.now(),
      entryFee: Math.max(0, num(fee.value)), addedMoney: Math.max(0, num(added.value)), payoutPcts: pcts.length ? pcts : [100],
      unpaidCanWin: unpaidWin.checked, captainPct: Math.min(50, Math.max(0, num(capPct.value))), netmanPct: Math.min(50, Math.max(0, num(netPct.value))),
      roundTo: +roundTo.value, sidePotFee: Math.max(0, num(side.value)),
      mystery: mysteryLocked ? true : myst.checked, mysteryNote: mNote.value.trim().slice(0, 100),
      categories: [], mysteryPct: mysteryShare, seriesId: seriesSel.value,
      // Teams keep their ids (anglers' picks point at them); new ones get the next free one.
      teams: teamOn.checked ? (() => { const used = new Set(teams.map(t => t.id).filter(Boolean)); let n = 1;
        return teams.map(t => { let tid = t.id; if (!tid) { while (used.has(`t${n}`)) n++; tid = `t${n}`; used.add(tid); }
          return { id: tid, name: t.name.trim().slice(0, 30) }; }); })() : [],
    };
    if (useCats) {
      data.categories = cats.map((c, i) => ({ id: c.id || `c${i + 1}`, name: c.name.trim().slice(0, 30), species: c.species, scoring: c.scoring,
        bagSize: c.bagSize || 5, pct: hasPot() ? Math.max(0, c.pct || 0) : 0, payoutPcts: c.payoutPcts && c.payoutPcts.length ? c.payoutPcts : [100] }));
      // The derby's own fields describe the main category, and its species are everything any category takes.
      Object.assign(data, { scoring: data.categories[0].scoring, bagSize: data.categories[0].bagSize, payoutPcts: data.categories[0].payoutPcts,
        species: derbySpecies(data) });
    }
    const newId = saveDerby(editing ? id : null, data);
    if (!editing) joinDerby(newId); // the organiser is in by default
    // After the derby itself, so the rules can see who organises it.
    if (!mysteryLocked) {
      if (myst.checked && mysteryOz > 0 && mysteryOz !== mysteryNow) setMystery(newId, mysteryOz);
      else if (!myst.checked && editing && editing.mystery) setMystery(newId, null);
    }
    toast(editing ? "Derby updated." : "Derby created. Share it in the chat!");
    location.hash = `#/d/${newId}`;
  });
  fill(main, form);
}
