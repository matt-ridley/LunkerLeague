// Unit tests for where a catch's square thumbnail sits on its photo. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { focusAt, frameRect, isCentred, focusStyle } from "../js/thumbfocus.js";

test("a tap centres the square there on a wide photo, stopping at the edges", () => {
  // 2:1 photo: the square is half the width, so it can slide from 0 to 0.5 of the width.
  assert.deepEqual(focusAt(0.5, 0.5, 2), { x: 50, y: 50 });
  assert.deepEqual(focusAt(0.25, 0.9, 2), { x: 0, y: 50 });   // as far left as it goes; height always fits
  assert.deepEqual(focusAt(0.6, 0.5, 2), { x: 70, y: 50 });
  assert.deepEqual(focusAt(1, 0.5, 2), { x: 100, y: 50 });
});

test("on a tall photo the square slides up and down instead", () => {
  assert.deepEqual(focusAt(0.1, 0.2, 0.75), { x: 50, y: 0 });
  assert.deepEqual(focusAt(0.9, 0.625, 0.75), { x: 50, y: 100 });
  assert.deepEqual(focusAt(0.5, 0.5, 1), { x: 50, y: 50 });   // a square photo has nowhere to slide
});

test("the frame drawn on the photo matches the focus", () => {
  assert.deepEqual(frameRect(null, 2), { left: 0.25, top: 0, w: 0.5, h: 1 });
  assert.deepEqual(frameRect({ x: 100, y: 50 }, 2), { left: 0.5, top: 0, w: 0.5, h: 1 });
  const r = frameRect({ x: 50, y: 0 }, 0.5);
  assert.deepEqual(r, { left: 0, top: 0, w: 1, h: 0.5 });
});

test("the middle needs no style; anything else sets object-position", () => {
  assert.ok(isCentred(null) && isCentred({ x: 50, y: 50 }));
  assert.equal(focusStyle({}), null);
  assert.equal(focusStyle({ focus: { x: 50, y: 50 } }), null);
  assert.equal(focusStyle({ focus: { x: 20, y: 50 } }), "object-position:20% 50%");
});
