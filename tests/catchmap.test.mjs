// Unit tests for the map of catches. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSpots, mapSpecies } from "../js/catchmap.js";

const c = (id, uid, species, caughtAt, extra = {}) => ({ id, uid, species, caughtAt, ...extra });
const catches = [
  c("a", "me", "Walleye", 1), c("b", "me", "Walleye", 3), c("d", "me", "Muskie", 2),
  c("e", "you", "Walleye", 4), c("f", "you", "Northern Pike", 5), c("g", "me", "Walleye", 6, { dq: true }), c("h", "me", "Walleye", 7),
];
const spots = new Map([
  ["a", { lat: 44.12341, lng: -79.5, shared: false, uid: "me" }],
  ["b", { lat: 44.12344, lng: -79.50001, shared: false, uid: "me", name: "Secret hump" }], // same spot as a
  ["d", { lat: 44.2, lng: -79.6, shared: true, uid: "me", name: "North bay" }],
  ["e", { lat: 44.2, lng: -79.6, shared: true, uid: "you" }],                               // same as d, someone else's
  ["f", { lat: 45, lng: -80, shared: true, uid: "you" }],
  ["g", { lat: 46, lng: -81, shared: true, uid: "me" }],
]);

test("mine: all my spots, private ones too, grouped, most catches first", () => {
  const g = mapSpots({ catches, spots, me: "me", view: "mine" });
  assert.deepEqual(g.map(x => [x.shared, x.catches.map(y => y.id)]), [[false, ["b", "a"]], [true, ["d"]]]);
  assert.equal(g[0].name, "Secret hump");
});

test("league: everyone's shared spots only; disqualified catches and catches with no spot are left out", () => {
  const g = mapSpots({ catches, spots, me: "me", view: "league" });
  assert.deepEqual(g.map(x => x.catches.map(y => y.id)), [["e", "d"], ["f"]]);
  assert.ok(g.every(x => x.shared));
});

test("filtering by species, and the species to offer", () => {
  assert.deepEqual(mapSpots({ catches, spots, me: "me", view: "league", species: "Walleye" }).map(x => x.catches.map(y => y.id)), [["e"]]);
  assert.deepEqual(mapSpecies({ catches, spots, me: "me", view: "mine" }), ["Walleye", "Muskie"]);
  assert.deepEqual(mapSpecies({ catches, spots, me: "me", view: "league" }), ["Muskie", "Northern Pike", "Walleye"]);
});
