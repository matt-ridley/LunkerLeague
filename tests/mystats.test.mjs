// Unit tests for an angler's stats page. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { inPeriod, summary, byMonth, byDaypart, bySpecies, byLure, byTechnique, usualDepth, whatsWorking } from "../js/mystats.js";

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const c = (id, species, caughtAt, extra = {}) => ({ id, uid: "amy", species, caughtAt, ...extra });
const tk = entries => new Map(entries.map(([id, lure, technique = "", depthFt = null]) => [id, { lure, technique, depthFt, shared: true }]));

test("periods: all time, this calendar year, the last 12 months", () => {
  const now = at(2026, 9, 8);
  const all = [c("a", "Walleye", at(2025, 0, 5)), c("b", "Walleye", at(2025, 11, 1)), c("d", "Walleye", at(2026, 2, 1))];
  assert.equal(inPeriod(all, "all", now).length, 3);
  assert.deepEqual(inPeriod(all, "year", now).map(x => x.id), ["d"]);
  assert.deepEqual(inPeriod(all, "12m", now).map(x => x.id), ["b", "d"]);
});

test("the summary counts a stringer as its fish, and days with a fish", () => {
  const all = [c("a", "Walleye", at(2026, 5, 1, 6)), c("b", "Yellow Perch", at(2026, 5, 1, 9), { fishCount: 30, limit: true }), c("d", "Walleye", at(2026, 5, 2))];
  assert.deepEqual(summary(all), { fish: 32, catches: 3, species: 2, days: 2 });
});

test("by month adds every year together; by time of day wraps night over midnight", () => {
  const all = [c("a", "Walleye", at(2025, 5, 1, 5)), c("b", "Walleye", at(2026, 5, 9, 23)), c("d", "Walleye", at(2026, 0, 9, 2)), c("e", "Walleye", at(2026, 0, 9, 13))];
  const m = byMonth(all);
  assert.equal(m[5], 2); assert.equal(m[0], 2); assert.equal(m.reduce((a, b) => a + b), 4);
  const p = byDaypart(all);
  assert.equal(p.find(x => x.label.startsWith("Early")).n, 1);
  assert.equal(p.find(x => x.label.startsWith("Night")).n, 2);
  assert.equal(p.find(x => x.label.startsWith("Midday")).n, 1);
});

test("species and lures are ranked by fish; lures typed differently group together", () => {
  const all = [c("a", "Walleye", 1), c("b", "Walleye", 2), c("d", "Yellow Perch", 3, { fishCount: 5 })];
  assert.deepEqual(bySpecies(all), [{ label: "Yellow Perch", n: 5 }, { label: "Walleye", n: 2 }]);
  const lures = byLure(all, tk([["a", "Jig"], ["b", "jig "], ["d", "Minnow"]]));
  assert.deepEqual(lures, [{ label: "Minnow", n: 5 }, { label: "Jig", n: 2 }]);
  assert.deepEqual(byTechnique(all, tk([["a", "", "jigging"], ["b", "", "trolling"], ["d", "", "jigging"]]))[0], { label: "Jigging", n: 6 });
});

test("usual depth is the middle depth of fish caught at a known depth", () => {
  const all = [c("a", "Walleye", 1), c("b", "Walleye", 2), c("d", "Walleye", 3), c("e", "Walleye", 4)];
  assert.equal(usualDepth(all, tk([["a", "", "", 10], ["b", "", "", 20], ["d", "", "", 30]])), 20);
  assert.equal(usualDepth(all, tk([["a", "", "", 10], ["b", "", "", 15]])), 12.5);
  assert.equal(usualDepth(all, new Map()), null);
});

test("what's working: species with enough fish on noted tackle, top lures and techniques, most fish first", () => {
  const all = [c("a", "Walleye", 1), c("b", "Walleye", 2), c("d", "Walleye", 3), c("e", "Muskie", 4), c("f", "Yellow Perch", 5, { fishCount: 12 }), c("g", "Bluegill", 6)];
  const tackle = tk([["a", "Jig", "jigging", 18], ["b", "Jig", "jigging", 22], ["d", "Crankbait", "trolling"], ["e", "Bucktail", "casting"], ["f", "Minnow", "", 25]]);
  const w = whatsWorking(all, tackle);
  assert.deepEqual(w.map(x => x.species), ["Yellow Perch", "Walleye"]); // Muskie has 1 fish; Bluegill has no tackle
  const wal = w[1];
  assert.equal(wal.fish, 3);
  assert.deepEqual(wal.lures, [{ label: "Jig", n: 2 }, { label: "Crankbait", n: 1 }]);
  assert.deepEqual(wal.techniques, [{ label: "Jigging", n: 2 }, { label: "Trolling", n: 1 }]);
  assert.equal(wal.depth, 20);
  assert.equal(whatsWorking(all, tackle, { minFish: 1 }).length, 3);
});
