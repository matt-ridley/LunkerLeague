/* League news and personal alerts, worked out from the data every time (nothing is stored), like the rankings.
   - leagueEvents: what the feed announces to everyone: records stolen, badges earned, derby results.
   - alertsFor: what the bell shows one angler: mentions, comments and reactions on their catches, records taken
     from them, their badges, their derbies, trips, and a count of new catches.
   Pure functions on plain data. `name(uid)` turns a user id into a display name. */
import { measured, fishIn } from "./stats.js";
import { badgeTimeline } from "./rank.js";
import { derbyStatus, closesAt, standings, awaitingApproval } from "./derby.js";
import { crownSteals } from "./crowns.js";
import { seriesStatus, seriesStandings, seriesFinalAt } from "./series.js";
import { outingEnd, outingRecap } from "./outings.js";
import { fmtWeight, fmtLength } from "./ui.js";
import { challengeStatus, challengeBoard, closesAt as h2hClosesAt, termsShort, scoreText as h2hScore, otherSide } from "./h2h.js";

const PLACES = ["1st", "2nd", "3rd"];
const MEDALS = ["🥇", "🥈", "🥉"];
const snippet = t => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > 80 ? s.slice(0, 79) + "…" : s; };

/* Every time a species record (weight or length) changed hands: [{ species, field, c, from }], oldest first.
   Only a different angler beating the holder counts; beating your own record isn't news. */
