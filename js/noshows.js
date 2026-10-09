/* No-shows: an angler who said "In" to an outing but didn't turn up. The outing's planner, an admin, or (on a boat
   outing) the captain of the boat they had a seat on can mark them, from when the outing starts until a week after it
   ends. Saved as trips/{id}/noShows/{uid}: { by, at }. A no-show doesn't count as being there (no skunk, recap, days
   out or outing badges) and costs points. Pure functions on plain data.
   noShows: Map(trip id -> Map(uid -> { by, at })). */
import { outingEnd, isBoatOuting, seating } from "./outings.js";

const DAY = 24 * 3600 * 1000;
export const MARK_DAYS = 7;

const marksOf = (noShows, tid) => noShows.get(tid) || new Map();

/* The RSVPs without the no-shows' answers: who was really there. */
export function attended(rsvps, noShows = new Map()) {
  if (!noShows.size) return rsvps;
  const out = new Map();
  for (const [tid, m] of rsvps) {
    const gone = marksOf(noShows, tid);
    out.set(tid, gone.size ? new Map([...m].filter(([u]) => !gone.has(u))) : m);
  }
  return out;
}

/* Can `me` mark (or unmark) `target` as a no-show? answers: this outing's RSVPs (Map uid -> { answer, boat }). */
export function canMark(t, target, me, { admin = false, answers = new Map(), now = Date.now() } = {}) {
  const r = answers.get(target);
  if (!r || r.answer !== "in" || target === me) return false;
  if (now < t.at || now > outingEnd(t) + MARK_DAYS * DAY) return false;
  return t.uid === me || admin || (isBoatOuting(t) && r.boat === me);
}

/* An angler's outings: shows (outings over that they were In for and weren't marked, timed at the outing's end) and
   no-shows (timed when marked), each oldest first. rsvps are everyone's answers, before attended(). */
export function showRecord(uid, { trips = new Map(), rsvps = new Map(), noShows = new Map(), now = Date.now() } = {}) {
  const shows = [], misses = [];
  for (const t of trips.values()) {
    const mark = marksOf(noShows, t.id).get(uid);
    if (mark) { misses.push(mark.at || 0); continue; }
    const r = (rsvps.get(t.id) || new Map()).get(uid);
    if (r && r.answer === "in" && outingEnd(t) < now) shows.push(outingEnd(t));
  }
  shows.sort((a, b) => a - b); misses.sort((a, b) => a - b);
  return { shows, noShows: misses };
}

/* Every boat on a boat outing that's over, with the riders who turned up. A boat whose captain was a no-show didn't go.
   [{ tripId, at, owner, boatId, seats, riders: [uid], full }] oldest first; full = every seat taken and everyone showed. */
export function boatTrips({ trips = new Map(), rsvps = new Map(), tripBoats = new Map(), noShows = new Map(), now = Date.now() } = {}) {
  const out = [];
  for (const t of trips.values()) {
    if (!isBoatOuting(t) || outingEnd(t) >= now) continue;
    const gone = marksOf(noShows, t.id), boats = tripBoats.get(t.id) || new Map();
    for (const b of seating(t, rsvps.get(t.id) || new Map(), boats).boats) {
      if (gone.has(b.owner)) continue;
      const riders = b.riders.filter(u => !gone.has(u));
      out.push({ tripId: t.id, at: outingEnd(t), owner: b.owner, boatId: (boats.get(b.owner) || {}).boatId || null, seats: b.seats,
        riders, full: b.seats > 0 && riders.length === b.seats });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
