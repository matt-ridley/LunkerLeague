// Unit tests for the storage meter. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateStorage, docsBytes, fmtBytes, FREE_BYTES } from "../js/storage.js";

const MB = 1024 ** 2;

test("photos with a recorded size count exactly; older ones are estimated", () => {
  const e = estimateStorage({ photos: { total: 10, sized: 6, sizedBytes: 6 * 200 * 1024 }, docs: 0, catches: 0 });
  const withTackle = estimateStorage({ photos: { total: 10, sized: 6, sizedBytes: 6 * 200 * 1024, tackleBytes: 50 * 1024 }, docs: 0, catches: 0 });
  assert.equal(withTackle.used - e.used, Math.round(50 * 1024 * 1.1));
  assert.equal(withTackle.perCatch, e.perCatch); // tackle photos aren't part of a catch
  assert.equal(e.used, Math.round((6 * 200 * 1024 + 4 * 400 * 1024) * 1.1));
});

test("room left uses the real average photo once there are enough", () => {
  const e = estimateStorage({ photos: { total: 100, sized: 100, sizedBytes: 100 * 250 * 1024 }, docs: 100 * 50 * 1024, catches: 100 });
  assert.equal(e.perCatch, Math.round(300 * 1024 * 1.1));
  assert.equal(e.catchesLeft, Math.floor((FREE_BYTES - e.used) / e.perCatch));
  assert.ok(e.catchesLeft > 3000 && e.catchesLeft < 3200);
});

test("a full league shows 100% and no room", () => {
  const e = estimateStorage({ photos: { total: 3000, sized: 0, sizedBytes: 0 }, docs: 0, catches: 3000 });
  assert.equal(e.pct, 100);
  assert.equal(e.catchesLeft, 0);
});

test("document sizes and friendly units", () => {
  assert.equal(docsBytes([{ a: 1 }, { b: "xx" }]), 7 + 100 + 10 + 100);
  assert.equal(fmtBytes(512 * 1024), "512 KB");
  assert.equal(fmtBytes(312 * MB), "312 MB");
  assert.equal(fmtBytes(FREE_BYTES), "1.00 GB");
});
