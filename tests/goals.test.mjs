// Unit tests for personal goals. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { goalTitle, goalProgress, goalsReached, goalWatch, yearPeriod, periodText } from "../js/goals.js";

const Y = yearPeriod(new Date(2026, 5, 1).getTime());
const at = (m, d, h = 12) => new Date(2026, m, d, h).getTime();
const c = (id, species, caughtAt, extra = {}) => ({ id, uid: "amy", species, caughtAt, ...extra });
const goal = (kind, extra = {}) => ({ id: "g", uid: "amy", kind, ...Y, ...extra });

test("titles and periods", () => {
  assert.equal(goalTitle(goal("species", { target: 10 })), "10 species");
  assert.equal(goalTitle(goal("days", { target: 1 })), "1 day out");
  assert.equal(goalTitle(goal("size", { species: "Muskie", field: "lengthIn", value: 40 })), "A Muskie of 40\"+");
  assert.equal(goalTitle(goal("size", { species: "Walleye", field: "weightOz", value: 160 })), "A Walleye of 10 lb+");
  assert.equal(goalTitle(goal("pb", { species: "Walleye", field: "weightOz" })), "Beat my Walleye weight PB");
  assert.equal(periodText(goal("fish")), "in 2026");
  assert.equal(periodText({ from: at(4, 1), to: at(8, 30) }), "2026-May-01 to 2026-Sep-30");
});

test("counting goals: species, fish (a stringer counts its fish) and days out, inside the period only", () => {
  const catches = [
    c("old", "Walleye", new Date(2025, 11, 30).getTime()),
    c("a", "Walleye", at(4, 1)), c("b", "Walleye", at(4, 1, 15)), c("d", "Yellow Perch", at(4, 3), { fishCount: 20 }),
    c("e", "Muskie", at(5, 9)), c("x", "Bluegill", at(5, 10), { dq: true }), { ...c("y", "Pike", at(5, 11)), uid: "bo" },
  ];
  const sp = goalProgress(goal("species", { target: 3 }), { catches });
  assert.deepEqual([sp.current, sp.done, sp.catchId, sp.text], [3, true, "e", "3 of 3"]);
  const fish = goalProgress(goal("fish", { target: 50 }), { catches });
  assert.deepEqual([fish.current, fish.done, fish.pct], [23, false, 46]);
  const days = goalProgress(goal("days", { target: 4 }), { catches, skunks: [{ uid: "amy", day: "2026-05-02" }] });
  assert.deepEqual([days.current, days.done, days.catchId], [4, true, "e"]); // May 1, 2 (skunk), 3, Jun 9
});

test("size goals: the first fish at least that big", () => {
  const catches = [c("a", "Muskie", at(5, 1), { lengthIn: 38 }), c("b", "Muskie", at(6, 1), { lengthIn: 41.5 }), c("d", "Muskie", at(7, 1), { lengthIn: 44 })];
  const p = goalProgress(goal("size", { species: "Muskie", field: "lengthIn", value: 40 }), { catches });
  assert.deepEqual([p.done, p.catchId, p.doneAt, p.current], [true, "b", at(6, 1), 44]);
  const not = goalProgress(goal("size", { species: "Muskie", field: "weightOz", value: 400 }), { catches });
  assert.deepEqual([not.done, not.text], [false, "None yet"]);
});

test("PB goals: beat the best from before the period; with none, the first one measured sets it", () => {
  const catches = [c("old", "Walleye", new Date(2025, 6, 1).getTime(), { weightOz: 100 }),
    c("a", "Walleye", at(4, 1), { weightOz: 90 }), c("b", "Walleye", at(5, 1), { weightOz: 101 })];
  const p = goalProgress(goal("pb", { species: "Walleye", field: "weightOz" }), { catches });
  assert.deepEqual([p.done, p.catchId, p.target], [true, "b", 100]);
  const fresh = goalProgress(goal("pb", { species: "Walleye", field: "lengthIn" }), { catches: [c("z", "Walleye", at(4, 1), { lengthIn: 20 })] });
  assert.deepEqual([fresh.done, fresh.catchId], [true, "z"]);
});

test("goals reached are news; the Fish Finder watches the closest counting goal that's at least half done", () => {
  const catches = [c("a", "Walleye", at(4, 1)), c("b", "Yellow Perch", at(4, 2)), c("d", "Muskie", at(4, 3))];
  const goals = [goal("species", { id: "g1", target: 3 }), goal("species", { id: "g2", target: 4 }), goal("fish", { id: "g3", target: 10 }),
    goal("fish", { id: "g4", target: 4, from: at(0, 1), to: at(1, 1) })];
  assert.deepEqual(goalsReached(goals, { catches }).map(r => [r.g.id, r.catchId]), [["g1", "d"]]);
  const w = goalWatch("amy", goals, { catches, now: at(4, 10) });
  assert.deepEqual([w.g.id, w.left, w.unit], ["g2", 1, "species"]); // 75% beats the fish goal at 30%; g4 isn't on now
  assert.equal(goalWatch("bo", goals, { catches, now: at(4, 10) }), null);
});
