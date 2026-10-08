// Unit tests for the skunk tracker. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, dayAt, skunkId, outingSkunkDays, daysOut } from "../js/skunks.js";

const at = (m, d, h = 12) => new Date(2026, m, d, h).getTime();
const c = (uid, caughtAt, extra = {}) => ({ id: `${uid}${caughtAt}`, uid, species: "Walleye", caughtAt, ...extra });
const now = at(9, 8, 20);

test("days are local calendar days", () => {
  assert.equal(dayKey(at(0, 5, 0)), "2026-01-05");
  assert.equal(dayKey(at(0, 5, 23)), "2026-01-05");
  assert.equal(dayKey(dayAt("2026-03-09")), "2026-03-09");
  assert.equal(skunkId("amy", "2026-03-09"), "amy_2026-03-09");
});

test("an outing counts as a skunk for anglers who were In, it's over, and they caught nothing during it", () => {
  const trips = new Map([
    ["t1", { id: "t1", at: at(8, 1, 6), endAt: at(8, 1, 14) }],
    ["t2", { id: "t2", at: at(8, 2, 6) }],             // ends at the end of the day
    ["t3", { id: "t3", at: at(9, 8, 18) }],            // still on today
  ]);
  const rsvps = new Map([
    ["t1", new Map([["amy", { answer: "in" }], ["bo", { answer: "in" }], ["cy", { answer: "maybe" }]])],
    ["t2", new Map([["amy", { answer: "in" }]])],
    ["t3", new Map([["amy", { answer: "in" }]])],
  ]);
  const catches = [c("bo", at(8, 1, 9)), c("amy", at(8, 2, 22)), c("amy", at(8, 1, 16))]; // amy's fish on day 1 was after the outing
  assert.deepEqual([...outingSkunkDays("amy", catches, trips, rsvps, now)], ["2026-09-01"]);
  assert.deepEqual([...outingSkunkDays("bo", catches, trips, rsvps, now)], []);
  assert.deepEqual([...outingSkunkDays("cy", catches, trips, rsvps, now)], []);
});

test("days out: fish days plus skunk days, and a day with a fish is never a skunk", () => {
  const catches = [c("amy", at(5, 1)), c("amy", at(5, 1, 15)), c("amy", at(5, 5), { fishCount: 10 }), c("amy", at(5, 9), { dq: true }), c("bo", at(5, 2))];
  const skunks = [{ uid: "amy", day: "2026-06-02" }, { uid: "amy", day: "2026-06-03" }, { uid: "amy", day: "2026-06-05" }, { uid: "bo", day: "2026-06-04" }];
  const r = daysOut("amy", { catches, skunks, now });
  assert.deepEqual(r.days.map(d => [d.day, d.fish, d.skunk]), [
    ["2026-06-01", 2, false], ["2026-06-02", 0, true], ["2026-06-03", 0, true], ["2026-06-05", 10, false]]);
  assert.equal(r.daysOut, 4);
  assert.equal(r.skunkDays, 2);
  assert.equal(r.fish, 12);
  assert.equal(r.fishPerDay, 3);
  assert.equal(r.days[1].logged, true);
});

test("skunk streaks count days out in a row, and the current streak is the latest run", () => {
  const skunks = ["2026-06-02", "2026-06-03", "2026-06-10", "2026-06-20", "2026-06-21", "2026-06-25"].map(day => ({ uid: "amy", day }));
  const catches = [c("amy", at(5, 1)), c("amy", at(5, 15))];
  const r = daysOut("amy", { catches, skunks, now });
  assert.equal(r.longestStreak, 3);   // 2nd, 3rd, 10th (days at home in between don't break it)
  assert.equal(r.currentStreak, 3);   // 20th, 21st, 25th after the fish on the 15th
  const none = daysOut("amy", { catches: [c("amy", at(5, 1))], now });
  assert.equal(none.longestStreak, 0);
  assert.equal(none.currentStreak, 0);
});

test("days out can be limited to a period", () => {
  const catches = [c("amy", at(0, 10)), c("amy", at(6, 10))];
  const skunks = [{ uid: "amy", day: "2026-01-11" }, { uid: "amy", day: "2026-07-11" }];
  const r = daysOut("amy", { catches, skunks, from: at(6, 1, 0), to: now, now });
  assert.deepEqual(r.days.map(d => d.day), ["2026-07-10", "2026-07-11"]);
  assert.equal(daysOut("nobody", { catches, skunks, now }).fishPerDay, 0);
});
