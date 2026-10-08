// Unit tests for the Hall of Fame. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordHistory, reignLength, longestReigns, recordSetters, allReigns } from "../js/halloffame.js";
import { recordSteals } from "../js/events.js";

const DAY = 86400000;
const c = (id, uid, species, weightOz, lengthIn, day, extra = {}) => ({ id, uid, species, weightOz, lengthIn, caughtAt: day * DAY, ...extra });

const catches = [
  c("a", "amy", "Walleye", 60, 19, 1),
  c("b", "bo", "Walleye", 50, 22, 3),     // longer, not heavier: takes the length record only
  c("d", "bo", "Walleye", 70, null, 5),   // heavier: takes the weight record
  c("e", "bo", "Walleye", 75, null, 9),   // beats his own record
  c("f", "amy", "Walleye", 99, 30, 12, { past: true }), // a past catch never counts
  c("g", "cy", "Walleye", 80, 25, 15, { dq: true }),    // nor a disqualified one
  c("h", "cy", "Muskie", 400, 44, 2),
  c("i", "amy", "Perch", null, null, 4),  // not measured
  c("j", "amy", "Walleye", 75, 20, 20),   // ties don't take a record
];

test("each species' record history, from the first record, with when it was broken and by whom", () => {
  const h = recordHistory(catches);
  assert.deepEqual([...h.keys()], ["Walleye", "Muskie"]);
  const w = h.get("Walleye");
  assert.deepEqual(w.weightOz.map(r => [r.c.id, r.until && r.until / DAY, r.brokenBy && r.brokenBy.id]), [["a", 5, "d"], ["d", 9, "e"], ["e", null, null]]);
  assert.deepEqual(w.lengthIn.map(r => [r.c.id, r.brokenBy && r.brokenBy.id]), [["a", "b"], ["b", null]]);
  assert.deepEqual(h.get("Muskie").weightOz.map(r => r.c.id), ["h"]);
});

test("it agrees with the record news (which leaves out beating your own record)", () => {
  const steals = recordSteals(catches).map(s => `${s.species}/${s.field}/${s.c.id}`);
  const changes = allReigns(recordHistory(catches)).filter(r => r.brokenBy && r.brokenBy.uid !== r.c.uid)
    .map(r => `${r.species}/${r.field}/${r.brokenBy.id}`);
  assert.deepEqual(changes.sort(), steals.sort());
});

test("reign lengths, the longest reigns, and who set the most records", () => {
  const h = recordHistory(catches), now = 30 * DAY;
  const wal = h.get("Walleye").weightOz;
  assert.equal(reignLength(wal[0], now), 4 * DAY);
  assert.equal(reignLength(wal[2], now), 21 * DAY); // still standing: counts up to now
  assert.deepEqual(longestReigns(h, 2, now).map(r => r.c.id), ["h", "h"]); // the muskie's weight and length, 28 days each
  assert.deepEqual(recordSetters(h), [
    { uid: "bo", set: 3, held: 2 }, { uid: "cy", set: 2, held: 2 }, { uid: "amy", set: 2, held: 0 }]); // a tie goes to who holds more now
});
