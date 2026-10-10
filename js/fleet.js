/* Boat profiles: the league's saved boats (fleet/{id}: { uid (owner, the captain), name, crew: [uid], notes, thumb, retired,
   createdAt, and optionally hp (horsepower), motor (brand), lengthFt, seats and capacityLb; captains: [{ uid, at }] every
   captain it has had, oldest first; offerTo/offerAt while the captain is handing it over to someone }). A catch can say which boat it was caught from (`boatId`), and a boat brought on an outing can point to
   a saved boat. Pure functions on plain data. (Saved boats are called the fleet in the code, because an outing's
   "boats" are the seats offered for that outing.) */
import { fishIn, better, measured } from "./stats.js";
import { outingEnd } from "./outings.js";

/* The boats an angler can pick: ones they own or crew on, not retired. Their own first, then by name. */
export function myBoats(me, fleet) {
  return [...fleet.values()].filter(b => !b.retired && (b.uid === me || (b.crew || []).includes(me)))
    .sort((a, b) => (b.uid === me) - (a.uid === me) || a.name.localeCompare(b.name));
}

/* Hand-overs. A captain offers the boat to another member; it's theirs once they accept (and set the crew). The boat
   keeps its catches; who was captain when matters for the boat badges. */

/* Every captain a boat has had, oldest first: [{ uid, at }]. Boats saved before hand-overs only have their first. */
export const captainsOf = b => (b.captains && b.captains.length ? b.captains : [{ uid: b.uid, at: b.createdAt || 0 }]);

/* Who was captain at time t (the first captain for anything before the boat was saved). */
export function captainAt(b, t) {
  const list = captainsOf(b);
  let u = list[0].uid;
  for (const c of list) if (c.at <= t) u = c.uid;
  return u;
}

/* Each captain's spell: [{ uid, from, to }] oldest first; `to` is null for the current captain. */
export const captainSpells = b => captainsOf(b).map((c, i, all) => ({ uid: c.uid, from: c.at, to: i + 1 < all.length ? all[i + 1].at : null }));

/* An angler's spells as captain across the fleet: [{ b, from, to }] oldest first. */
export const captaincies = (u, fleet) => [...fleet.values()].flatMap(b => captainSpells(b).filter(s => s.uid === u).map(s => ({ b, from: s.from, to: s.to })))
  .sort((x, y) => x.from - y.from);

/* The members a captain can hand a boat to: everyone else who isn't suspended, by name. */
export const handOverChoices = (b, members) => [...members.values()].filter(m => m.id !== b.uid && !m.suspended)
  .sort((x, y) => x.displayName.localeCompare(y.displayName));

/* The crew a new captain starts with: the old crew plus the old captain, less the new captain (they can change it). */
export const crewAfterHandOver = (b, to) => [...new Set([b.uid, ...(b.crew || [])])].filter(u => u !== to).slice(0, 20);

/* The captains list once `to` accepts at `at`. */
export const acceptedCaptains = (b, to, at) => [...captainsOf(b), { uid: to, at }];

/* Motor brands to pick from: outboards and sterndrives, then electric and trolling motors. */
export const MOTOR_BRANDS = [
  "Mercury", "Yamaha", "Honda", "Suzuki", "Tohatsu", "Evinrude", "Johnson", "Mariner", "Nissan", "MerCruiser", "Volvo Penta", "Indmar",
  "Minn Kota", "MotorGuide", "Garmin", "Torqeedo", "Other",
];
export const MAX_HP = 2000, MAX_LENGTH_FT = 100, MAX_SEATS = 30, MAX_CAPACITY_LB = 20000;

/* "150 hp Mercury", "Yamaha", "40 hp", or "" when neither is set. */
export const motorText = b => [b.hp ? `${b.hp} hp` : "", b.motor || ""].filter(Boolean).join(" ");

/* "17.5 ft · 4 seats · 1,200 lb capacity", whichever are set. */
export const specText = b => [b.lengthFt ? `${b.lengthFt} ft` : "", b.seats ? `${b.seats} seat${b.seats === 1 ? "" : "s"}` : "",
  b.capacityLb ? `${b.capacityLb.toLocaleString("en-US")} lb capacity` : ""].filter(Boolean).join(" · ");

