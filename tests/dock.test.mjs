// Unit tests for The Dock's lists. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { anglerRoster, sortRoster, rosterPlaces, tackleBoxes } from "../js/dock.js";

const members = [
  { id: "cy", displayName: "Cy" },
  { id: "amy", displayName: "Amy" },
  { id: "bo", displayName: "Bo" },
  { id: "old", displayName: "Al", suspended: true },
];

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();

test("the anglers list: this season only counts league catches, so a fish before an admin-set league start doesn't count", () => {
  // The league started on June 1 2026: Amy's May fish is a past (logbook) catch, flagged by the app.
  const catches = [
    { id: "1", uid: "amy", species: "Walleye", caughtAt: at(2026, 4, 20), past: true },
    { id: "2", uid: "amy", species: "Walleye", caughtAt: at(2026, 6, 1), fishCount: 6 },
    { id: "3", uid: "amy", species: "Pike", caughtAt: at(2026, 6, 2), dq: true },
    { id: "4", uid: "bo", species: "Pike", caughtAt: at(2025, 6, 1) },
  ];
  const list = anglerRoster({ members, catches, year: 2026 });
  assert.deepEqual(list.map(r => [r.member.id, r.fish, r.lastAt]), [["amy", 6, at(2026, 6, 1)], ["bo", 0, at(2025, 6, 1)], ["cy", 0, null]]);
  const career = anglerRoster({ members, catches, year: 2026, period: "career" });
  assert.deepEqual(career.map(r => [r.member.id, r.fish]), [["amy", 6], ["bo", 1], ["cy", 0]]);
});

test("the anglers list: species, PBs, records, heaviest, longest and days out", () => {
  const catches = [
    { id: "1", uid: "amy", species: "Walleye", weightOz: 40, lengthIn: 20, caughtAt: at(2026, 6, 1, 8) },
    { id: "2", uid: "amy", species: "Walleye", weightOz: 50, caughtAt: at(2026, 6, 1, 15) },
    { id: "3", uid: "amy", species: "Pike", lengthIn: 30, caughtAt: at(2026, 6, 3) },
    { id: "4", uid: "bo", species: "Walleye", weightOz: 60, lengthIn: 22, caughtAt: at(2025, 6, 1) },
    { id: "5", uid: "bo", species: "Perch", caughtAt: at(2026, 6, 4), fishCount: 10 },
    { id: "6", uid: "cy", species: "Bass", weightOz: 99, caughtAt: at(2010, 6, 1), past: true },
  ];
  const row = (list, id) => list.find(r => r.member.id === id);
  const season = anglerRoster({ members, catches, year: 2026 });
  // Amy tops this season's walleye weight and length boards and the pike length board; Bo's 2025 walleye is last season's.
  assert.deepEqual(["fish", "species", "pbs", "records", "biggest", "longest", "daysOut"].map(k => row(season, "amy")[k]), [3, 2, 2, 3, 50, 30, 2]);
  assert.deepEqual(["fish", "species", "pbs", "records", "biggest", "longest", "daysOut"].map(k => row(season, "bo")[k]), [10, 1, 0, 0, null, null, 1]);
  // Career: Bo's 2025 walleye is the league record both ways; Cy's logbook fish is a PB but never a record or a fish.
  const career = anglerRoster({ members, catches, year: 2026, period: "career" });
  assert.deepEqual(["fish", "pbs", "records", "biggest"].map(k => row(career, "bo")[k]), [11, 1, 2, 60]);
  assert.deepEqual(["fish", "pbs", "records", "biggest"].map(k => row(career, "amy")[k]), [3, 2, 1, 50]);
  assert.deepEqual(["fish", "pbs", "records", "biggest"].map(k => row(career, "cy")[k]), [0, 1, 0, null]);
  // All time: Cy's logbook bass counts as a fish, an all-time record (weight) and the heaviest, and as their last fish.
  const all = anglerRoster({ members, catches, year: 2026, period: "alltime" });
  assert.deepEqual(["fish", "species", "pbs", "records", "biggest", "daysOut", "lastAt"].map(k => row(all, "cy")[k]), [1, 1, 1, 1, 99, 1, at(2010, 6, 1)]);
  assert.deepEqual(["fish", "records"].map(k => row(all, "bo")[k]), [11, 2]);
});

test("the anglers list sorts by any stat, highest first, ties and names A to Z; points go by place", () => {
  const extra = new Map([["amy", { points: 5, place: 2, crowns: 1, badges: 4 }], ["bo", { points: 9, place: 1 }], ["cy", { points: 5, place: 3 }]]);
  const catches = [{ id: "1", uid: "cy", species: "Pike", weightOz: 10, caughtAt: at(2026, 1, 1) }, { id: "2", uid: "bo", species: "Pike", caughtAt: at(2026, 2, 1) }];
  const list = anglerRoster({ members, catches, year: 2026, extra });
  const ids = sort => sortRoster(list, sort).map(r => r.member.id);
  assert.deepEqual(ids("points"), ["bo", "amy", "cy"]);
  assert.deepEqual(ids("fish"), ["bo", "cy", "amy"]);
  assert.deepEqual(ids("biggest"), ["cy", "amy", "bo"]);
  assert.deepEqual(ids("lastAt"), ["bo", "cy", "amy"]);
  assert.deepEqual(ids("badges"), ["amy", "bo", "cy"]);
  assert.deepEqual(ids("name"), ["amy", "bo", "cy"]);
});

test("the anglers list numbers each place, ties sharing one", () => {
  const rows = [10, 7, 7, 3, 0].map((fish, i) => ({ member: { id: String(i), displayName: String(i) }, fish, points: fish }));
  assert.deepEqual(rosterPlaces(rows, "fish"), [1, 2, 2, 4, 5]);
  assert.deepEqual(rosterPlaces(rows, "points"), [1, 2, 2, 4, 5]);
  assert.deepEqual(rosterPlaces(rows, "name"), [1, 2, 3, 4, 5]);
  assert.deepEqual(rosterPlaces(rows.map(r => ({ ...r, biggest: null })), "biggest"), [null, null, null, null, null]);
});

test("everyone's tackle boxes: yours first, then the fullest, then A to Z; retired tackle isn't counted", () => {
  const items = new Map([
    ["1", { uid: "cy" }], ["2", { uid: "cy" }], ["3", { uid: "amy" }], ["4", { uid: "bo", retired: true }], ["5", { uid: "old" }],
  ]);
  assert.deepEqual(tackleBoxes({ members, items, me: "bo" }).map(b => [b.member.id, b.items]), [["bo", 0], ["cy", 2], ["amy", 1]]);
  assert.deepEqual(tackleBoxes({ members, items, me: "amy" }).map(b => b.member.id), ["amy", "cy", "bo"]);
});
