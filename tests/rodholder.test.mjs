// Unit tests for the rod holder. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLength, fmtLength, rodLine, reelLine, currentReel, reelAt, rodSpells, reelSpells, rodOf, mountChanges, endRod,
  endReelChanges, gearCatches, gearStats, pickerCombos, startRod, luckyCombo, lineDays, brokenRods, rodFishAt, reelRodsAt, rodsSaved, ended } from "../js/rodholder.js";

const rod = (id, uid, reels = [], extra = {}) => [id, { id, uid, kind: "rod", name: id, reels, status: "active", createdAt: 1, ...extra }];
const reel = (id, uid, extra = {}) => [id, { id, uid, kind: "reel", name: id, status: "active", createdAt: 1, ...extra }];
const c = (id, uid, caughtAt, extra = {}) => [id, { id, uid, species: "Walleye", caughtAt, createdAt: caughtAt, ...extra }];
const t = (uid, rodId, reelId, extra = {}) => ({ uid, lure: "", depthFt: null, technique: "", shared: true, rodId, reelId, ...extra });

test("rod lengths: feet and inches, decimal feet, or inches", () => {
  assert.equal(parseLength("6'6"), 78);
  assert.equal(parseLength("6' 6\""), 78);
  assert.equal(parseLength("6 6"), 78);
  assert.equal(parseLength("7'"), 84);
  assert.equal(parseLength("7ft"), 84);
  assert.equal(parseLength("6.5"), 78);
  assert.equal(parseLength("78"), 78);
  assert.equal(parseLength("30 in"), 30);
  assert.equal(parseLength(""), null);
  assert.ok(Number.isNaN(parseLength("long")));
  assert.ok(Number.isNaN(parseLength("1")));      // 12 inches: too short
  assert.ok(Number.isNaN(parseLength("300")));
  assert.equal(fmtLength(78), "6'6\"");
  assert.equal(fmtLength(84), "7'0\"");
  assert.equal(fmtLength(null), "");
});

test("rods and reels read as one line", () => {
  assert.equal(rodLine({ type: "spinning", lengthIn: 78, power: "ML", action: "fast" }), "Spinning · 6'6\" · Medium light · Fast");
  assert.equal(reelLine({ type: "spinning", size: "2500", line: "10 lb braid" }), "Spinning · 2500 · 10 lb braid");
  assert.equal(rodLine({}), "");
});

test("a rod's reel now, at a time, and its spells", () => {
  const [, r] = rod("r1", "me", [{ reelId: "a", at: 10 }, { reelId: null, at: 20 }, { reelId: "b", at: 30 }]);
  assert.equal(currentReel(r), "b");
  assert.equal(currentReel({ ...r, status: "broken" }), null);
  assert.equal(reelAt(r, 5), "a");    // before the first reel: the first reel
  assert.equal(reelAt(r, 15), "a");
  assert.equal(reelAt(r, 25), null);
  assert.equal(reelAt(r, 30), "b");
  assert.deepEqual(rodSpells(r), [{ reelId: "a", from: 10, to: 20 }, { reelId: "b", from: 30, to: null }]);
  assert.equal(currentReel({ kind: "rod", status: "active" }), null);
});

test("putting a reel on a rod takes it off the rod it was on", () => {
  const gear = new Map([rod("r1", "me", [{ reelId: "a", at: 10 }]), rod("r2", "me", [{ reelId: "b", at: 10 }]), reel("a", "me"), reel("b", "me")]);
  const ch = mountChanges("r2", "a", gear, 50);
  assert.deepEqual(ch.get("r1"), [{ reelId: "a", at: 10 }, { reelId: null, at: 50 }]);
  assert.deepEqual(ch.get("r2"), [{ reelId: "b", at: 10 }, { reelId: "a", at: 50 }]);
  // The same reel again: nothing to do. Taking it off: one entry.
  assert.equal(mountChanges("r1", "a", gear, 50).size, 0);
  assert.deepEqual(mountChanges("r1", null, gear, 60).get("r1"), [{ reelId: "a", at: 10 }, { reelId: null, at: 60 }]);
  assert.equal(mountChanges("nope", "a", gear, 50).size, 0);
});

test("a rod that breaks drops its reel; a worn-out reel comes off its rod", () => {
  const gear = new Map([rod("r1", "me", [{ reelId: "a", at: 10 }]), reel("a", "me")]);
  assert.deepEqual(endRod(gear.get("r1"), "broken", 40), { status: "broken", endedAt: 40, reels: [{ reelId: "a", at: 10 }, { reelId: null, at: 40 }] });
  assert.deepEqual(endRod({ ...gear.get("r1"), reels: [] }, "active", 40), { status: "active", endedAt: null });
  assert.deepEqual(endReelChanges("a", gear, 40).get("r1"), [{ reelId: "a", at: 10 }, { reelId: null, at: 40 }]);
  assert.equal(endReelChanges("b", gear, 40).size, 0);
});

test("which rod a reel is on, and every rod it has been on", () => {
  const gear = new Map([rod("r1", "me", [{ reelId: "a", at: 10 }, { reelId: null, at: 20 }]), rod("r2", "me", [{ reelId: "a", at: 20 }]), reel("a", "me"), reel("b", "me")]);
  assert.equal(rodOf("a", gear).id, "r2");
  assert.equal(rodOf("b", gear), null);
  assert.deepEqual(reelSpells("a", gear).map(s => [s.rod.id, s.from, s.to]), [["r1", 10, 20], ["r2", 20, null]]);
});