/* Spare seats to offer when bringing this boat on an outing: its seats less the captain's, 1 to 12; 3 when it has no
   seats saved (the outing's usual default). */
export const spareSeats = b => (b && b.seats ? Math.min(12, Math.max(1, b.seats - 1)) : 3);

/* The Boats page: sorts, and the filters (whose boats, motor brand). */
export const BOAT_SORTS = [["fish", "Most fish"], ["name", "Name"], ["hp", "Horsepower"], ["length", "Length"], ["new", "Newest"]];
export const NO_BOAT_FILTERS = { sort: "fish", whose: "all", motor: "" };

/* rows: [{ b, s }] (s from boatStats). whose: "all" or "mine" (boats you own or crew on). motor: a brand, or "". */
export function listBoats(rows, { sort = "fish", whose = "all", motor = "" } = {}, me) {
  const byName = (x, y) => x.b.name.localeCompare(y.b.name);
  const order = {
    fish: (x, y) => y.s.fish - x.s.fish || byName(x, y),
    name: byName,
    hp: (x, y) => (y.b.hp || 0) - (x.b.hp || 0) || byName(x, y),
    length: (x, y) => (y.b.lengthFt || 0) - (x.b.lengthFt || 0) || byName(x, y),
    new: (x, y) => (y.b.createdAt || 0) - (x.b.createdAt || 0) || byName(x, y),
  }[sort] || byName;
  return rows.filter(({ b }) => (whose !== "mine" || b.uid === me || (b.crew || []).includes(me)) && (!motor || b.motor === motor)).sort(order);
}

/* A boat's catches, newest first (disqualified ones left out). */
export const boatCatches = (id, catches) => catches.filter(c => c.boatId === id && !c.dq).sort((a, b) => b.caughtAt - a.caughtAt);

/* { fish, catches, species, biggest, anglers: [{ uid, fish }] most first } */
export function boatStats(id, catches) {
  const list = boatCatches(id, catches);
  const per = new Map();
  let biggest = null;
  for (const c of list) {
    per.set(c.uid, (per.get(c.uid) || 0) + fishIn(c));
    if (measured(c)) biggest = biggest ? better(c, biggest) : c;
  }
  return {
    fish: list.reduce((n, c) => n + fishIn(c), 0), catches: list.length, species: new Set(list.map(c => c.species)).size, biggest,
    anglers: [...per].map(([uid, fish]) => ({ uid, fish })).sort((a, b) => b.fish - a.fish),
  };
}

/* The saved boat an angler is on for an outing happening at `now`: the one they brought, or the one they have a seat
   on (if its captain linked a saved boat). tripBoats: Map(trip id -> Map(owner uid -> { boatId, ... })). */
export function outingBoat(me, { trips = new Map(), rsvps = new Map(), tripBoats = new Map(), now = Date.now() }) {
  for (const t of trips.values()) {
    if (now < t.at - 3600000 || now > outingEnd(t)) continue;
    const r = (rsvps.get(t.id) || new Map()).get(me);
    if (!r || r.answer !== "in") continue;
    const boats = tripBoats.get(t.id) || new Map();
    const b = boats.get(me) || (r.boat && boats.get(r.boat));
    if (b && b.boatId) return b.boatId;
  }
  return null;
}

/* The boat to start a new catch with: the outing boat you're on now, else the boat on your last catch (if you can
   still pick it), else none. */
export function defaultBoat(me, { fleet, catches = [], ...outing }) {
  const fromOuting = outingBoat(me, outing);
  if (fromOuting && fleet.has(fromOuting)) return fromOuting;
  const mine = myBoats(me, fleet).map(b => b.id);
  const last = catches.filter(c => c.uid === me && c.boatId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  return last && mine.includes(last.boatId) ? last.boatId : null;
}

/* Outings a saved boat was brought on, newest first. */
export function boatOutings(id, trips, tripBoats) {
  return [...trips.values()].filter(t => [...(tripBoats.get(t.id) || new Map()).values()].some(b => b.boatId === id))
    .sort((a, b) => b.at - a.at);
}
