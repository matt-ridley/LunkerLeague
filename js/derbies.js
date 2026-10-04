/* Derbies: the list, a derby's page (leaderboard, rules, entries, anglers) and the create/edit form. */
import { el, field, avatar, fill, fmtDate, fmtDay, fmtWeight, fmtLength, toast, icon, openSheet, closeSheet, confirmButton } from "./ui.js";
import { store, uid, isAdmin, memberName, saveDerby, setDerbyCancelled, joinDerby, leaveDerby, setDisqualified } from "./cloud.js";
import { SCORING, PROOF, DEFAULTS, derbyStatus, STATUS_LABEL, closesAt, derbyEntries, standings } from "./derby.js";
import { SPECIES, normalizeSpecies } from "./species.js";

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

/* ---------- List ---------- */
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
    el("div", { class: "row spread" }, el("h2", { class: "page-title", text: "Derbies" }),
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
    el("div", { class: "row spread" }, el("b", { class: "derby-name", text: d.name }), el("span", { class: `pill ${st}`, text: STATUS_LABEL[st] })),
    el("div", { class: "muted small", text: when(d) }),
    el("div", { class: "derby-meta" },
      el("span", { text: `🏁 ${(SCORING[d.scoring] || {}).label || ""}${d.scoring === "bag" ? ` (${d.bagSize})` : ""}` }),
      el("span", { text: `👥 ${ent.size}` }),
      ent.has(uid()) ? el("span", { class: "badge pb", text: "You're in" }) : null),
    top ? el("div", { class: "derby-leader" }, el("span", { text: st === "ended" ? "🏆 Winner" : "👑 Leading" }), avatar(who(top.uid), "xs"),
      el("b", { text: who(top.uid).displayName }), el("span", { text: scoreText(d, top) })) : null);
}

/* ---------- One derby ---------- */
let derbyTab = "board";
export function renderDerby(main, id) {
  const d = store.derbies.get(id);
  if (!d) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.derbies.size ? "This derby doesn't exist." : "Loading…" })));
  const st = derbyStatus(d), ent = entrantsOf(id), joined = ent.has(uid());
  const all = catches();
  const rows = standings(d, all, ent);
  const entries = derbyEntries(d, all, ent);
  const canEnter = joined && (st === "active" || st === "closing");

  const head = el("section", { class: `derby-head ${st}` },
    el("span", { class: `pill ${st}`, text: STATUS_LABEL[st] }),
    el("h2", { text: d.name }),
    el("p", { class: "derby-when", text: when(d) }),
    d.description ? el("p", { text: d.description }) : null,
    d.prizeNote ? el("p", { class: "prize", text: `🏆 ${d.prizeNote}` }) : null,
    el("p", { class: "small", text: `Organised by ${who(d.organiserUid).displayName} · ${ent.size} ${ent.size === 1 ? "angler" : "anglers"}` }));

  const actions = el("div", { class: "row" },
    canEnter ? el("a", { class: "btn lime", href: `#/enter/${id}`, html: icon.plus }, "Enter a catch") : null,
    !joined && (st === "upcoming" || st === "active") ? el("button", { class: "btn primary", type: "button", text: "Join this derby",
      onclick: () => { joinDerby(id); toast(`You're in ${d.name}. Tight lines!`); } }) : null,
    el("a", { class: "btn", href: `#/dchat/${id}`, html: icon.chat }, "Chat"));

  const tabs = el("div", { class: "seg" }, ...[["board", "Leaderboard"], ["entries", "Entries"], ["rules", "Rules"], ["anglers", "Anglers"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(derbyTab === k), text: label, onclick: () => { derbyTab = k; renderDerby(main, id); } })));

  let body;
  if (derbyTab === "entries") body = entriesView(d, entries);
  else if (derbyTab === "rules") body = rulesView(d);
  else if (derbyTab === "anglers") body = anglersView(d, ent, entries);
  else body = boardView(d, rows, st);

  const organiser = isOrganiser(d) ? el("section", { class: "card stack" },
    el("h3", { text: "Organiser" }),
    el("div", { class: "row" },
      el("a", { class: "btn", href: `#/dedit/${id}`, text: "Edit derby" }),
      d.cancelled
        ? el("button", { class: "btn", type: "button", text: "Un-cancel", onclick: () => setDerbyCancelled(id, false) })
        : confirmButton("Cancel derby", "Tap again to cancel", () => { setDerbyCancelled(id, true); toast("Derby cancelled."); })),
    el("p", { class: "hint", text: st === "ended"
      ? "This derby has finished. Editing it now (for example its times) can change the results, so only fix real mistakes."
      : "You can disqualify entries on the Entries tab. Derbies can't be deleted, so the results stay in the league's history." })) : null;

  const leave = joined && st !== "ended" && st !== "cancelled"
    ? confirmButton("Leave this derby", "Tap again to leave", () => { leaveDerby(id); toast("You left the derby."); }, "btn quiet block") : null;

  fill(main, head, actions, tabs, body, organiser, leave);
}

