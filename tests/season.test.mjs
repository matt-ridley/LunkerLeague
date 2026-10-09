// Unit tests for seasons. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_SEASON, seasonOf, seasonName, seasonLong, isPreseason, seasonOver, ordinal, seasonTables, thisSeason, careerBest, seasonChampions } from "../js/season.js";

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
let n = 0;
const fish = (uid, species, weightOz, t) => ({ id: "c" + ++n, uid, species, weightOz, lengthIn: null, caughtAt: t, createdAt: t });
const base = extra => ({ derbies: [], entrants: new Map(), versions: [], members: ["amy", "bo"], crowns: [], badges: [], ...extra });
const pts = (rows, u) => rows.find(r => r.uid === u).points;

test("names: 2026 is the Preseason and 2027 is Season 1", () => {
  assert.equal(FIRST_SEASON, 2027);
  assert.ok(isPreseason(2026) && !isPreseason(2027));
  assert.equal(seasonName(2026), "2026 Preseason");
  assert.equal(seasonName(2028), "2028 Season");
  assert.equal(seasonLong(2028), "Season 2 (2028)");
  assert.equal(seasonOf(at(2027, 0, 1, 0)), 2027);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"]);
  assert.ok(!seasonOver(2026, at(2026, 11, 31, 23)) && seasonOver(2026, at(2027, 0, 1, 0)));
});

test("every season starts at 0; species are new again; records held now count in this season only", () => {
  const catches = [fish("amy", "Walleye", 60, at(2026, 9, 10)), fish("amy", "Walleye", 50, at(2027, 4, 1))];
  const now = at(2027, 5, 1);
  const t = seasonTables(base({ catches }), now);
  // 2026: 1 catch + 3 species (no records: the board is held now, so its points are in 2027)
  assert.equal(pts(t.years.get(2026), "amy"), 1 + 3);
  // 2027: 1 catch + 3 species again + 5 for holding the walleye weight record
  assert.equal(pts(t.years.get(2027), "amy"), 1 + 3 + 5);
  assert.equal(pts(t.career, "amy"), 4 + 9);
  assert.equal(pts(thisSeason(base({ catches }), now), "amy"), 9);
  assert.equal(pts(t.years.get(2027), "bo"), 0);   // every member is listed
  assert.equal(t.years.get(2027)[0].title, "Bait Bucket");      // 9 pts: titles go by season points
});

test("a new season with nothing logged yet is everyone at 0", () => {
  const rows = thisSeason(base({ catches: [fish("amy", "Perch", null, at(2026, 9, 10))] }), at(2027, 0, 1, 1));
  assert.deepEqual(rows.map(r => r.points), [0, 0]);
  assert.equal(rows[0].title, "Bait Bucket");
});

test("best title and finish skip the Preseason, and a place only counts once its season is over", () => {
  const lots = (uid, y, k) => Array.from({ length: k }, (_, i) => fish(uid, "Sp" + i, null, at(y, 5, 1 + i)));
  const catches = [...lots("amy", 2026, 20), ...lots("amy", 2027, 3), ...lots("bo", 2027, 5), ...lots("amy", 2028, 8)];
  const early = catches.filter(c => c.caughtAt < at(2027, 0, 1, 0));
  const pre = careerBest(seasonTables(base({ catches: early }), at(2026, 11, 1)), "amy", at(2026, 11, 1));
  assert.deepEqual(pre, { title: null, finish: null });
  const now = at(2028, 6, 1), t = seasonTables(base({ catches }), now), best = careerBest(t, "amy", now);
  assert.equal(best.finish.year, 2027);              // 2028 isn't over yet
  assert.equal(best.finish.place, 2);
  assert.equal(best.title.year, 2028);
  assert.equal(best.title.name, t.years.get(2028).find(r => r.uid === "amy").title);
});

test("the Champions wall lists finished seasons, newest first, the Preseason marked", () => {
  const catches = [fish("amy", "Perch", null, at(2026, 9, 10)), fish("bo", "Perch", null, at(2027, 4, 1)), fish("bo", "Pike", null, at(2027, 4, 2)),
    fish("amy", "Perch", null, at(2028, 1, 1))];
  const now = at(2028, 2, 1), wall = seasonChampions(seasonTables(base({ catches }), now), now);
  assert.deepEqual(wall.map(s => [s.year, s.preseason, s.podium[0].uid]), [[2027, false, "bo"], [2026, true, "amy"]]);
  assert.equal(wall[0].podium.length, 1);   // only anglers with points
});
