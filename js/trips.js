/* Trips: "Who's out Saturday?" Anyone can plan one, and everyone answers In / Maybe / Out.
   Shown on the Events tab above the derbies. */
import { el, field, avatar, fill, fmtDate, fmtDay, toast, confirmButton } from "./ui.js";
import { store, uid, isAdmin, memberName, saveTrip, setRsvp, deleteTrip } from "./cloud.js";
import { RSVP_ICON } from "./events.js";

const who = id => store.members.get(id) || { id, displayName: memberName(id) };
const ANSWERS = [["in", "In"], ["maybe", "Maybe"], ["out", "Out"]];
const answersOf = id => store.rsvps.get(id) || new Map();
const canManage = t => t.uid === uid() || isAdmin();
const HOUR = 3600 * 1000;
// A trip stays under "Coming up" until 12 hours after it starts (it's an outing, not a moment).
const isPast = (t, now = Date.now()) => t.at + 12 * HOUR < now;

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

function tripCard(t) {
  const n = counts(t), past = isPast(t);
  return el("div", { class: "trip-card" + (past ? " past" : "") },
    el("a", { class: "trip-link", href: `#/t/${t.id}` },
      el("b", { class: "trip-title", text: `🚤 ${t.title}` }),
      el("div", { class: "muted small", text: [fmtDate(t.at), t.place].filter(Boolean).join(" · ") }),
      el("div", { class: "trip-meta" },
        el("span", { text: `Planned by ${who(t.uid).displayName}` }),
        el("span", { text: `✅ ${n.in} · 🤔 ${n.maybe} · ❌ ${n.out}` }))),
    past ? null : rsvpButtons(t));
}

/* The trips part of the Events tab. */
export function tripsSection() {
  const all = [...store.trips.values()];
  const upcoming = all.filter(t => !isPast(t)).sort((a, b) => a.at - b.at);
  const past = all.filter(t => isPast(t)).sort((a, b) => b.at - a.at).slice(0, 3);
  return el("section", { class: "stack" },
    el("div", { class: "row spread" }, el("h3", { text: "Trips" }),
      el("a", { class: "btn small", href: "#/tnew", text: "🚤 Plan a trip" })),
    upcoming.length ? el("div", { class: "card-list" }, ...upcoming.map(tripCard))
      : el("p", { class: "muted", text: "No trips planned. Heading out? Plan a trip and see who's in." }),
    past.length ? el("details", { class: "past-trips" }, el("summary", { text: "Past trips" }),
      el("div", { class: "card-list" }, ...past.map(tripCard))) : null);
}

/* ---------- One trip ---------- */
export function renderTrip(main, id) {
  const t = store.trips.get(id);
  if (!t) return fill(main, el("div", { class: "card empty" }, el("p", { text: store.catchesLoaded ? "This trip has been deleted." : "Loading…" })));
  const ans = answersOf(id);
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
    el("h2", { class: "page-title", text: `🚤 ${t.title}` }),
    el("dl", { class: "facts card" },
      el("div", { class: "fact" }, el("dt", { text: "When" }), el("dd", { text: fmtDate(t.at) })),
      t.place ? el("div", { class: "fact" }, el("dt", { text: "Where" }), el("dd", { text: t.place })) : null,
      el("div", { class: "fact" }, el("dt", { text: "Planned by" }), el("dd", { text: who(t.uid).displayName })),
      t.notes ? el("div", { class: "fact" }, el("dt", { text: "Notes" }), el("dd", { text: t.notes })) : null),
    isPast(t) ? el("p", { class: "hint", text: `This trip was on ${fmtDay(t.at)}.` })
      : el("section", { class: "card stack" }, el("h3", { text: "Are you in?" }), rsvpButtons(t)),
    el("section", { class: "card stack" }, people("in", "In"), people("maybe", "Maybe"), people("out", "Out"),
      waiting.length ? el("p", { class: "hint", text: `Not answered yet: ${waiting.join(", ")}` }) : null),
    canManage(t) ? el("div", { class: "row" },
      el("a", { class: "btn", href: `#/tedit/${id}`, text: "Edit" }),
      confirmButton("Delete", "Tap again to delete", () => { deleteTrip(id); location.hash = "#/derbies"; toast("Trip deleted."); })) : null);
}

/* ---------- Plan or edit a trip ---------- */
const pad = n => String(n).padStart(2, "0");
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function renderTripForm(main, id) {
  const editing = id ? store.trips.get(id) : null;
  if (id && (!editing || !canManage(editing))) return fill(main, el("div", { class: "card" }, el("p", { text: "Only whoever planned this trip can change it." })));
  let at = editing ? editing.at : 0;
  if (!editing) { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(6, 0, 0, 0); at = d.getTime(); } // next Saturday, 6 AM
  const title = el("input", { type: "text", maxlength: 60, autocapitalize: "sentences", placeholder: "e.g. Saturday walleye", value: editing ? editing.title : "" });
  const when = el("input", { type: "datetime-local", value: toLocalInput(at) });
  const place = el("input", { type: "text", maxlength: 60, autocapitalize: "words", placeholder: "e.g. North bay launch", value: editing ? editing.place : "" });
  const notes = el("textarea", { rows: 3, maxlength: 500, placeholder: "Boat seats, bait, what time to meet…" });
  notes.value = editing ? editing.notes || "" : "";
  const msg = el("p", { class: "msg" });
  const form = el("form", { class: "stack", novalidate: true },
    el("h2", { class: "page-title", text: editing ? "Edit trip" : "Plan a trip" }),
    el("section", { class: "card stack" }, field("What", title), field("When", when), field("Where (optional)", place), field("Notes (optional)", notes)),
    msg,
    el("button", { class: "btn lime block big", type: "submit", text: editing ? "Save changes" : "Post the trip" }),
    el("a", { class: "btn quiet block", href: editing ? `#/t/${id}` : "#/derbies", text: "Cancel" }));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fail = t => { msg.className = "msg err"; msg.textContent = t; };
    const t = new Date(when.value).getTime();
    if (!title.value.trim()) return fail("Say what the trip is, e.g. Saturday walleye.");
    if (!isFinite(t)) return fail("Set when you're heading out.");
    const data = { uid: editing ? editing.uid : uid(), title: title.value.trim().slice(0, 60), at: t, place: place.value.trim().slice(0, 60),
      notes: notes.value.trim().slice(0, 500), createdAt: editing ? editing.createdAt : Date.now() };
    const newId = saveTrip(editing ? id : null, data);
    if (!editing) setRsvp(newId, "in"); // the planner is going
    toast(editing ? "Trip updated." : "Trip posted. Everyone will see it in their bell.");
    location.hash = `#/t/${newId}`;
  });
  fill(main, form);
}
