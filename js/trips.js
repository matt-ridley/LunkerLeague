/* Outings (saved as "trips"): "Who's out Saturday?" Anyone can plan one, and everyone answers In / Maybe / Out.
   On a boat outing, anglers bring boats and grab seats (first come, first seated); afterwards the outing shows what
   got caught. The Outings tab on the Events page. */
import { el, field, avatar, fill, fmtDate, fmtDay, fmtWeight, fmtLength, toast, confirmButton, openSheet, closeSheet } from "./ui.js";
import { store, uid, isAdmin, memberName, saveTrip, setRsvp, setSeat, setBoat, deleteTrip } from "./cloud.js";
import { RSVP_ICON } from "./events.js";
import { outingEnd, isBoatOuting, seating, outingRecap } from "./outings.js";
import { isPersonalBest, recordKinds } from "./stats.js";
import { biteTimes } from "./solunar.js";
import { biteDay } from "./bitepage.js";
import { myBoats } from "./fleet.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const ANSWERS = [["in", "In"], ["maybe", "Maybe"], ["out", "Out"]];
const answersOf = id => store.rsvps.get(id) || new Map();
const boatsOf = id => store.boats.get(id) || new Map();
const canManage = t => t.uid === uid() || isAdmin();
const allCatches = () => [...store.catches.values()];
// An outing stays under "Coming up" until it's over.
const isPast = (t, now = Date.now()) => outingEnd(t) < now;
const kindIcon = t => (isBoatOuting(t) ? "🚤" : "🎣");
const sizeOf = c => (c.weightOz > 0 ? fmtWeight(c.weightOz) : fmtLength(c.lengthIn));
const boatName = b => b.name || `${who(b.owner).displayName}'s boat`;

function rsvpButtons(t) {
  const mine = (answersOf(t.id).get(uid()) || {}).answer;
  return el("div", { class: "seg rsvp" }, ...ANSWERS.map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(mine === k), text: `${RSVP_ICON[k]} ${label}`,
      onclick: e => { e.preventDefault(); setRsvp(t.id, k); } })));
}

function counts(t) {
  const n = { in: 0, maybe: 0, out: 0 };
  for (const r of answersOf(t.id).values()) if (n[r.answer] !== undefined) n[r.answer]++;
  return n;
}

