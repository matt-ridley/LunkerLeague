// Unit tests for estimated weight from length. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateWeightOz, estimatedWeight, hasEstimate, ESTIMATED_SPECIES } from "../js/estimate.js";
import { SPECIES } from "../js/species.js";

const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got} not within ${tol} of ${want}`);

test("estimates match the standard weight charts for common fish", () => {
  near(estimateWeightOz("Largemouth Bass", 20), 75, 1);  // about 4 lb 11 oz
  near(estimateWeightOz("Walleye", 20), 50, 1);          // about 3 lb 2 oz
  near(estimateWeightOz("Northern Pike", 30), 108, 1);   // about 6 lb 12 oz
  near(estimateWeightOz("Muskie", 40), 302, 2);          // about 18 lb 14 oz
  near(estimateWeightOz("Smallmouth Bass", 18), 54, 1);  // about 3 lb 6 oz
});

test("estimates are whole ounces, or tenths under an ounce, and grow with length", () => {
  assert.ok(Number.isInteger(estimateWeightOz("Walleye", 16.25)));
  const tiny = estimateWeightOz("Bluegill", 3.25);
  assert.ok(tiny < 1 && tiny > 0 && Math.round(tiny * 10) === tiny * 10);
  assert.ok(estimateWeightOz("Walleye", 25) > estimateWeightOz("Walleye", 24));
});

test("no estimate without a formula, or outside the lengths it covers", () => {
  assert.equal(estimateWeightOz("Lake Sturgeon", 50), null);
  assert.equal(estimateWeightOz("Made-up Fish", 10), null);
  assert.equal(estimateWeightOz("Muskie", 14), null);   // under 380 mm
  assert.equal(estimateWeightOz("Goldeye", 20), null);  // over 470 mm
  assert.equal(estimateWeightOz("Walleye", 0), null);
  assert.equal(estimateWeightOz("Walleye", null), null);
});

test("only a measured, unweighed single fish gets an estimate", () => {
  assert.ok(estimatedWeight({ species: "Walleye", lengthIn: 20, weightOz: null }) > 0);
  assert.equal(estimatedWeight({ species: "Walleye", lengthIn: 20, weightOz: 48 }), null);
  assert.equal(estimatedWeight({ species: "Walleye", lengthIn: null, weightOz: null }), null);
  assert.equal(estimatedWeight({ species: "Walleye", fishCount: 6, limit: true }), null);
});

test("every formula is for a species the app offers (so the spellings match)", () => {
  const offered = new Set(SPECIES);
  assert.ok(ESTIMATED_SPECIES.length >= 30);
  for (const s of ESTIMATED_SPECIES) assert.ok(offered.has(s), s);
  for (const s of ["Largemouth Bass", "Muskie", "Steelhead", "Cisco"]) assert.ok(hasEstimate(s));
});
