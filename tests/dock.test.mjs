// Unit tests for The Dock's lists. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { anglerRoster, tackleBoxes } from "../js/dock.js";

const members = [
  { id: "cy", displayName: "Cy" },
  { id: "amy", displayName: "Amy" },
  { id: "bo", displayName: "Bo" },
  { id: "old", displayName: "Al", suspended: true },
];

test("the anglers list: active anglers A to Z with fish caught this year and their latest fish", () => {
  const catches = [
    { id: "1", uid: "amy", caughtAt: 50 }, { id: "2", uid: "amy", caughtAt: 120, fishCount: 6 }, { id: "3", uid: "amy", caughtAt: 300, dq: true },
    { id: "4", uid: "bo", caughtAt: 40 },
  ];
  const list = anglerRoster({ members, catches, yearStart: 100 });
  assert.deepEqual(list.map(r => [r.member.id, r.ytdFish, r.lastAt]), [["amy", 6, 120], ["bo", 0, 40], ["cy", 0, null]]);
});

test("everyone's tackle boxes: yours first, then the fullest, then A to Z; retired tackle isn't counted", () => {
  const items = new Map([
    ["1", { uid: "cy" }], ["2", { uid: "cy" }], ["3", { uid: "amy" }], ["4", { uid: "bo", retired: true }], ["5", { uid: "old" }],
  ]);
  assert.deepEqual(tackleBoxes({ members, items, me: "bo" }).map(b => [b.member.id, b.items]), [["bo", 0], ["cy", 2], ["amy", 1]]);
  assert.deepEqual(tackleBoxes({ members, items, me: "amy" }).map(b => b.member.id), ["amy", "cy", "bo"]);
});