/* "2 boats · 1 seat left", or what's needed. */
function seatsLine(t) {
  const s = seating(t, answersOf(t.id), boatsOf(t.id));
  if (!s.boats.length) return s.needsSeat.length ? "No boats yet" : "No boats yet: bring one?";
  const left = s.boats.reduce((n, b) => n + Math.max(0, b.seats - b.riders.length), 0);
  return `${s.boats.length} ${s.boats.length === 1 ? "boat" : "boats"} · ${left ? `${left} ${left === 1 ? "seat" : "seats"} left` : "full"}`
    + (s.needsSeat.length ? ` · ${s.needsSeat.length} need a seat` : "");
}
const recapLine = r => (r.fish ? `${r.fish} fish${r.biggest ? ` · biggest ${who(r.biggest.uid).displayName}'s ${sizeOf(r.biggest)} ${r.biggest.species}` : ""}` : "");

function tripCard(t) {
  const n = counts(t), past = isPast(t), recap = outingRecap(t, allCatches(), answersOf(t.id));
  return el("div", { class: "trip-card" + (past ? " past" : "") },
    el("a", { class: "trip-link", href: `#/t/${t.id}` },
      el("b", { class: "trip-title", text: `${kindIcon(t)} ${t.title}` }),
      el("div", { class: "muted small", text: [fmtDate(t.at), t.place].filter(Boolean).join(" · ") }),
      el("div", { class: "trip-meta" },
        el("span", { text: `Planned by ${who(t.uid).displayName}` }),
        el("span", { text: `✅ ${n.in} · 🤔 ${n.maybe} · ❌ ${n.out}` })),
      isBoatOuting(t) && !past ? el("div", { class: "trip-meta", text: `🚤 ${seatsLine(t)}` }) : null,
      recap.started && recap.fish ? el("div", { class: "trip-recap-line", text: `🐟 ${recapLine(recap)}` }) : null),
    past ? null : rsvpButtons(t));
}

/* The Outings tab of the Events page. */
export function tripsSection() {
  const all = [...store.trips.values()];
  const upcoming = all.filter(t => !isPast(t)).sort((a, b) => a.at - b.at);
  const past = all.filter(t => isPast(t)).sort((a, b) => b.at - a.at).slice(0, 10);
  return el("section", { class: "stack" },
    el("div", { class: "row spread" }, el("h3", { text: "Coming up" }),
      el("a", { class: "btn small lime", href: "#/tnew", text: "Plan an outing" })),
    upcoming.length ? el("div", { class: "card-list" }, ...upcoming.map(tripCard))
      : el("p", { class: "muted", text: "No outings planned. Heading out? Plan an outing and see who's in." }),
    past.length ? el("section", { class: "stack" }, el("h3", { text: "Past outings" }),
      el("div", { class: "card-list" }, ...past.map(tripCard))) : null);
}

/* ---------- One outing ---------- */
export function renderTrip(main, id) {
  try { sessionStorage.setItem("lunker-events-tab", "outings"); } catch {} // "← Events" comes back to Outings
  const t = store.trips.get(id);
  if (!t) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This outing has been deleted." : "Loading…" })));
  const ans = answersOf(id), past = isPast(t), me = uid();
  const group = k => [...ans.entries()].filter(([, r]) => r.answer === k).map(([u]) => u)
    .sort((a, b) => who(a).displayName.localeCompare(who(b).displayName));
  const people = (k, label) => {
    const list = group(k);
    return el("section", { class: "stack-tight" }, el("h3", { text: `${RSVP_ICON[k]} ${label} (${list.length})` }),
      list.length ? el("div", { class: "people" }, ...list.map(u => el("a", { class: "person", href: `#/u/${u}` }, avatar(who(u), "sm"), el("span", { text: who(u).displayName }))))
        : el("p", { class: "muted small", text: "Nobody yet." }));
  };
  const waiting = [...store.members.values()].filter(m => !m.suspended && !ans.has(m.id)).map(m => m.displayName).sort();
  fill(main,
    el("a", { class: "eyebrow back-link", href: "#/derbies", text: "← Events" }),
    el("h2", { class: "page-title", text: `${kindIcon(t)} ${t.title}` }),
    el("dl", { class: "facts card" },
      el("div", { class: "fact" }, el("dt", { text: "When" }), el("dd", { text: fmtDate(t.at) })),
      t.endAt ? el("div", { class: "fact" }, el("dt", { text: "Back by" }), el("dd", { text: fmtDate(t.endAt) })) : null,
      t.place ? el("div", { class: "fact" }, el("dt", { text: "Where" }), el("dd", { text: t.place })) : null,
      el("div", { class: "fact" }, el("dt", { text: "Fishing from" }), el("dd", { text: isBoatOuting(t) ? "🚤 Boats" : "🎣 Shore, fly or ice" })),
      el("div", { class: "fact" }, el("dt", { text: "Planned by" }), el("dd", { text: who(t.uid).displayName })),
      t.notes ? el("div", { class: "fact" }, el("dt", { text: "Notes" }), el("dd", { text: t.notes })) : null),
    past ? el("p", { class: "hint", text: `This outing was on ${fmtDay(t.at)}.` })
      : el("section", { class: "card stack" }, el("h3", { text: "Are you in?" }), rsvpButtons(t)),
    isBoatOuting(t) ? boatsSection(t, past, me) : null,
    recapSection(t),
    tripBite(t),
    el("section", { class: "card stack" }, people("in", "In"), people("maybe", "Maybe"), people("out", "Out"),
      waiting.length && !past ? el("p", { class: "hint", text: `Not answered yet: ${waiting.join(", ")}` }) : null),
    canManage(t) ? el("div", { class: "row" },
      el("a", { class: "btn", href: `#/tedit/${id}`, text: "Edit" }),
      confirmButton("Delete", "Tap again to delete", () => { deleteTrip(id); location.hash = "#/derbies"; toast("Outing deleted."); })) : null);
}

/* Best-bite times for the outing's day at the home water, with the periods during the outing marked. */
function tripBite(t) {
  const home = store.league && store.league.home;
  if (!home || outingEnd(t) < Date.now() - 86400000) return null;
  return biteDay(biteTimes(t.at, home), { title: "🎣 Best bite that day", window: { start: t.at, end: outingEnd(t) } });
}

/* Boats and seats: first to grab a seat gets it; a full boat has a waitlist. */
function boatsSection(t, past, me) {
  const s = seating(t, answersOf(t.id), boatsOf(t.id));
  const mine = answersOf(t.id).get(me) || {};
  const imIn = mine.answer === "in", iOwn = boatsOf(t.id).has(me);
  const chip = u => el("a", { class: "person", href: `#/u/${u}` }, avatar(who(u), "xs"), el("span", { text: who(u).displayName }));
  const saved = b => { const id = (boatsOf(t.id).get(b.owner) || {}).boatId; return id && store.fleet.get(id); };
  const boatCard = b => {
    const onIt = b.riders.includes(me), waiting = b.waitlist.includes(me), full = b.riders.length >= b.seats, owner = b.owner === me;
    let action = null;
    if (!past && !owner && !iOwn) {
      if (onIt || waiting) action = el("button", { class: "btn small quiet", type: "button", text: waiting ? "Leave the waitlist" : "Give up my seat", onclick: () => setSeat(t.id, null) });
      else action = el("button", { class: "btn small" + (full ? "" : " lime"), type: "button", text: full ? "Full: join the waitlist" : "Grab a seat",
        onclick: () => { setSeat(t.id, b.owner); toast(full ? `You're on the waitlist for ${boatName(b)}.` : `Seat taken on ${boatName(b)}.`); } });
    }
    return el("div", { class: "boat-card" + (onIt || owner ? " mine" : "") },
      el("div", { class: "row spread" },
        saved(b) ? el("a", { href: `#/boat/${saved(b).id}` }, el("b", { text: `🚤 ${boatName(b)}` })) : el("b", { text: `🚤 ${boatName(b)}` }),
        el("span", { class: "muted small", text: `${b.riders.length} of ${b.seats} ${b.seats === 1 ? "seat" : "seats"} taken` })),
      el("div", { class: "people" }, el("span", { class: "muted small", text: "Captain" }), chip(b.owner)),
      b.riders.length ? el("div", { class: "people" }, ...b.riders.map(chip)) : el("p", { class: "muted small", text: "No riders yet." }),
      b.waitlist.length ? el("div", { class: "people waitlist" }, el("span", { class: "muted small", text: "Waitlist" }), ...b.waitlist.map(chip)) : null,
      owner && !past ? el("div", { class: "row" },
        el("button", { class: "btn small", type: "button", text: "Change seats", onclick: () => boatSheet(t, b) }),
        confirmButton("Take my boat off", "Tap again: riders lose their seats", () => { setBoat(t.id, 0); toast("Boat taken off."); }, "btn small quiet")) : null,
      action);
  };
  return el("section", { class: "card stack" },
    el("div", { class: "row spread" }, el("h3", { text: "Boats and seats" }),
      !past && !iOwn ? el("button", { class: "btn small", type: "button", text: "I'm bringing a boat", onclick: () => boatSheet(t, null) }) : null),
    s.boats.length ? el("div", { class: "stack" }, ...s.boats.map(boatCard))
      : el("p", { class: "muted", text: "Nobody's bringing a boat yet." }),
    s.needsSeat.length ? el("div", { class: "stack-tight needs-seat" },
      el("b", { text: `🙋 Needs a seat (${s.needsSeat.length})` }),
      el("div", { class: "people" }, ...s.needsSeat.map(chip)),
      el("p", { class: "hint", text: s.boats.some(b => b.riders.length < b.seats) ? "There are seats left: grab one above."
        : "No seats left. Someone needs to bring another boat." })) : null,
    imIn || past ? null : el("p", { class: "hint", text: "Say you're In, then grab a seat on a boat. First come, first seated." }));
}

/* Offer a boat, or change its seats. */
function boatSheet(t, b) {
  openSheet(box => {
    const seats = el("input", { type: "text", inputmode: "numeric", value: b ? String(b.seats) : "3", "data-focus": "" });
    const name = el("input", { type: "text", maxlength: 40, value: b ? b.name : "", placeholder: `e.g. ${who(uid()).displayName}'s Lund` });
    // One of your saved boats (its name fills in), so catches on the outing are counted for it.
    const own = myBoats(uid(), store.fleet).filter(x => x.uid === uid());
    const prevId = b ? (boatsOf(t.id).get(uid()) || {}).boatId || "" : "";
    const pick = el("select", { "aria-label": "Saved boat" }, el("option", { value: "", text: "Not a saved boat" }),
      ...own.map(x => el("option", { value: x.id, text: x.name })));
    pick.value = prevId && own.some(x => x.id === prevId) ? prevId : own.length === 1 && !b ? own[0].id : "";
    if (pick.value && !name.value) name.value = store.fleet.get(pick.value).name;
    pick.addEventListener("change", () => { if (pick.value) name.value = store.fleet.get(pick.value).name; });
    const msg = el("p", { class: "msg" });
    const form = el("form", { class: "stack" },
      el("h2", { text: b ? "Change your boat" : "Bring your boat" }),
      field("Spare seats", seats, "How many others can come (not counting you). Seats go to whoever grabs them first."),
      own.length ? field("Your boat", pick, "Catches made during the outing can be counted for it.") : null,
      field("Boat name (optional)", name),
      msg,
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", text: "Cancel", onclick: closeSheet }),
        el("button", { class: "btn primary", type: "submit", text: b ? "Save" : "Add my boat" })));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const n = Math.round(Number(seats.value));
      if (!(n >= 1 && n <= 12)) { msg.className = "msg err"; msg.textContent = "Between 1 and 12 spare seats."; return; }
      setBoat(t.id, n, name.value, pick.value || null);
      closeSheet(); toast(b ? "Boat updated." : "Boat added. You're In, as its captain.");
    });
    box.append(form);
  });
}

