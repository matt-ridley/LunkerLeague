// Unit tests for personal bests and species leaderboards. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { better, personalBests, checkNewPB, speciesBoard, speciesRecords, recordKinds, anglerStats } from "../js/stats.js";
import { normalizeSpecies } from "../js/species.js";

const c = (id, uid, species, weightOz, lengthIn, caughtAt = 1) => ({ id, uid, species, weightOz, lengthIn, caughtAt });

test("heavier wins, then longer, then whoever caught it first", () => {
  assert.equal(better(c("a", "u", "Walleye", 80, 20), c("b", "u", "Walleye", 90, 18)).id, "b");
  assert.equal(better(c("a", "u", "Walleye", 80, 22), c("b", "u", "Walleye", 80, 20)).id, "a");
  assert.equal(better(c("a", "u", "Walleye", 80, 20, 5), c("b", "u", "Walleye", 80, 20, 3)).id, "b");
  assert.equal(better(c("a", "u", "Walleye", null, 25), c("b", "u", "Walleye", 10, null)).id, "b");
});

test("personal bests are per angler and per species", () => {
  const all = [c("1", "amy", "Walleye", 60, 19), c("2", "amy", "Walleye", 90, 22), c("3", "amy", "Northern Pike", 200, 34), c("4", "bo", "Walleye", 120, 25)];
  const pbs = personalBests(all, "amy");
  assert.equal(pbs.get("Walleye").id, "2");
  assert.equal(pbs.get("Northern Pike").id, "3");
  assert.equal(pbs.size, 2);
});

test("a first catch of a species is a PB; a smaller one isn't; disqualified catches don't count", () => {
  const all = [c("1", "amy", "Walleye", 60, 19)];
  assert.equal(checkNewPB(c("n", "amy", "Muskie", 300, 40), all).pb, true);
  assert.equal(checkNewPB(c("n", "amy", "Walleye", 50, 18, 9), all).pb, false);
  const beat = checkNewPB(c("n", "amy", "Walleye", 61, 18, 9), all);
  assert.equal(beat.pb, true);
  assert.equal(beat.previous.id, "1");
  assert.equal(personalBests([{ ...all[0], dq: true }], "amy").size, 0);
});

test("editing a catch compares it against the angler's other catches only", () => {
  const all = [c("1", "amy", "Walleye", 60, 19), c("2", "amy", "Walleye", 40, 17)];
  assert.equal(checkNewPB({ ...all[0], weightOz: 70 }, all).pb, true);
});

test("species board shows each angler's best once, ranked, ties to the earlier catch", () => {
  const all = [
    c("1", "amy", "Walleye", 90, 22, 10), c("2", "amy", "Walleye", 100, 21, 20),
    c("3", "bo", "Walleye", 100, 23, 15), c("4", "cy", "Walleye", null, 30), c("5", "cy", "Bluegill", 9, 8),
  ];
  assert.deepEqual(speciesBoard(all, "Walleye", "weight").map(x => x.id), ["3", "2"]);
  assert.deepEqual(speciesBoard(all, "Walleye", "length").map(x => x.id), ["4", "3", "1"]);
});

test("species records and record badges", () => {
  const all = [c("1", "amy", "Walleye", 90, 22), c("2", "bo", "Walleye", 80, 26), c("3", "bo", "Bluegill", 9, 8)];
  const rec = speciesRecords(all);
  assert.deepEqual(rec.map(r => [r.species, r.count, r.weight.id, r.length.id]), [["Walleye", 2, "1", "2"], ["Bluegill", 1, "3", "3"]]);
  assert.deepEqual(recordKinds(all[0], all), ["weight"]);
  assert.deepEqual(recordKinds(all[1], all), ["length"]);
  assert.deepEqual(anglerStats(all, "bo"), { catches: 2, species: 2 });
});

test("species names are tidied so the same fish ranks together", () => {
  assert.equal(normalizeSpecies("  largemouth   bass "), "Largemouth Bass");
  assert.equal(normalizeSpecies("musky"), "Muskie");
  assert.equal(normalizeSpecies("tiger trout"), "Tiger Trout");
  assert.equal(normalizeSpecies(""), "");
});

test("an unmeasured catch counts as a catch but is never a PB or a record", () => {
  const all = [c("1", "amy", "Walleye", null, null, 1), c("2", "amy", "Perch", null, null, 2), c("3", "amy", "Perch", 8, null, 3)];
  assert.equal(personalBests(all, "amy").has("Walleye"), false);
  assert.equal(personalBests(all, "amy").get("Perch").id, "3");
  assert.equal(checkNewPB(c("n", "amy", "Muskie", null, null, 9), all).pb, false);
  assert.deepEqual(recordKinds(all[0], all), []);
  assert.deepEqual(anglerStats(all, "amy"), { catches: 3, species: 2 });
});

test("a stringer is never a PB or on a board, but its fish all count", () => {
  const str = { ...c("s", "u", "Yellow Perch", 400, null), fishCount: 50, limit: true }; // weight somehow present
  const all = [str, c("a", "u", "Yellow Perch", 8, null)];
  assert.equal(personalBests(all, "u").get("Yellow Perch").id, "a");
  assert.equal(checkNewPB(str, all).pb, false);
  assert.deepEqual(speciesBoard(all, "Yellow Perch").map(x => x.id), ["a"]);
  assert.deepEqual(recordKinds(str, all), []);
  assert.deepEqual(anglerStats(all, "u"), { catches: 51, species: 1 });
  assert.equal(speciesRecords(all)[0].count, 51);
});
