/* League news and personal alerts, worked out from the data every time (nothing is stored), like the rankings.
   - leagueEvents: what the feed announces to everyone: records stolen, badges earned, derby results.
   - alertsFor: what the bell shows one angler: mentions, comments and reactions on their catches, records taken
     from them, their badges, their derbies, trips, and a count of new catches.
   Pure functions on plain data. `name(uid)` turns a user id into a display name. */
import { measured, fishIn } from "./stats.js";
import { badgeTimeline } from "./rank.js";
import { derbyStatus, closesAt, standings } from "./derby.js";
import { crownSteals } from "./crowns.js";

const PLACES = ["1st", "2nd", "3rd"];
const MEDALS = ["🥇", "🥈", "🥉"];
const snippet = t => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > 80 ? s.slice(0, 79) + "…" : s; };

/* Every time a species record (weight or length) changed hands: [{ species, field, c, from }], oldest first.
   Only a different angler beating the holder counts; beating your own record isn't news. */
export function recordSteals(catches) {
  const out = [];
  const list = catches.filter(c => !c.dq && measured(c)).sort((a, b) => a.caughtAt - b.caughtAt);
  for (const field of ["weightOz", "lengthIn"]) {
    const best = new Map(); // species -> holding catch
    for (const c of list) {
      if (!(c[field] > 0)) continue;
      const cur = best.get(c.species);
      if (cur && c[field] <= cur[field]) continue;
      if (cur && cur.uid !== c.uid) out.push({ species: c.species, field, c, from: cur });
      best.set(c.species, c);
    }
  }
  return out.sort((a, b) => a.c.caughtAt - b.c.caughtAt);
}

/* Finished derbies with their podium: [{ d, rows, at }]. */
function finishedDerbies({ catches, derbies, entrants, now }) {
  const out = [];
  for (const d of derbies.values()) {
    if (d.testing || derbyStatus(d, now) !== "ended") continue;
    const rows = standings(d, catches, entrants.get(d.id) || new Map());
    if (rows.length) out.push({ d, rows, at: closesAt(d) });
  }
  return out;
}

const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));

/* Feed news: [{ id, at, icon, text, href, uids }], newest first. `uids` are the anglers it's about.
   `crowns` (from crownStandings) adds crowns changing hands. */
export function leagueEvents(data) {
  const { catches, derbies, entrants = new Map(), crowns = [], name, now = Date.now() } = data;
  const derbyMap = asMap(derbies), out = [];
  for (const s of recordSteals(catches)) {
    out.push({ id: `rec:${s.c.id}:${s.field}`, at: s.c.caughtAt, icon: "👑", href: `#/c/${s.c.id}`, uids: [s.c.uid, s.from.uid],
      text: `${name(s.c.uid)} took the ${s.species} ${s.field === "weightOz" ? "weight" : "length"} record from ${name(s.from.uid)}` });
  }
  for (const b of data.badges || badgeTimeline({ ...data, derbies: derbyMap })) {
    out.push({ id: `badge:${b.uid}:${b.badge.id}`, at: b.at, icon: b.badge.icon, href: `#/u/${b.uid}`, uids: [b.uid],
      text: `${name(b.uid)} earned the ${b.badge.name} badge` });
  }
  for (const s of crownSteals(crowns)) {
    out.push({ id: `crown:${s.crown.id}:${s.at}`, at: s.at, icon: s.crown.icon, href: "#/leaders", uids: [s.uid, s.from],
      text: `${name(s.uid)} stole the ${s.crown.name} crown from ${name(s.from)}` });
  }
  for (const { d, rows, at } of finishedDerbies({ catches, derbies: derbyMap, entrants, now })) {
    out.push({ id: `derby:${d.id}`, at, icon: "🏁", href: `#/d/${d.id}`, uids: rows.slice(0, 3).map(r => r.uid),
      text: `${d.name} is over: ${rows.slice(0, 3).map((r, i) => `${MEDALS[i]} ${name(r.uid)}`).join(" · ")}` });
  }
  return out.sort((a, b) => b.at - a.at);
}

const catchName = c => (c ? (c.fishCount > 1 ? `stringer of ${c.species}` : c.species) : "catch");

/* The bell for one angler: [{ id, at, icon, text, href }], newest first (at most `limit`).
   `seen` is when they last opened the bell; new catches by others since then are summed up in one line. */