test("a rod's catches and what it has done", () => {
  const catches = new Map([c("x", "me", 1, { weightOz: 40 }), c("y", "me", 3, { fishCount: 6 }), c("z", "me", 2, { dq: true }), c("w", "me", 4, { species: "Pike", lengthIn: 30 })]);
  const tackle = new Map([["x", t("me", "r1", "a")], ["y", t("me", "r1", "a")], ["z", t("me", "r1", "a")], ["w", t("me", "r1", "b")]]);
  const list = gearCatches("rodId", "r1", catches, tackle);
  assert.deepEqual(list.map(x => x.id), ["w", "y", "x"]);
  assert.deepEqual(gearCatches("reelId", "b", [...catches.values()], tackle).map(x => x.id), ["w"]);
  const s = gearStats(list);
  assert.equal(s.fish, 8);
  assert.deepEqual(s.species, [["Walleye", 7], ["Pike", 1]]);
  assert.equal(s.best.id, "x");
  assert.deepEqual([s.first, s.last], [1, 4]);
  assert.equal(gearStats([]).best, null);
});

test("the picker: my rods in use, most recently used first, each with its reel", () => {
  const gear = new Map([rod("r1", "me", [{ reelId: "a", at: 1 }], { createdAt: 1 }), rod("r2", "me", [], { createdAt: 2 }),
    rod("r3", "me", [], { status: "broken" }), rod("r4", "you"), reel("a", "me")]);
  const catches = new Map([c("x", "me", 10)]);
  const tackle = new Map([["x", t("me", "r1", "a")]]);
  const combos = pickerCombos(gear, "me", catches, tackle);
  assert.deepEqual(combos.map(x => [x.rod.id, x.reel && x.reel.id]), [["r1", "a"], ["r2", null]]);
});

test("a new catch starts with the rod from the last catch, or my only rod", () => {
  const gear = new Map([rod("r1", "me"), rod("r2", "me")]);
  const catches = new Map([c("x", "me", 10), c("y", "me", 20)]);
  assert.equal(startRod("me", gear, catches, new Map([["x", t("me", "r1")], ["y", t("me", "r2")]])), "r2");
  assert.equal(startRod("me", gear, catches, new Map()), null);                       // two rods, never used one
  assert.equal(startRod("me", new Map([rod("r1", "me")]), catches, new Map()), "r1"); // only one rod
  const broke = new Map([rod("r1", "me"), rod("r2", "me", [], { status: "broken" })]);
  assert.equal(startRod("me", broke, catches, new Map([["y", t("me", "r2")]])), "r1"); // last one broke: the only rod left
  const twoLeft = new Map([...broke, rod("r3", "me")]);
  assert.equal(startRod("me", twoLeft, catches, new Map([["y", t("me", "r2")]])), null); // two left: nothing picked
});

test("the lucky combo is the rod and reel together with the most fish", () => {
  const gear = new Map([rod("r1", "me"), rod("r2", "me"), reel("a", "me"), reel("b", "me")]);
  const catches = new Map([c("x", "me", 1), c("y", "me", 2), c("z", "me", 3, { fishCount: 5 }), c("q", "you", 4)]);
  const tackle = new Map([["x", t("me", "r1", "a")], ["y", t("me", "r1", "a")], ["z", t("me", "r2", "b")], ["q", t("you", "r1", "a")]]);
  const l = luckyCombo("me", gear, catches, tackle);
  assert.deepEqual([l.rod.id, l.reel.id, l.fish], ["r2", "b", 5]);
  assert.equal(luckyCombo("nobody", gear, catches, tackle), null);
});

test("line age in days", () => {
  assert.equal(lineDays({ lineAt: 0 }), null);
  assert.equal(lineDays({ lineAt: 1000 }, 1000 + 3 * 86400000), 3);
});

test("broken rods and the badge facts use shared tackle only", () => {
  const gear = new Map([rod("r1", "me", [], { status: "broken", endedAt: 50 }), rod("r2", "me", [], { createdAt: 5 }), reel("a", "me", { status: "worn", endedAt: 70 })]);
  const catches = new Map([c("x", "me", 1, { fishCount: 3 }), c("y", "me", 2), c("z", "me", 3)]);
  const tackle = new Map([["x", t("me", "r1", "a")], ["y", t("me", "r1", "a", { shared: false })], ["z", t("me", "r1", "a")]]);
  assert.deepEqual(brokenRods(gear, catches, tackle).map(b => [b.rod.id, b.at, b.fish]), [["r1", 50, 4]]);
  const counted = [...catches.values()];
  assert.equal(rodFishAt("me", 4, gear, counted, tackle), 3);
  assert.equal(rodFishAt("me", 5, gear, counted, tackle), null);
  assert.deepEqual(rodsSaved("me", gear), [1, 5]);
  assert.deepEqual(ended("me", gear, "rod", "broken"), [50]);
  assert.deepEqual(ended("me", gear, "reel", "worn"), [70]);
});

test("a reel that has been on three rods", () => {
  const gear = new Map([rod("r1", "me", [{ reelId: "a", at: 10 }, { reelId: null, at: 20 }]), rod("r2", "me", [{ reelId: "a", at: 20 }, { reelId: null, at: 30 }]),
    rod("r3", "me", [{ reelId: "a", at: 30 }]), reel("a", "me")]);
  assert.equal(reelRodsAt("me", 3, gear), 30);
  assert.equal(reelRodsAt("me", 4, gear), null);
});