/* What the people who were In caught during the outing. */
function recapSection(t) {
  const r = outingRecap(t, allCatches(), answersOf(t.id));
  if (!r.started) return null;
  const all = allCatches();
  // Short tags on the photos: a personal best, and a record (👑 league, 📜 all-time).
  const flags = c => [isPersonalBest(c, all) ? "PB" : "", recordKinds(c, all).length ? (c.past ? "📜" : "👑") : ""].filter(Boolean).join(" ");
  return el("section", { class: "card stack" },
    el("h3", { text: r.over ? "🐟 How it went" : "🐟 So far" }),
    !r.fish ? el("p", { class: "muted", text: r.over ? "No fish logged during this outing." : "No fish logged yet. Tight lines!" }) : [
      el("p", { class: "trip-recap-line", text: `${r.fish} fish · ${r.species} species${r.biggest ? ` · biggest: ${who(r.biggest.uid).displayName}'s ${sizeOf(r.biggest)} ${r.biggest.species}` : ""}` }),
      el("div", { class: "people" }, ...r.anglers.map(a => el("a", { class: "person", href: `#/u/${a.uid}` }, avatar(who(a.uid), "xs"),
        el("span", { text: `${who(a.uid).displayName} · ${a.fish}` })))),
      el("div", { class: "recap-thumbs" }, ...r.catches.slice(0, 12).map(c => el("a", { class: "recap-thumb", href: `#/c/${c.id}`, title: `${c.species} ${sizeOf(c) || ""}` },
        el("img", { class: "thumb sm", src: c.thumb, alt: `${c.species} by ${who(c.uid).displayName}`, loading: "lazy" }),
        flags(c) ? el("span", { class: "recap-flag", text: flags(c) }) : null))),
    ]);
}

/* ---------- Plan or edit an outing ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function renderTripForm(main, id) {
  const editing = id ? store.trips.get(id) : null;
  if (id && (!editing || !canManage(editing))) return fill(main, el("div", { class: "card" }, el("p", { text: "Only whoever planned this outing can change it." })));
  let at = editing ? editing.at : 0;
  if (!editing) { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(6, 0, 0, 0); at = d.getTime(); } // next Saturday, 6 AM
  let kind = editing ? (editing.kind === "boat" ? "boat" : "shore") : "boat";
  const title = el("input", { type: "text", maxlength: 60, autocapitalize: "sentences", placeholder: "e.g. Saturday walleye", value: editing ? editing.title : "" });
  const when = el("input", { type: "datetime-local", value: toLocalInput(at) });
  const back = el("input", { type: "datetime-local", value: editing && editing.endAt ? toLocalInput(editing.endAt) : "" });
  const place = el("input", { type: "text", maxlength: 60, autocapitalize: "words", placeholder: "e.g. North bay launch", value: editing ? editing.place : "" });
  const notes = el("textarea", { rows: 3, maxlength: 500, placeholder: "Bait, what time to meet, who's bringing lunch…" });
  notes.value = editing ? editing.notes || "" : "";
  const kindSeg = el("div", { class: "seg" });
  const drawKind = () => fill(kindSeg, ...[["boat", "🚤 Boat"], ["shore", "🎣 Shore, fly or ice"]].map(([k, label]) =>
    el("button", { type: "button", "aria-pressed": String(kind === k), text: label, onclick: () => { kind = k; drawKind(); } })));
  drawKind();
  const msg = el("p", { class: "msg" });
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit outing" : "Plan an outing" }),
    el("section", { class: "card stack" }, field("What", title), field("When", when),
      field("Back by (optional)", back, "Leave blank to count the rest of the day. Fish caught during the outing show on its page."),
      field("Where (optional)", place),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Fishing from" }), kindSeg,
        el("span", { class: "hint", text: "Boat outings have seats: whoever brings a boat says how many, and seats go first come, first seated." })),
      field("Notes (optional)", notes)),
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Post the outing" }),
    el("a", { class: "btn quiet block", href: editing ? `#/t/${id}` : "#/derbies", text: "Cancel" }));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = x => { msg.className = "msg err"; msg.textContent = x; };
    const t = new Date(when.value).getTime(), endAt = back.value ? new Date(back.value).getTime() : null;
    if (!title.value.trim()) return fail("Say what the outing is, e.g. Saturday walleye.");
    if (!isFinite(t)) return fail("Set when you're heading out.");
    if (endAt !== null && !(endAt > t)) return fail("\"Back by\" has to be after it starts.");
    const data = { uid: editing ? editing.uid : uid(), title: title.value.trim().slice(0, 60), at: t, endAt, kind, place: place.value.trim().slice(0, 60),
      notes: notes.value.trim().slice(0, 500), createdAt: editing ? editing.createdAt : Date.now() };
    const newId = saveTrip(editing ? id : null, data);
    if (!editing) setRsvp(newId, "in"); // the planner is going
    toast(editing ? "Outing updated." : "Outing posted. Everyone will see it in their bell.");
    location.hash = `#/t/${newId}`;
  });
  fill(main, form);
}
