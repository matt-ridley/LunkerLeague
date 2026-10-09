// Unit tests for stepping through catches. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { browseSpot } from "../js/browse.js";

const b = { ids: ["a", "b", "c", "d"], from: "tank" };

test("where a catch sits in the list, with the fish either side", () => {
  assert.deepEqual(browseSpot("a", undefined, b), { i: 0, n: 4, prev: null, next: "b" });
  assert.deepEqual(browseSpot("c", undefined, b), { i: 2, n: 4, prev: "b", next: "d" });
  assert.deepEqual(browseSpot("d", undefined, b), { i: 3, n: 4, prev: "c", next: null });
});

test("a catch not in the list, no list, or a list of one: no stepping", () => {
  assert.equal(browseSpot("z", undefined, b), null);
  assert.equal(browseSpot("a", undefined, null), null);
  assert.equal(browseSpot("a", undefined, { ids: ["a"], from: "feed" }), null);
});

test("catches deleted since are skipped", () => {
  const gone = new Set(["b"]);
  assert.deepEqual(browseSpot("c", id => !gone.has(id), b), { i: 1, n: 3, prev: "a", next: "d" });
});
