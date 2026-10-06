// Unit tests for outings: seats on boats and the recap. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { outingEnd, seating, outingRecap } from "../js/outings.js";
import { leagueEvents } from "../js/events.js";

const H = 3600e3;
const T0 = new Date(2026, 5, 13, 6).getTime(); // Sat 6 AM
const boatTrip = { id: "t1", uid: "amy", title: "Saturday walleye", at: T0, kind: "boat" };
const rsvp = (answer, boat = "", seatAt = 0) => ({ answer, at: 1, boat, seatAt });

test("an outing runs to its back-by time, or to the end of its day", () => {
  assert.equal(outingEnd({ at: T0, endAt: T0 + 5 * H }), T0 + 5 * H);
  assert.equal(new Date(outingEnd({ at: T0 })).getHours(), 23);
  assert.equal(outingEnd({ at: T0, endAt: T0 - H }), outingEnd({ at: T0 })); // a bad back-by is ignored
});

test("seats go first come, first seated; a full boat has a waitlist that moves up", () => {
  const boats = new Map([["amy", { seats: 2, name: "", at: 1 }], ["bo", { seats: 1, name: "Bo's Lund", at: 2 }]]);
  const rsvps = new Map([
    ["amy", rsvp("in")], ["bo", rsvp("in")],                        // the captains
    ["cy", rsvp("in", "amy", 10)], ["di", rsvp("in", "amy", 5)], ["ed", rsvp("in", "amy", 20)],  // 3 want amy's 2 seats
    ["fy", rsvp("in")],                                             // in, no seat
    ["gu", rsvp("maybe")],                                          // not in: never seated
  ]);
  const s = seating(boatTrip, rsvps, boats);
  assert.deepEqual(s.boats.map(b => [b.owner, b.riders, b.waitlist]), [["amy", ["di", "cy"], ["ed"]], ["bo", [], []]]);
  assert.deepEqual(s.needsSeat, ["fy"]);
  // di gives up the seat: ed moves up from the waitlist.
  rsvps.set("di", rsvp("in"));
  assert.deepEqual(seating(boatTrip, rsvps, boats).boats[0].riders, ["cy", "ed"]);
  // A boat taken off: its riders (and its owner, now boatless) need a seat again.
  boats.delete("amy");
  assert.deepEqual(seating(boatTrip, rsvps, boats).needsSeat.sort(), ["amy", "cy", "di", "ed", "fy"]);
  // Shore outings have no seats.
  assert.deepEqual(seating({ ...boatTrip, kind: "shore" }, rsvps, boats), { boats: [], needsSeat: [] });
});

test("the recap is what the people who were In caught during the outing", () => {
  const f = (uid, species, extra) => ({ id: uid + species + (extra.caughtAt || 0), uid, species, weightOz: null, lengthIn: null, caughtAt: T0 + 2 * H, ...extra });
  const catches = [
    f("amy", "Walleye", { weightOz: 40 }), f("amy", "Perch", { lengthIn: 9 }), f("bo", "Pike", { lengthIn: 29 }),
    f("bo", "Bass", { weightOz: 30, caughtAt: T0 - H }),           // before it started
    f("cy", "Walleye", { weightOz: 99 }),                           // a maybe: not on the outing
    f("amy", "Perch", { fishCount: 12, limit: true, caughtAt: T0 + 3 * H }), // a stringer: 12 fish
    f("bo", "Walleye", { weightOz: 200, dq: true }),                // disqualified
  ];
  const rsvps = new Map([["amy", rsvp("in")], ["bo", rsvp("in")], ["cy", rsvp("maybe")]]);
  const r = outingRecap(boatTrip, catches, rsvps, T0 + 4 * H);
  assert.equal(r.started, true); assert.equal(r.over, false);
  assert.equal(r.fish, 15); assert.equal(r.species, 3);
  assert.deepEqual(r.anglers, [{ uid: "amy", fish: 14 }, { uid: "bo", fish: 1 }]);
  assert.equal(r.biggest.species, "Walleye"); // weighed fish first
  assert.equal(outingRecap(boatTrip, catches, rsvps, T0 - H).started, false);
});

test("an outing that's over and caught fish gets one line in the feed", () => {
  const catches = [{ id: "c1", uid: "bo", species: "Northern Pike", weightOz: null, lengthIn: 29, caughtAt: T0 + H }];
  const data = { catches, derbies: [], trips: new Map([["t1", boatTrip]]), rsvps: new Map([["t1", new Map([["bo", rsvp("in")]])]]),
    name: u => u.toUpperCase(), now: T0 + 2 * 86400e3 };
  const news = leagueEvents(data).find(e => e.id === "outing:t1");
  assert.equal(news.text, "Saturday walleye: 1 fish, biggest BO's 29\" Northern Pike");
  assert.equal(leagueEvents({ ...data, now: T0 + 2 * H }).find(e => e.id === "outing:t1"), undefined); // not over yet
  assert.equal(leagueEvents({ ...data, catches: [] }).find(e => e.id === "outing:t1"), undefined);   // nothing caught
});
