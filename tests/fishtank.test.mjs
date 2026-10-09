// Unit tests for the Fish Tank's filters, sorts and stats line. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_TANK, filterTank, tankActive, tankStats, reactionCount, topReaction } from "../js/fishtank.js";

const H = 3600e3, DAY = 24 * H;
const NOW = new Date(2026, 5, 15, 12).getTime();
let n = 0;
const fish = (uid, species, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz: null, lengthIn: null, caughtAt: NOW - H, notes: "", ...extra });

const walleye = fish("amy", "Walleye", { weightOz: 80, lengthIn: 22, notes: "Jig at the dam", boatId: "b1", released: true, caughtAt: NOW - 2 * H });
const pike = fish("bo", "Northern Pike", { weightOz: 120, lengthIn: 30, boatId: "b1", caughtAt: NOW - 3 * H });
const perch = fish("bo", "Yellow Perch", { lengthIn: 9, caughtAt: NOW - 20 * DAY });
const bare = fish("amy", "Walleye", { caughtAt: NOW - 4 * H });
const stringer = fish("bo", "Yellow Perch", { fishCount: 12, caughtAt: NOW - 5 * H });
const old = fish("amy", "Walleye", { weightOz: 60, caughtAt: NOW - 400 * DAY, past: true });
const catches = [walleye, pike, perch, bare, stringer, old];

const reactions = new Map([
  [pike.id, new Map([["amy", ["🔥", "👍"]], ["cy", ["🔥"]]])],
  [perch.id, new Map([["amy", ["😂"]]])],
]);
const comments = new Map([[perch.id, [{}, {}]], [walleye.id, [{}]]]);
const tackle = new Map([[walleye.id, { uid: "amy", itemId: "jig1" }], [pike.id, { uid: "bo" }]]);
const run = f => filterTank({ catches, f: { ...NO_TANK, ...f }, now: NOW, reactions, comments, tackle }).map(c => c.id);

test("no filters: every catch, newest caught first, throwbacks included", () => {
  assert.deepEqual(run({}), [walleye, pike, bare, stringer, perch, old].map(c => c.id));
  assert.equal(tankActive(NO_TANK), 0);
});

test("oldest first", () => {
  assert.deepEqual(run({ sort: "old" }), [old, perch, stringer, bare, pike, walleye].map(c => c.id));
});

test("heaviest and longest list measured fish only, biggest first", () => {
  assert.deepEqual(run({ sort: "heavy" }), [pike, walleye, old].map(c => c.id));
  assert.deepEqual(run({ sort: "long" }), [pike, walleye, perch].map(c => c.id));
});

test("most reactions and most comments, ties newest first", () => {
  assert.deepEqual(run({ sort: "reactions" }).slice(0, 3), [pike, perch, walleye].map(c => c.id));
  assert.deepEqual(run({ sort: "comments" }).slice(0, 3), [perch, walleye, pike].map(c => c.id));
});

test("boat, lure, released, measured and notes filters", () => {
  assert.deepEqual(run({ boat: "b1" }), [walleye.id, pike.id]);
  assert.deepEqual(run({ lure: "jig1" }), [walleye.id]);
  assert.deepEqual(run({ released: "yes" }), [walleye.id]);
  assert.equal(run({ released: "no" }).includes(walleye.id), false);
  assert.deepEqual(run({ measuredOnly: true }), [walleye, pike, perch, old].map(c => c.id));
  assert.deepEqual(run({ notesOnly: true }), [walleye.id]);
  assert.equal(tankActive({ ...NO_TANK, boat: "b1", measuredOnly: true, sort: "old", q: " dam " }), 4);
});

test("angler, species, when, throwbacks and words", () => {
  assert.deepEqual(run({ angler: "bo", species: "Yellow Perch" }), [stringer.id, perch.id]);
  assert.deepEqual(run({ when: "7d", species: "Walleye" }), [walleye.id, bare.id]);
  assert.deepEqual(run({ show: "past" }), [old.id]);
  assert.equal(run({ show: "current" }).includes(old.id), false);
  assert.deepEqual(run({ q: "DAM jig" }), [walleye.id]);
});

test("stats line: a stringer counts its fish; heaviest is the heaviest weighed fish", () => {
  const s = tankStats([walleye, pike, stringer, bare]);
  assert.equal(s.catches, 4);
  assert.equal(s.fish, 15);
  assert.equal(s.species, 3);
  assert.equal(s.heaviest, pike);
  assert.equal(tankStats([bare]).heaviest, null);
});

test("reaction count and the most-used emoji", () => {
  assert.equal(reactionCount(reactions, pike.id), 3);
  assert.equal(reactionCount(reactions, "nope"), 0);
  assert.equal(topReaction(reactions, pike.id), "🔥");
  assert.equal(topReaction(reactions, "nope"), "");
});
