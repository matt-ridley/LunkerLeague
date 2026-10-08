// Unit tests for tackle on a catch. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLure, lureKey, parseDepth, hasTackle, tackleText, lureSuggestions, techniqueName, COMMON_LURES } from "../js/tackle.js";

test("lures are tidied and grouped regardless of case and spacing", () => {
  assert.equal(cleanLure("  Chartreuse   jig "), "Chartreuse jig");
  assert.equal(cleanLure("x".repeat(80)).length, 60);
  assert.equal(lureKey("Chartreuse Jig"), lureKey("chartreuse  jig!"));
  assert.notEqual(lureKey("Jig"), lureKey("Jig and minnow"));
});

test("depth is optional, in feet, over 0 and up to 1000", () => {
  assert.equal(parseDepth(""), null);
  assert.equal(parseDepth("  "), null);
  assert.equal(parseDepth("12"), 12);
  assert.equal(parseDepth("12,25"), 12.3);
  assert.ok(Number.isNaN(parseDepth("0")));
  assert.ok(Number.isNaN(parseDepth("-4")));
  assert.ok(Number.isNaN(parseDepth("1001")));
  assert.ok(Number.isNaN(parseDepth("deep")));
});

test("tackle counts as set when any part is filled in, and reads as one line", () => {
  assert.equal(hasTackle(null), false);
  assert.equal(hasTackle({ lure: "", depthFt: null, technique: "" }), false);
  assert.equal(hasTackle({ lure: "", depthFt: 8, technique: "" }), true);
  assert.equal(tackleText({ lure: "Jig", depthFt: 12, technique: "jigging" }), "Jig · 12 ft · Jigging");
  assert.equal(tackleText({ lure: "", depthFt: null, technique: "livebait" }), "Live bait");
  assert.equal(techniqueName("nope"), "");
});

test("lure suggestions put your own lures first, most used first, without repeating the common ones", () => {
  const mine = [{ lure: "Jig" }, { lure: "Pink spoon" }, { lure: "pink  spoon" }, { lure: "" }, null];
  const s = lureSuggestions(mine);
  assert.deepEqual(s.slice(0, 2), ["Pink spoon", "Jig"]);
  assert.equal(s.filter(l => lureKey(l) === "jig").length, 1);
  assert.equal(s.length, 2 + COMMON_LURES.length - 1);
});
