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

test("the anglers list: active anglers A to Z with points, place, crowns, fish and boats", () => {
  const rows = [{ uid: "bo", points: 40, title: "Guide" }, { uid: "amy", points: 12, title: "Rookie" }];
  const crowns = [{ holder: "bo" }, { holder: "bo" }, { holder: "amy" }, { holder: null }];
  const catches = [
    { id: "1", uid: "amy" }, { id: "2", uid: "amy", fishCount: 6 }, { id: "3", uid: "amy", dq: true }, { id: "4", uid: "bo" },
  ];
  const fleet = new Map([
    ["b1", { id: "b1", uid: "amy", crew: ["cy"] }],
    ["b2", { id: "b2", uid: "bo", retired: true }],
  ]);
  const list = anglerRoster({ members, rows, crowns, catches, fleet });
  assert.deepEqual(list.map(r => r.member.id), ["amy", "bo", "cy"]);
  assert.deepEqual(list.map(r => [r.points, r.place, r.title, r.crowns, r.fish]),
    [[12, 2, "Rookie", 1, 7], [40, 1, "Guide", 2, 1], [0, null, "", 0, 0]]);
  assert.deepEqual(list.map(r => r.boats.map(b => b.id)), [["b1"], [], ["b1"]]);
});

test("everyone's tackle boxes: yours first, then the fullest, then A to Z; retired tackle isn't counted", () => {
  const items = new Map([
    ["1", { uid: "cy" }], ["2", { uid: "cy" }], ["3", { uid: "amy" }], ["4", { uid: "bo", retired: true }], ["5", { uid: "old" }],
  ]);
  assert.deepEqual(tackleBoxes({ members, items, me: "bo" }).map(b => [b.member.id, b.items]), [["bo", 0], ["cy", 2], ["amy", 1]]);
  assert.deepEqual(tackleBoxes({ members, items, me: "amy" }).map(b => b.member.id), ["amy", "cy", "bo"]);
});
