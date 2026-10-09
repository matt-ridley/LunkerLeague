// Unit tests for no-shows. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { attended, canMark, showRecord, boatTrips } from "../js/noshows.js";

const H = 3600e3, DAY = 24 * H;
const T0 = new Date(2026, 5, 6, 6).getTime();
const trip = (id, extra = {}) => ({ id, uid: "plan", title: id, at: T0, endAt: T0 + 6 * H, kind: "boat", ...extra });
const ans = entries => new Map(entries.map(([u, answer, boat]) => [u, { answer, at: 1, ...(boat ? { boat, seatAt: 1 } : {}) }]));

test("attended: no-shows' answers are left out; outings without any are untouched", () => {
  const rsvps = new Map([["t1", ans([["amy", "in"], ["bo", "in"]])], ["t2", ans([["amy", "in"]])]]);
  const noShows = new Map([["t1", new Map([["bo", { by: "plan", at: 5 }]])]]);
  const out = attended(rsvps, noShows);
  assert.deepEqual([...out.get("t1").keys()], ["amy"]);
  assert.equal(out.get("t2"), rsvps.get("t2"));
  assert.equal(attended(rsvps, new Map()), rsvps);
});

test("who can mark a no-show: planner, admin, or the rider's captain; only someone In; from the start until a week after", () => {
  const t = trip("t1");
  const answers = ans([["amy", "in", "cap"], ["bo", "maybe"], ["cap", "in"], ["plan", "in"]]);
  const during = T0 + H;
  assert.equal(canMark(t, "amy", "plan", { answers, now: during }), true);
  assert.equal(canMark(t, "amy", "zed", { admin: true, answers, now: during }), true);
  assert.equal(canMark(t, "amy", "cap", { answers, now: during }), true);           // her captain
  assert.equal(canMark(t, "cap", "amy", { answers, now: during }), false);          // a rider can't mark the captain
  assert.equal(canMark(t, "bo", "plan", { answers, now: during }), false);          // only someone In
  assert.equal(canMark(t, "plan", "plan", { answers, now: during }), false);        // not yourself
  assert.equal(canMark(t, "amy", "plan", { answers, now: T0 - H }), false);         // not before it starts
  assert.equal(canMark(t, "amy", "plan", { answers, now: T0 + 6 * H + 7 * DAY - 1 }), true);
  assert.equal(canMark(t, "amy", "plan", { answers, now: T0 + 6 * H + 7 * DAY + 1 }), false);
  assert.equal(canMark({ ...t, kind: "shore" }, "amy", "cap", { answers, now: during }), false); // captains only on boat outings
});

test("an angler's record: shows are outings over that they were In for and not marked; no-shows are timed when marked", () => {
  const trips = new Map([["t1", trip("t1")], ["t2", trip("t2", { at: T0 + DAY, endAt: T0 + DAY + H })], ["t3", trip("t3", { at: T0 + 30 * DAY, endAt: null })]]);
  const rsvps = new Map([["t1", ans([["amy", "in"]])], ["t2", ans([["amy", "in"]])], ["t3", ans([["amy", "in"]])]]);
  const noShows = new Map([["t2", new Map([["amy", { by: "plan", at: T0 + 2 * DAY }]])]]);
  const r = showRecord("amy", { trips, rsvps, noShows, now: T0 + 10 * DAY });
  assert.deepEqual(r.shows, [T0 + 6 * H]);           // t3 isn't over yet
  assert.deepEqual(r.noShows, [T0 + 2 * DAY]);
});

test("boat trips: riders who showed, a no-show captain's boat didn't go, and full means every seat taken by people who came", () => {
  const trips = new Map([["t1", trip("t1")], ["t2", trip("t2", { kind: "shore" })]]);
  const rsvps = new Map([["t1", ans([["cap", "in"], ["amy", "in", "cap"], ["bo", "in", "cap"], ["cy", "in", "dee"], ["dee", "in"]])]]);
  const tripBoats = new Map([["t1", new Map([["cap", { seats: 2, at: 1, boatId: "b1" }], ["dee", { seats: 1, at: 2 }]])]]);
  const now = T0 + DAY;
  let list = boatTrips({ trips, rsvps, tripBoats, now });
  assert.deepEqual(list.map(b => [b.owner, b.boatId, b.riders.join(), b.full]), [["cap", "b1", "amy,bo", true], ["dee", null, "cy", true]]);
  const noShows = new Map([["t1", new Map([["bo", { at: 1 }], ["dee", { at: 1 }]])]]);
  list = boatTrips({ trips, rsvps, tripBoats, noShows, now });
  assert.deepEqual(list.map(b => [b.owner, b.riders.join(), b.full]), [["cap", "amy", false]]);
  assert.deepEqual(boatTrips({ trips, rsvps, tripBoats, now: T0 + H }), []); // not over yet
});
