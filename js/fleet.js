/* Boat profiles: the league's saved boats (fleet/{id}: { uid (owner), name, crew: [uid], notes, thumb, retired,
   createdAt, and optionally hp (horsepower), motor (brand), lengthFt, seats and capacityLb }). A catch can say which boat it was caught from (`boatId`), and a boat brought on an outing can point to
   a saved boat. Pure functions on plain data. (Saved boats are called the fleet in the code, because an outing's
   "boats" are the seats offered for that outing.) */
import { fishIn, better, measured } from "./stats.js";
import { outingEnd } from "./outings.js";

/* The boats an angler can pick: ones they own or crew on, not retired. Their own first, then by name. */
export function myBoats(me, fleet) {
  return [...fleet.values()].filter(b => !b.retired && (b.uid === me || (b.crew || []).includes(me)))
    .sort((a, b) => (b.uid === me) - (a.uid === me) || a.name.localeCompare(b.name));
}

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
