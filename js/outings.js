/* Outings (saved as "trips"): casual days on the water. Who's in, who's bringing a boat and who's in which seat, and
   afterwards a recap of what got caught. Pure functions on plain data.
   An outing: { id, uid (planner), title, at, endAt (optional "back by"), place, notes, kind: "boat" | "shore" }.
   RSVPs: Map(uid -> { answer: "in" | "maybe" | "out", at, boat (the owner's uid of the boat they're on), seatAt }).
   Boats: Map(owner uid -> { seats (spare seats: the owner isn't counted), name, at }). */
import { fishIn, measured } from "./stats.js";

/* When an outing is over: its "back by" time, or the end of the day it starts. */
export function outingEnd(t) {
  if (t.endAt > t.at) return t.endAt;
  const d = new Date(t.at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}
export const isBoatOuting = t => t.kind === "boat";

/* Who sits where: first to grab a seat on a boat gets it; once it's full, later ones wait in line and move up when
   someone leaves. Only anglers who said "In" count; a boat's owner is on their own boat and takes no seat.
   { boats: [{ owner, seats, name, riders: [uid], waitlist: [uid] }], needsSeat: [uid] } (boats in the order offered). */
export function seating(t, rsvps = new Map(), boats = new Map()) {
  if (!isBoatOuting(t)) return { boats: [], needsSeat: [] };
  const ins = [...rsvps].filter(([, r]) => r.answer === "in");
  const list = [...boats].sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([owner, b]) => {
    const want = ins.filter(([u, r]) => u !== owner && r.boat === owner)
      .sort((a, b2) => (a[1].seatAt || 0) - (b2[1].seatAt || 0) || a[0].localeCompare(b2[0])).map(([u]) => u);
    const seats = Math.max(0, b.seats || 0);
    return { owner, seats, name: b.name || "", riders: want.slice(0, seats), waitlist: want.slice(seats) };
  });
  const owners = new Set(boats.keys());
  const needsSeat = ins.filter(([u, r]) => !owners.has(u) && !(r.boat && owners.has(r.boat))).map(([u]) => u);
  return { boats: list, needsSeat };
}

/* What the people who said "In" caught during the outing (disqualified fish left out).
   { started, over, fish, species, catches (newest first), anglers: [{ uid, fish }] (most first), biggest } */
export function outingRecap(t, catches, rsvps = new Map(), now = Date.now()) {
  const going = new Set([...rsvps].filter(([, r]) => r.answer === "in").map(([u]) => u));
  const end = outingEnd(t);
  const list = catches.filter(c => going.has(c.uid) && !c.dq && c.caughtAt >= t.at && c.caughtAt <= end)
    .sort((a, b) => b.caughtAt - a.caughtAt);
  const per = new Map();
  for (const c of list) per.set(c.uid, (per.get(c.uid) || 0) + fishIn(c));
  const sized = list.filter(measured);
  const biggest = sized.filter(c => c.weightOz > 0).sort((a, b) => b.weightOz - a.weightOz)[0]
    || sized.filter(c => c.lengthIn > 0).sort((a, b) => b.lengthIn - a.lengthIn)[0] || null;
  return {
    started: now >= t.at, over: now > end, catches: list, biggest,
    fish: list.reduce((n, c) => n + fishIn(c), 0), species: new Set(list.map(c => c.species)).size,
    anglers: [...per].map(([uid, fish]) => ({ uid, fish })).sort((a, b) => b.fish - a.fish),
  };
}