function boardView(d, rows, st) {
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
        el("b", { class: "board-size", text: scoreText(d, r) }))))),
    st === "closing" ? el("p", { class: "hint", text: "Fishing time is over. Entries from anyone who was out of signal can still arrive until final entries close." }) : null);
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
    rule("Scoring", `${SCORING[d.scoring].label}${d.scoring === "bag" ? ` — best ${d.bagSize}` : ""}`),
    rule("Species", d.species.length ? d.species.join(", ") : "Any species"),
    rule("Starts", fmtDate(d.start)),
    rule("Ends", fmtDate(d.end)),
    rule("Late entries", d.syncGraceHours ? `Catches made during the derby can be sent up to ${d.syncGraceHours} h after it ends (for no-signal spots)` : "Must be sent before the end"),
    d.minWeightOz ? rule("Minimum weight", fmtWeight(d.minWeightOz)) : null,
    d.minLengthIn ? rule("Minimum length", fmtLength(d.minLengthIn)) : null,
    rule("Entries per angler", d.maxEntries ? `Up to ${d.maxEntries}` : "No limit"),
    rule("Photo proof", PROOF[d.proof]),
    rule("Spot", d.requireLocation ? "GPS spot required and shared with the league" : "Optional"),
    rule("Release", d.catchRelease ? "Catch and release only" : "Keep or release"),
    rule("Boat crew", d.requireCrew ? "Captain and net man must be named on every entry" : "Optional"));
}

function anglersView(d, ent, entries) {
  const org = isOrganiser(d);
  const list = [...ent.keys()].sort((a, b) => who(a).displayName.localeCompare(who(b).displayName));
  if (!list.length) return el("p", { class: "muted", text: "Nobody has joined yet." });
  return el("ul", { class: "member-list card" }, ...list.map(id => {
    const n = entries.filter(e => e.uid === id && !e.problem).length;
    return el("li", { class: "member-row" }, avatar(who(id)),
      el("div", { class: "grow" }, el("div", { class: "name", text: who(id).displayName }),
        el("div", { class: "muted small", text: `${n} ${n === 1 ? "entry" : "entries"} counting` })),
      org && id !== uid() ? confirmButton("Remove", "Sure?", () => leaveDerby(d.id, id), "btn small quiet") : null);
  }));
}

/* ---------- Create / edit ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const t = new Date(ms); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`; };
const num = s => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; };

export function renderDerbyForm(main, id) {
  const editing = id ? store.derbies.get(id) : null;
  if (id && (!editing || !isOrganiser(editing))) return fill(main, el("div", { class: "card" }, el("p", { text: "Only the organiser can edit this derby." })));
  const d = { ...DEFAULTS, ...(editing || {}) };
  if (!editing) {
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
  const prize = el("input", { type: "text", maxlength: 300, value: d.prizeNote, placeholder: "e.g. Loser buys breakfast" });
  const msg = el("p", { class: "msg" });

  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit derby" : "New derby" }),
    el("section", { class: "card stack" }, field("Name", name), field("Details (optional)", desc), field("Starts", start), field("Ends", end)),
    el("section", { class: "card stack" }, el("h3", { text: "How it's won" }), field("Scoring", scoring), bagField,
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Species" }), chips, spInput,
        el("datalist", { id: "derby-species" }, ...SPECIES.map(s => el("option", { value: s }))))),
    el("section", { class: "card stack" }, el("h3", { text: "Rules" }),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Minimum weight" }),
        el("div", { class: "unit-row" }, minLb, el("span", { text: "lb" }), minOz, el("span", { text: "oz" }))),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Minimum length" }),
        el("div", { class: "unit-row" }, minIn, el("span", { text: "inches" }))),
      field("Entries per angler", maxEntries, "Leave blank for no limit. Only each angler's first entries count."),
      field("Photo proof", proof),
      reqLocRow, reqLocHint, crRow, crewRow, crewHint,
      field("Late entries", grace, "Lets catches made during the derby sync afterwards, for anglers who had no signal on the water.")),
    el("section", { class: "card stack" }, field("Prize or bragging rights (optional)", prize,
      "Entry fees and payouts arrive in the next update.")),
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
    const data = {
      ...DEFAULTS, name: name.value.trim().slice(0, 60), description: desc.value.trim().slice(0, 500),
      organiserUid: editing ? editing.organiserUid : uid(), start: s, end: en, syncGraceHours: num(grace.value),
      species, scoring: scoring.value, bagSize: Math.min(20, Math.max(1, Math.round(num(bag.value)) || 5)),
      minWeightOz: Math.round((num(minLb.value) * 16 + num(minOz.value)) * 10) / 10, minLengthIn: Math.round(num(minIn.value) * 4) / 4,
      maxEntries: Math.min(100, Math.max(0, Math.round(num(maxEntries.value)))), proof: proof.value,
      requireLocation: reqLoc.checked, catchRelease: cr.checked, requireCrew: crew.checked, prizeNote: prize.value.trim().slice(0, 300),
      cancelled: editing ? !!editing.cancelled : false, createdAt: editing ? editing.createdAt : Date.now(),
    };
    const newId = saveDerby(editing ? id : null, data);
    if (!editing) joinDerby(newId); // the organiser is in by default
    toast(editing ? "Derby updated." : "Derby created. Share it in the chat!");
    location.hash = `#/d/${newId}`;
  });
  fill(main, form);
}
