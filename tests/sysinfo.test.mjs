// Unit tests for the System info page's pure parts. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusText, leagueFacts } from "../js/sysinfo.js";

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const c = (id, species, caughtAt, extra = {}) => ({ id, uid: "amy", species, caughtAt, createdAt: caughtAt, ...extra });

test("every connection state has words, and unknown ones fall back to signed out", () => {
  for (const k of ["live", "busy", "offline", "bad"]) assert.ok(statusText(k).title && statusText(k).text);
  assert.equal(statusText("live").title, "Connected");
  assert.match(statusText("offline").title, /Offline/);
  assert.equal(statusText("nope").title, "Not signed in");
});

test("league facts count league fish (stringers in full) but keep past catches apart", () => {
  const now = at(2026, 9, 8, 18); // Thursday 2026-Oct-08
  const catches = [
    c("a", "Walleye", at(2026, 9, 8, 9), { weightOz: 40 }),           // today
    c("b", "Walleye", at(2026, 9, 6), { fishCount: 4, weightOz: 99 }), // Tuesday this week; a stringer's weight isn't counted
    c("d", "Muskie", at(2026, 8, 27), { weightOz: 200 }),              // a Sunday, last month
    c("p", "Pike", at(2019, 5, 1), { past: true, weightOz: 300 }),     // logbook only
  ];
  const f = leagueFacts({ catches, members: 3, league: { createdAt: at(2026, 9, 1, 12) }, now,
    derbies: [{ start: at(2026, 9, 2) }, { start: at(2026, 9, 3), cancelled: true }, { start: at(2026, 9, 4), testing: true }, { start: at(2026, 10, 1) }],
    trips: [{ at: at(2026, 9, 5) }, { at: at(2026, 9, 20) }] });
  assert.equal(f.ageDays, 7);
  assert.equal(f.catches, 3);
  assert.equal(f.logbook, 1);
  assert.equal(f.fish, 6);
  assert.equal(f.species, 2);
  assert.equal(f.weightOz, 240);
  assert.equal(f.weighed, 2);
  assert.equal(f.today, 1);
  assert.equal(f.week, 5);
  assert.deepEqual(f.topSpecies, { name: "Walleye", fish: 5 });
  assert.equal(f.busiestDay, "Tuesday");
  assert.equal(f.firstCatch.id, "d");
  assert.equal(f.derbies, 1);
  assert.equal(f.outings, 1);
});

test("an empty league has no facts to show yet", () => {
  const f = leagueFacts({});
  assert.equal(f.fish, 0);
  assert.equal(f.topSpecies, null);
  assert.equal(f.busiestDay, null);
  assert.equal(f.firstCatch, null);
  assert.equal(f.ageDays, null);
});