export function recordSteals(catches) {
  const out = [];
  // League catches only: a past fish (logbook) on top of the all-time board isn't a record "taken".
  const list = catches.filter(c => !c.dq && !c.past && measured(c)).sort((a, b) => a.caughtAt - b.caughtAt);
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

/* When the league could first see a catch: when it was logged, never before it was caught. */
export const postedAt = c => Math.max(c.caughtAt || 0, c.createdAt || 0);

/* News worked out from catch times (badges, crowns) is dated by when the fish was caught. A catch logged late
   (within the grace days) would bury its news days down the feed, so date news by when its catch was posted.
   at(t, uids): the posted time of the catch by one of `uids` caught at t, or t itself.
   cid(t, uids): that catch's id, so the feed can show the news on the catch's own card. */
function postedTimes(catches) {
  const by = new Map(); // "uid:caughtAt" -> the latest-posted catch
  for (const c of catches) {
    const k = `${c.uid}:${c.caughtAt}`, cur = by.get(k);
    if (!cur || postedAt(c) > postedAt(cur)) by.set(k, c);
  }
  const find = (t, uids) => uids.map(u => by.get(`${u}:${t}`)).find(Boolean);
  return {
    at: (t, uids) => { const c = find(t, uids); return c ? Math.max(t, postedAt(c)) : t; },
    cid: (t, uids) => (find(t, uids) || {}).id,
  };
}

const aoty = s => (/angler of the year/i.test(s.name) ? `${s.name}!` : `${s.name}: Angler of the Year!`);
/* Finished season series and their winner: [{ s, uid, at }]. */
function seriesWinners({ series, derbies, catches, entrants = new Map(), now }) {
  const out = [];
  for (const s of asMap(series).values()) {
    if (seriesStatus(s, derbies, now) !== "final") continue;
    const top = seriesStandings(s, { derbies, catches, entrants }, now)[0];
    if (top && top.total) out.push({ s, uid: top.uid, at: seriesFinalAt(s, derbies) });
  }
  return out;
}

/* Feed news: [{ id, at, icon, text, href, uids, cid?, short?, badge? }], newest first. `uids` are the anglers it's about.
   News caused by one catch also has `cid` (that catch) and `short` (the text to show on its card); badge news has `badge`.
   `crowns` (from crownStandings) adds crowns changing hands. */
export function leagueEvents(data) {
  const { catches, derbies, entrants = new Map(), crowns = [], name, now = Date.now() } = data;
  const derbyMap = asMap(derbies), out = [], posted = postedTimes(catches);
  for (const s of recordSteals(catches)) {
    const kind = s.field === "weightOz" ? "weight" : "length";
    out.push({ id: `rec:${s.c.id}:${s.field}`, at: postedAt(s.c), icon: "👑", href: `#/c/${s.c.id}`, uids: [s.c.uid, s.from.uid],
      cid: s.c.id, short: `Took the ${kind} record from ${name(s.from.uid)}`,
      text: `${name(s.c.uid)} took the ${s.species} ${kind} record from ${name(s.from.uid)}` });
  }
  for (const b of data.badges || badgeTimeline({ ...data, derbies: derbyMap })) {
    out.push({ id: `badge:${b.uid}:${b.badge.id}`, at: posted.at(b.at, [b.uid]), icon: b.badge.icon, href: `#/u/${b.uid}`, uids: [b.uid],
      cid: posted.cid(b.at, [b.uid]), short: `Earned the ${b.badge.name} badge`, badge: b.badge,
      text: `${name(b.uid)} earned the ${b.badge.name} badge` });
  }
  for (const s of crownSteals(crowns)) {
    out.push({ id: `crown:${s.crown.id}:${s.at}`, at: posted.at(s.at, [s.uid]), icon: s.crown.icon, href: "#/leaders", uids: [s.uid, s.from],
      cid: posted.cid(s.at, [s.uid]), short: `Stole the ${s.crown.name} crown from ${name(s.from)}`,
      text: `${name(s.uid)} stole the ${s.crown.name} crown from ${name(s.from)}` });
  }
  for (const { d, rows, at } of finishedDerbies({ catches, derbies: derbyMap, entrants, now })) {
    out.push({ id: `derby:${d.id}`, at, icon: "🏁", href: `#/d/${d.id}`, uids: rows.slice(0, 3).map(r => r.uid),
      text: `${d.name} is over: ${rows.slice(0, 3).map((r, i) => `${MEDALS[i]} ${name(r.uid)}`).join(" · ")}` });
  }
  // Outings that are over and caught something: one line, once it's done.
  for (const t of asMap(data.trips).values()) {
    if (outingEnd(t) >= now) continue;
    const r = outingRecap(t, catches, (data.rsvps || new Map()).get(t.id) || new Map(), now);
    if (!r.fish) continue;
    const big = r.biggest ? `, biggest ${name(r.biggest.uid)}'s ${r.biggest.weightOz > 0 ? fmtWeight(r.biggest.weightOz) : fmtLength(r.biggest.lengthIn)} ${r.biggest.species}` : "";
    out.push({ id: `outing:${t.id}`, at: outingEnd(t), icon: t.kind === "boat" ? "🚤" : "🎣", href: `#/t/${t.id}`, uids: r.anglers.map(a => a.uid),
      text: `${t.title}: ${r.fish} fish${big}` });
  }
  // Head-to-head: challenges made, accepted, starting, and decided (or vetoed).
  for (const ch of challengeList(data)) {
    const href = `#/h/${ch.id}`, uids = [ch.from, ch.to], vs = `${name(ch.from)} vs ${name(ch.to)}`;
    out.push({ id: `h2h:${ch.id}`, at: ch.createdAt || 0, icon: "⚔️", href, uids, text: `${name(ch.from)} challenged ${name(ch.to)}: ${termsShort(ch.terms)}` });
    if (ch.status !== "accepted") continue;
    if (ch.acceptedAt) out.push({ id: `h2hyes:${ch.id}`, at: ch.acceptedAt, icon: "🤝", href, uids, text: `${name(ch.turn)} accepted ${name(otherSide(ch, ch.turn))}'s ${ch.counters ? "counter" : "challenge"}: ${termsShort(ch.terms)}` });
    if (now >= ch.terms.start && !ch.vetoed) out.push({ id: `h2hlive:${ch.id}`, at: ch.terms.start, icon: "⚔️", href, uids, text: `${vs} is on!` });
    const r = h2hResult(ch, catches, name, now);
    if (r) out.push({ id: `h2hend:${ch.id}`, ...r, href, uids });
    if (ch.vetoed && ch.vetoedAt) out.push({ id: `h2hveto:${ch.id}:${ch.vetoedAt}`, at: ch.vetoedAt, icon: "🚫", href, uids, text: `The league owner vetoed ${vs}. No points move.` });
  }
  for (const w of seriesWinners({ ...data, derbies: derbyMap, now })) {
    out.push({ id: `series:${w.s.id}`, at: w.at, icon: "🏆", href: `#/s/${w.s.id}`, uids: [w.uid], text: `${name(w.uid)} won ${aoty(w.s)}` });
  }
  return out.sort((a, b) => b.at - a.at);
}

const challengeList = data => [...(data.challenges ? asMap(data.challenges).values() : [])];
/* A finished challenge's result line: { at, icon, text }, or null while it isn't decided (or was vetoed). */
function h2hResult(ch, catches, name, now) {
  if (challengeStatus(ch, now) !== "done") return null;
  const r = challengeBoard(ch, catches), at = h2hClosesAt(ch);
  if (r.tie) return { at, icon: "🤝", text: `${name(ch.from)} and ${name(ch.to)} tied${r.sides[0].score ? ` at ${h2hScore(ch.terms, r.sides[0].score)}` : ""}. Nobody wins.` };
  const w = r.sides.find(x => x.uid === r.winner), l = r.sides.find(x => x.uid === r.loser);
  const pts = ch.terms.stake ? ` and took ${ch.terms.stake} points` : "";
  return { at, icon: "🏆", text: `${name(w.uid)} beat ${name(l.uid)} (${h2hScore(ch.terms, w.score)} to ${h2hScore(ch.terms, l.score)})${pts}` };
}

const catchName = c => (c ? (c.fishCount > 1 ? `stringer of ${c.species}` : c.species) : "catch");

/* The bell for one angler: [{ id, at, icon, text, href }], newest first (at most `limit`).
   An id names one piece of news for good (clearing it on the bell is remembered by id), so it holds whatever
   makes the news new: a changed reaction or trip answer, a fresh batch of catches, a crown changing hands again.
   `seen` is when they last opened the bell; new catches by others since then are summed up in one line. */
export function alertsFor(me, data, { seen = 0, limit = 60 } = {}) {
  const { catches, derbies, entrants = new Map(), comments = new Map(), reactions = new Map(), chat = [], derbyChat = new Map(),
    trips = new Map(), rsvps = new Map(), crowns = [], name, now = Date.now() } = data;
  const catchMap = new Map(catches.map(c => [c.id, c]));
  const derbyMap = asMap(derbies), out = [], posted = postedTimes(catches);
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
      add({ id: `re:${cid}:${u}:${r.emojis.join("")}`, at: r.at, icon: r.emojis[0] || "👍", href: `#/c/${cid}`, text: `${name(u)} reacted ${r.emojis.join("")} to your ${catchName(c)}` });
    }
  }

  // Records taken from you, and badges you earned.
  for (const s of recordSteals(catches)) if (s.from.uid === me && s.c.uid !== me) {
    add({ id: `rec:${s.c.id}:${s.field}`, at: postedAt(s.c), icon: "😱", href: `#/c/${s.c.id}`,
      text: `${name(s.c.uid)} took your ${s.species} ${s.field === "weightOz" ? "weight" : "length"} record` });
  }
  for (const b of data.badges || badgeTimeline({ ...data, derbies: derbyMap })) if (b.uid === me) {
    add({ id: `badge:${b.badge.id}`, at: posted.at(b.at, [me]), icon: b.badge.icon, href: "#/me", text: `You earned the ${b.badge.name} badge` });
  }

  // Crowns you took (claimed or stole) and crowns stolen from you.
  for (const s of crowns) for (const h of s.history) {
    if (h.uid === me) add({ id: `crown:${s.crown.id}:${h.from || "claim"}:${h.from ? h.at : ""}`, at: posted.at(h.at, [me]), icon: s.crown.icon, href: "#/leaders",
      text: h.from ? `You stole the ${s.crown.name} crown from ${name(h.from)}` : `You claimed the ${s.crown.name} crown` });
    else if (h.from === me && h.uid) add({ id: `crownlost:${s.crown.id}:${h.at}`, at: posted.at(h.at, [h.uid]), icon: "😤", href: "#/leaders",
      text: `${name(h.uid)} stole your ${s.crown.name} crown` });
  }

  // Derbies: new ones set up by others; the ones you joined going live and finishing.
  for (const d of derbyMap.values()) {
    if (d.cancelled) continue;
    const ent = entrants.get(d.id) || new Map(), joined = ent.has(me);
    if (d.organiserUid !== me && d.createdAt) {
      add({ id: `dnew:${d.id}`, at: d.createdAt, icon: "📣", href: `#/d/${d.id}`, text: `${name(d.organiserUid)} set up a derby: ${d.name}` });
    }
    // Approval: entries waiting for the organiser, and your entries they approved.
    if (d.approval) for (const c of catches) if (c.derbyId === d.id) {
      if (d.organiserUid === me && awaitingApproval(c, d)) add({ id: `approve:${c.id}`, at: c.createdAt || c.caughtAt, icon: "⏳", href: `#/c/${c.id}`,
        text: `${name(c.uid)} entered a ${catchName(c)} in ${d.name}. Approve it?` });
      else if (c.uid === me && d.organiserUid !== me && c.approved && !c.dq && c.approvedAt) add({ id: `approved:${c.id}:${c.approvedAt}`, at: c.approvedAt, icon: "✅",
        href: `#/c/${c.id}`, text: `Your ${catchName(c)} in ${d.name} was approved` });
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
      add({ id: `rsvp:${t.id}:${u}:${r.answer}`, at: r.at || 0, icon: RSVP_ICON[r.answer] || "🚤", href: `#/t/${t.id}`, text: `${name(u)} ${RSVP_TEXT[r.answer] || "answered"} for ${t.title}` });
    }
  }

  // Head-to-head: your turn to answer, answers to your offers, results, vetoes; and other anglers' challenges.
  for (const ch of challengeList(data)) {
    const href = `#/h/${ch.id}`, st = challengeStatus(ch, now), mine = ch.from === me || ch.to === me;
    if (!mine) {
      add({ id: `h2h:${ch.id}`, at: ch.createdAt || 0, icon: "⚔️", href, text: `${name(ch.from)} challenged ${name(ch.to)}: ${termsShort(ch.terms)}` });
      const r = h2hResult(ch, catches, name, now);
      if (r) add({ id: `h2hend:${ch.id}`, ...r, href });
      continue;
    }
    const them = name(otherSide(ch, me));
    if (st === "open" && ch.turn === me) add({ id: `h2hturn:${ch.id}:${ch.counters || 0}`, at: ch.updatedAt || ch.createdAt || 0, icon: "⚔️", href,
      text: ch.counters ? `${them} countered: ${termsShort(ch.terms)}. Your move.` : `${them} challenged you: ${termsShort(ch.terms)}. Accept?` });
    // Who answered last: accepting or declining leaves the turn with whoever did it; withdrawing is the other one.
    const answerer = ch.status === "withdrawn" ? otherSide(ch, ch.turn) : ch.turn;
    const theyAnswered = ch.status !== "open" && answerer !== me;
    if (ch.status === "accepted" && theyAnswered && ch.acceptedAt) add({ id: `h2hyes:${ch.id}`, at: ch.acceptedAt, icon: "🤝", href, text: `${them} accepted your challenge. ${termsShort(ch.terms)}` });
    if (ch.status === "declined" && theyAnswered) add({ id: `h2hno:${ch.id}`, at: ch.updatedAt || 0, icon: "🙅", href, text: `${them} declined your challenge` });
    if (ch.status === "withdrawn" && theyAnswered) add({ id: `h2hoff:${ch.id}`, at: ch.updatedAt || 0, icon: "↩️", href, text: `${them} took back their challenge` });
    if (st === "done") {
      const r = challengeBoard(ch, catches), at = h2hClosesAt(ch), stake = ch.terms.stake ? ` (${ch.terms.stake} points)` : "";
      add({ id: `h2hend:${ch.id}`, at, href, ...(r.tie ? { icon: "🤝", text: `You and ${them} tied. Nobody wins.` }
        : r.winner === me ? { icon: "🏆", text: `You beat ${them}${stake}!` } : { icon: "😤", text: `${them} beat you${stake}` }) });
    }
    if (ch.vetoed && ch.vetoedAt) add({ id: `h2hveto:${ch.id}:${ch.vetoedAt}`, at: ch.vetoedAt, icon: "🚫", href, text: `The league owner vetoed your challenge with ${them}. No points move.` });
  }

  // A season series you won.
  for (const w of seriesWinners({ ...data, derbies: derbyMap, now })) if (w.uid === me) {
    add({ id: `series:${w.s.id}`, at: w.at, icon: "🏆", href: `#/s/${w.s.id}`, text: `You won ${aoty(w.s)}` });
  }

  // Past catches (throwbacks) added by others.
  for (const c of catches) if (c.past && c.uid !== me && !c.dq) {
    add({ id: `throwback:${c.id}`, at: c.createdAt || c.caughtAt, icon: "📜", href: `#/c/${c.id}`,
      text: `${name(c.uid)} added a throwback: ${catchName(c)} from ${new Date(c.caughtAt).getFullYear()}` });
  }

  // New catches by others since you last looked, as one line (throwbacks have their own line above).
  const fresh = catches.filter(c => c.uid !== me && !c.past && (c.createdAt || 0) > seen);
  if (fresh.length) {
    const fish = fresh.reduce((n, c) => n + fishIn(c), 0);
    const newest = Math.max(...fresh.map(c => c.createdAt));
    add({ id: `catches:${newest}`, at: newest, icon: "🎣", href: "#/feed",
      text: fresh.length === 1 ? `${name(fresh[0].uid)} logged a ${catchName(fresh[0])}` : `${fresh.length} new catches (${fish} fish) since you last looked` });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}
export const RSVP_ICON = { in: "✅", maybe: "🤔", out: "❌" };
const RSVP_TEXT = { in: "is in", maybe: "is a maybe", out: "is out" };

/* How many alerts are new since the angler last opened the bell. */
export const unreadCount = (alerts, seen) => alerts.filter(a => a.at > seen).length;
