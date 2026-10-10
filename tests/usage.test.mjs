// Unit tests for the free plan use estimate. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { measure, openCost, freePlan, FREE_READS_DAY, FREE_DOWNLOAD_MONTH } from "../js/usage.js";

test("measure: documents and their size with a little overhead each", () => {
  assert.deepEqual(measure([{ a: 1 }, { b: "xy" }]), { docs: 2, bytes: 7 + 100 + 10 + 100 });
  assert.deepEqual(measure([]), { docs: 0, bytes: 0 });
});

test("open cost: totals, with the biggest parts first and their labels", () => {
  const c = openCost(new Map([["comments", { docs: 50, bytes: 10000 }], ["catches", { docs: 100, bytes: 3000000 }], ["mystery", { docs: 1, bytes: 10 }]]));
  assert.deepEqual([c.docs, c.bytes], [151, 3010010]);
  assert.deepEqual(c.parts.map(p => [p.key, p.label]), [["catches", "Catches (with their small photos)"], ["comments", "Comments"], ["mystery", "mystery"]]);
});

test("free plan: whichever of reads and downloads runs out first, and a busy day's share", () => {
  // 1,000 docs: 50 opens a day by reads. 3 MB: 10 GiB / 30 / 3 MiB = 113 opens a day by downloads.
  const f = freePlan({ docs: 1000, bytes: 3 * 1024 ** 2 }, { anglers: 8 });
  assert.deepEqual([f.byReads, f.byDownloads, f.opensPerDay, f.limit, f.busyDay, f.pct, f.level], [50, 113, 50, "reads", 40, 80, "warn"]);
  // Heavy photos: downloads run out first.
  const g = freePlan({ docs: 100, bytes: 30 * 1024 ** 2 }, { anglers: 2 });
  assert.deepEqual([g.byReads, g.byDownloads, g.limit, g.pct, g.level], [FREE_READS_DAY / 100, Math.floor(FREE_DOWNLOAD_MONTH / 30 / (30 * 1024 ** 2)), "downloads", 91, "warn"]);
  assert.equal(freePlan({ docs: 10, bytes: 1000 }, { anglers: 3 }).level, "ok");
  assert.equal(freePlan({ docs: 5000, bytes: 1000 }, { anglers: 10 }).level, "bad");
  // Nothing loaded yet: no limit in sight.
  assert.deepEqual([freePlan({ docs: 0, bytes: 0 }).opensPerDay, freePlan({ docs: 0, bytes: 0 }).pct], [Infinity, 0]);
});