export function alertsFor(me, data, { seen = 0, limit = 60 } = {}) {
  const { catches, derbies, entrants = new Map(), comments = new Map(), reactions = new Map(), chat = [], derbyChat = new Map(),
    trips = new Map(), rsvps = new Map(), crowns = [], name, now = Date.now() } = data;
  const catchMap = new Map(catches.map(c => [c.id, c]));
  const derbyMap = asMap(derbies), out = [];
  const add = a => { if (a.at <= now + 600000) out.push(a); };

  // Mentions in the league chat and in the chats of derbies this phone has loaded.
  const chatMentions = (list, href, where) => {
    for (const m of list || []) if (m.uid !== me && (m.mentions || []).includes(me)) {
      add({ id: `chat:${m.id}`, at: m.at || 0, icon: "💬", href, text: `${name(m.uid)} mentioned you ${where}: “${snippet(m.text)}”` });
    }
  };
  chatMentions(chat, "#/chat", "in chat");
  for (const [did, list] of derbyChat) chatMentions(list, `#/dchat/${did}`, `in ${(derbyMap.get(did) || {}).name || "a derby"} chat`);

  // Comments: on your catches, or mentioning you on anyone's.
  for (const [cid, list] of comments) {
    const c = catchMap.get(cid);
    for (const cm of list) {
      if (cm.uid === me) continue;
      const mentioned = (cm.mentions || []).includes(me), mine = c && c.uid === me;
      if (!mentioned && !mine) continue;
      add({ id: `cm:${cm.id}`, at: cm.at || 0, icon: "🗨️", href: `#/c/${cid}`,
        text: mine ? `${name(cm.uid)} commented on your ${catchName(c)}: “${snippet(cm.text)}”`
          : `${name(cm.uid)} mentioned you on ${name(c ? c.uid : "")}'s ${catchName(c)}: “${snippet(cm.text)}”` });
    }
  }

  // Reactions on your catches (each person's latest).
  for (const [cid, byUser] of reactions) {
    const c = catchMap.get(cid);
    if (!c || c.uid !== me) continue;
    for (const [u, r] of byUser) if (u !== me && r.at) {
      add({ id: `re:${cid}:${u}`, at: r.at, icon: r.emojis[0] || "👍", href: `#/c/${cid}`, text: `${name(u)} reacted ${r.emojis.join("")} to your ${catchName(c)}` });
    }
  }

  // Records taken from you, and badges you earned.
  for (const s of recordSteals(catches)) if (s.from.uid === me && s.c.uid !== me) {
    add({ id: `rec:${s.c.id}:${s.field}`, at: s.c.caughtAt, icon: "😱", href: `#/c/${s.c.id}`,
      text: `${name(s.c.uid)} took your ${s.species} ${s.field === "weightOz" ? "weight" : "length"} record` });
  }
  for (const b of data.badges || badgeTimeline({ ...data, derbies: derbyMap })) if (b.uid === me) {
    add({ id: `badge:${b.badge.id}`, at: b.at, icon: b.badge.icon, href: "#/me", text: `You earned the ${b.badge.name} badge` });
  }

  // Crowns you took (claimed or stole) and crowns stolen from you.
  for (const s of crowns) for (const h of s.history) {
    if (h.uid === me) add({ id: `crown:${s.crown.id}:${h.at}`, at: h.at, icon: s.crown.icon, href: "#/leaders",
      text: h.from ? `You stole the ${s.crown.name} crown from ${name(h.from)}` : `You claimed the ${s.crown.name} crown` });
    else if (h.from === me && h.uid) add({ id: `crownlost:${s.crown.id}:${h.at}`, at: h.at, icon: "😤", href: "#/leaders",
      text: `${name(h.uid)} stole your ${s.crown.name} crown` });
  }

  // Derbies: new ones set up by others; the ones you joined going live and finishing.
  for (const d of derbyMap.values()) {
    if (d.cancelled) continue;
    const ent = entrants.get(d.id) || new Map(), joined = ent.has(me);
    if (d.organiserUid !== me && d.createdAt) {
      add({ id: `dnew:${d.id}`, at: d.createdAt, icon: "📣", href: `#/d/${d.id}`, text: `${name(d.organiserUid)} set up a derby: ${d.name}` });
    }
    if (!joined) continue;
    if (now >= d.start) add({ id: `dlive:${d.id}`, at: d.start, icon: "🏁", href: `#/d/${d.id}`, text: `${d.name} is live. Go get 'em!` });
    if (derbyStatus(d, now) === "ended" && !d.testing) {
      const rows = standings(d, catches, ent), i = rows.findIndex(r => r.uid === me);
      add({ id: `dend:${d.id}`, at: closesAt(d), icon: i >= 0 && i < 3 ? MEDALS[i] : "🏁", href: `#/d/${d.id}`,
        text: i >= 0 ? `${d.name} is over. You finished ${i < 3 ? PLACES[i] : `#${i + 1}`}.` : `${d.name} is over.` });
    }
  }

  // Trips: new ones by others, and answers to yours.
  for (const t of trips.values()) {
    if (t.uid !== me) add({ id: `trip:${t.id}`, at: t.createdAt || 0, icon: "🚤", href: `#/t/${t.id}`, text: `${name(t.uid)} is heading out: ${t.title}. Are you in?` });
    else for (const [u, r] of rsvps.get(t.id) || new Map()) if (u !== me) {
      add({ id: `rsvp:${t.id}:${u}`, at: r.at || 0, icon: RSVP_ICON[r.answer] || "🚤", href: `#/t/${t.id}`, text: `${name(u)} ${RSVP_TEXT[r.answer] || "answered"} for ${t.title}` });
    }
  }

  // New catches by others since you last looked, as one line.
  const fresh = catches.filter(c => c.uid !== me && (c.createdAt || 0) > seen);
  if (fresh.length) {
    const fish = fresh.reduce((n, c) => n + fishIn(c), 0);
    add({ id: "catches", at: Math.max(...fresh.map(c => c.createdAt)), icon: "🎣", href: "#/feed",
      text: fresh.length === 1 ? `${name(fresh[0].uid)} logged a ${catchName(fresh[0])}` : `${fresh.length} new catches (${fish} fish) since you last looked` });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}
export const RSVP_ICON = { in: "✅", maybe: "🤔", out: "❌" };
const RSVP_TEXT = { in: "is in", maybe: "is a maybe", out: "is out" };

/* How many alerts are new since the angler last opened the bell. */
export const unreadCount = (alerts, seen) => alerts.filter(a => a.at > seen).length;
